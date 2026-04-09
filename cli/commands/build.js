'use strict';

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { spawnSync } = require('child_process');
const {
    copyDir, detectTarget, fetchRelease, download,
    findProjectExecutable,
    rwExecutablesDir, rwBundlesDir, ensureRwGitignore,
} = require('../shared/utils');
const { fetchPlugins } = require('../shared/fetchers');
const { ProjectState } = require('../project/project_state');
const ui = require('../shared/ui');

function removeBundleArtifacts(buildDir) {
    if (!fs.existsSync(buildDir)) return;
    for (const name of fs.readdirSync(buildDir)) {
        if (name !== 'lib' && !name.startsWith('bundle_exec') && !name.startsWith('lib-')) continue;
        const full = path.join(buildDir, name);
        try {
            const s = fs.statSync(full);
            if (s.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
            else fs.unlinkSync(full);
        } catch (_) {}
    }
}

function ensureExecutable(projectRoot, buildDir, targetOs, targetArch) {
    if (findProjectExecutable(buildDir, targetOs, targetArch)) return true;

    const exeDir  = rwExecutablesDir(projectRoot);
    fs.mkdirSync(exeDir, { recursive: true });
    ensureRwGitignore(projectRoot);

    const pattern = new RegExp(`-${targetOs}-${targetArch}(\\.exe)?$`, 'i');

    let cached = null;
    try { cached = fs.readdirSync(exeDir).find(f => pattern.test(f)) || null; } catch (_) {}
    if (cached) {
        ui.info(`Using cached executable: ${cached}`);
        const dest = path.join(buildDir, cached);
        fs.copyFileSync(path.join(exeDir, cached), dest);
        try { fs.chmodSync(dest, 0o755); } catch (_) {}
        return true;
    }

    ui.step(`Fetching engine for ${targetOs}-${targetArch}…`);
    const release = fetchRelease(null);
    if (!release) { ui.warn('Could not reach GitHub — engine not fetched'); return false; }
    const asset = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset)   { ui.warn(`No engine asset for ${targetOs}-${targetArch}`); return false; }

    const cachePath = path.join(exeDir, asset.name);
    if (!download(asset.browser_download_url, cachePath)) {
        ui.warn('Download failed'); return false;
    }
    try { fs.chmodSync(cachePath, 0o755); } catch (_) {}
    const dest = path.join(buildDir, asset.name);
    fs.copyFileSync(cachePath, dest);
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    ui.ok(`Engine fetched: ${asset.name}`);
    return true;
}

function ensureBundle(projectRoot, buildDir, targetOs, targetArch) {
    const bundleDir = rwBundlesDir(projectRoot);
    fs.mkdirSync(bundleDir, { recursive: true });
    ensureRwGitignore(projectRoot);

    const assetRE   = /^bundle-([\d][\w.]*)-(\w+)-([\w]+?)\.tar\.gz$/;
    const matchesTarget = (name) => { const m = assetRE.exec(name); return m && m[2] === targetOs && m[3] === targetArch; };

    let cachedArchive = null;
    try { cachedArchive = fs.readdirSync(bundleDir).find(matchesTarget) || null; } catch (_) {}

    if (!cachedArchive) {
        ui.step(`Fetching bundle for ${targetOs}-${targetArch}…`);
        const release = fetchRelease(null);
        if (!release) { ui.warn('Could not reach GitHub — bundle not fetched'); return false; }
        const asset = (release.assets || []).find(a => matchesTarget(a.name));
        if (!asset)   { ui.warn(`No bundle asset for ${targetOs}-${targetArch}`); return false; }
        cachedArchive = asset.name;
        if (!download(asset.browser_download_url, path.join(bundleDir, cachedArchive))) {
            ui.warn('Bundle download failed'); return false;
        }
        ui.ok(`Bundle cached: ${cachedArchive}`);
    } else {
        ui.info(`Using cached bundle: ${cachedArchive}`);
    }

    const archivePath = path.join(bundleDir, cachedArchive);
    const tmpDir = path.join(os.tmpdir(), `renweb-bundle-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const r = spawnSync('tar', ['-xzf', archivePath, '-C', tmpDir], { stdio: 'inherit' });
    if (r.status !== 0) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        ui.warn('Bundle extraction failed'); return false;
    }

    const exePattern = new RegExp(`-${targetOs}-${targetArch}(\\.exe)?$`, 'i');
    for (const name of fs.readdirSync(tmpDir)) {
        const src  = path.join(tmpDir, name);
        const dest = path.join(buildDir, name);
        const stat = fs.statSync(src);
        if (name === 'lib' && stat.isDirectory()) {
            if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
            copyDir(src, dest);
        } else if (name.startsWith('bundle_exec') && stat.isFile()) {
            fs.copyFileSync(src, dest);
            try { fs.chmodSync(dest, 0o755); } catch (_) {}
        } else if (exePattern.test(name) && stat.isFile()) {
            const old = findProjectExecutable(buildDir, targetOs, targetArch);
            if (old && old !== name) { try { fs.unlinkSync(path.join(buildDir, old)); } catch (_) {} }
            fs.copyFileSync(src, dest);
            try { fs.chmodSync(dest, 0o755); } catch (_) {}
            ui.ok(`Engine: ${name}`);
        }
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    return true;
}

function hasBuildScript(projectRoot, jsEngine) {
    try {
        if (jsEngine === 'node' || jsEngine === 'bun') {
            const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
            return !!pkg.scripts?.build;
        }
        if (jsEngine === 'deno') {
            const deno = JSON.parse(fs.readFileSync(path.join(projectRoot, 'deno.json'), 'utf8'));
            return !!deno.tasks?.build;
        }
    } catch (_) {}
    return false;
}

function run(args) {
    const wantBundle = args.includes('--bundle');
    const metaOnly   = args.includes('--meta-only');

    let startCwd = process.cwd();
    if (path.basename(startCwd) === 'build') startCwd = path.dirname(startCwd);

    const state = ProjectState.detect(startCwd);
    if (!state) {
        ui.error('Not inside a RenWeb project (no info.json found).');
        process.exit(1);
    }

    const { os: targetOs, arch: targetArch } = detectTarget();
    const projectRoot = state.root;
    const buildDir    = path.join(projectRoot, 'build');

    fs.mkdirSync(buildDir, { recursive: true });

    for (const f of ['info.json', 'config.json']) {
        const src = path.join(projectRoot, f);
        if (fs.existsSync(src)) fs.copyFileSync(src, path.join(buildDir, f));
    }

    for (const dir of ['licenses', 'resource']) {
        const src = path.join(projectRoot, dir);
        if (!fs.existsSync(src)) continue;
        const dest = path.join(buildDir, dir);
        if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
        copyDir(src, dest);
    }

    if (wantBundle) {
        ensureBundle(projectRoot, buildDir, targetOs, targetArch);
    } else {
        removeBundleArtifacts(buildDir);
        ensureExecutable(projectRoot, buildDir, targetOs, targetArch);
    }

    fetchPlugins(projectRoot, buildDir, targetOs, targetArch);

    if (metaOnly) return;

    const makefilePath = ['makefile', 'Makefile'].find(f => fs.existsSync(path.join(projectRoot, f)));
    if (makefilePath && state.js_engine === 'none') {
        ui.step('Building plugin (make)…');
        const r = spawnSync('make', [], { cwd: projectRoot, stdio: 'inherit' });
        process.exit(r.status ?? 0);
    }

    if (hasBuildScript(projectRoot, state.js_engine)) {
        const [bin, bin_args] = state.pkg_manager().build_cmd();
        const buildLabel = state.isVanilla() ? state.js_engine : state.framework;
        ui.step(`Building (${buildLabel})…`);
        const r = spawnSync(bin, bin_args, { cwd: projectRoot, stdio: 'inherit' });
        process.exit(r.status ?? 0);
    }

    const srcDir = path.join(projectRoot, 'src');
    if (!fs.existsSync(srcDir)) {
        ui.error('Cannot infer project structure: no build script and no src/ directory found.');
        process.exit(1);
    }

    for (const name of fs.readdirSync(srcDir)) {
        const src  = path.join(srcDir, name);
        const dest = path.join(buildDir, name);
        if (fs.statSync(src).isDirectory()) {
            if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
            copyDir(src, dest);
        } else {
            fs.copyFileSync(src, dest);
        }
    }

    ui.ok('Build complete.');
}

module.exports = { run };

