'use strict';
// renweb build
// Vanilla: selectively clears build/, copies src/ → build/, fetches engine,
//          copies licenses/ and resource/, seeds JS modules.
// Vite:    delegates to the project's package manager.
// --bundle Download a bundle release (exe + lib/ + bundle_exec) instead of
//          a bare executable.

const fs            = require('fs');
const path          = require('path');
const os            = require('os');
const { spawnSync } = require('child_process');
const {
    copyDir, detectTarget, fetchRelease, download,
    findProjectExecutable,
    rwExecutablesDir, rwBundlesDir, ensureRwGitignore,
} = require('./shared');
const { ProjectState } = require('../project/project_state');

// Subdirs / files inside build/ that are wiped on each build.
// Never touched: engine exe, lib/, lib-*/,  plugins/, bundle_exec*, .engine.pid
const CLEARABLE = new Set(['content', 'licenses', 'resource', 'assets', 'log.txt', 'info.json', 'config.json']);

function clearBuildOutputs(buildDir) {
    if (!fs.existsSync(buildDir)) return;
    for (const name of fs.readdirSync(buildDir)) {
        if (!CLEARABLE.has(name)) continue;
        const full = path.join(buildDir, name);
        try {
            const s = fs.statSync(full);
            if (s.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
            else fs.unlinkSync(full);
        } catch (_) {}
    }
}

/** Remove bundle artifacts (lib/, bundle_exec*) — called when switching bare→bundle is NOT wanted. */
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

/**
 * Ensure a bare engine exe is present in buildDir.
 * Checks .rw/executables/ first; fetches from GitHub and caches if absent.
 */
function ensureExecutable(projectRoot, buildDir, targetOs, targetArch) {
    if (findProjectExecutable(buildDir, targetOs, targetArch)) return true;

    const exeDir  = rwExecutablesDir(projectRoot);
    fs.mkdirSync(exeDir, { recursive: true });
    ensureRwGitignore(projectRoot);

    const pattern = new RegExp(`-${targetOs}-${targetArch}(\\.exe)?$`, 'i');

    // Check cache
    let cached = null;
    try { cached = fs.readdirSync(exeDir).find(f => pattern.test(f)) || null; } catch (_) {}
    if (cached) {
        console.log(`  Using cached executable: ${cached}`);
        const dest = path.join(buildDir, cached);
        fs.copyFileSync(path.join(exeDir, cached), dest);
        try { fs.chmodSync(dest, 0o755); } catch (_) {}
        return true;
    }

    // Fetch from GitHub
    console.log(`  Fetching engine for ${targetOs}-${targetArch}…`);
    const release = fetchRelease(null);
    if (!release) { console.warn('  ⚠ Could not reach GitHub — engine not fetched'); return false; }
    const asset = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset)   { console.warn(`  ⚠ No engine asset for ${targetOs}-${targetArch}`); return false; }

    const cachePath = path.join(exeDir, asset.name);
    if (!download(asset.browser_download_url, cachePath)) {
        console.warn('  ⚠ Download failed'); return false;
    }
    try { fs.chmodSync(cachePath, 0o755); } catch (_) {}
    const dest = path.join(buildDir, asset.name);
    fs.copyFileSync(cachePath, dest);
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    console.log(`  ✓ Engine fetched: ${asset.name}`);
    return true;
}

/**
 * Ensure bundle artifacts (lib/, bundle_exec*, exe) are present in buildDir.
 * Checks .rw/bundles/ first; fetches from GitHub and caches if absent.
 */
function ensureBundle(projectRoot, buildDir, targetOs, targetArch) {
    const bundleDir = rwBundlesDir(projectRoot);
    fs.mkdirSync(bundleDir, { recursive: true });
    ensureRwGitignore(projectRoot);

    const assetRE   = /^bundle-([\d][\w.]*)-(\w+)-([\w]+?)\.tar\.gz$/;
    const matchesTarget = (name) => { const m = assetRE.exec(name); return m && m[2] === targetOs && m[3] === targetArch; };

    // Check cache
    let cachedArchive = null;
    try { cachedArchive = fs.readdirSync(bundleDir).find(matchesTarget) || null; } catch (_) {}

    if (!cachedArchive) {
        console.log(`  Fetching bundle for ${targetOs}-${targetArch}…`);
        const release = fetchRelease(null);
        if (!release) { console.warn('  ⚠ Could not reach GitHub — bundle not fetched'); return false; }
        const asset = (release.assets || []).find(a => matchesTarget(a.name));
        if (!asset)   { console.warn(`  ⚠ No bundle asset for ${targetOs}-${targetArch}`); return false; }
        cachedArchive = asset.name;
        if (!download(asset.browser_download_url, path.join(bundleDir, cachedArchive))) {
            console.warn('  ⚠ Bundle download failed'); return false;
        }
        console.log(`  ✓ Bundle cached: ${cachedArchive}`);
    } else {
        console.log(`  Using cached bundle: ${cachedArchive}`);
    }

    // Extract into a temp dir then copy into build/
    const archivePath = path.join(bundleDir, cachedArchive);
    const tmpDir = path.join(os.tmpdir(), `renweb-bundle-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const r = spawnSync('tar', ['-xzf', archivePath, '-C', tmpDir], { stdio: 'inherit' });
    if (r.status !== 0) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
        console.warn('  ⚠ Bundle extraction failed'); return false;
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
            console.log(`  ✓ Engine: ${name}`);
        }
    }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    return true;
}

function run(args) {
    const wantBundle = args.includes('--bundle');
    const state = ProjectState.detect();
    if (!state) {
        console.error('Not inside a RenWeb project (no info.json found).');
        process.exit(1);
    }

    const { os: targetOs, arch: targetArch } = detectTarget();
    const projectRoot = state.root;
    const buildDir    = path.join(projectRoot, 'build');

    if (state.isVanilla()) {
        const layout       = state.layout();
        const src_content  = layout.content_root;
        const src_modules  = path.join(projectRoot, 'src', 'modules');
        const src_assets   = path.join(projectRoot, 'src', 'assets');
        const src_licenses = path.join(projectRoot, 'licenses');
        const src_resource = path.join(projectRoot, 'resource');

        if (!fs.existsSync(src_content)) {
            console.error('No src/content/ directory found. Is this a vanilla RenWeb project?');
            process.exit(1);
        }

        fs.mkdirSync(buildDir, { recursive: true });
        clearBuildOutputs(buildDir);

        // Manifests
        for (const f of ['info.json', 'config.json']) {
            const src = path.join(projectRoot, f);
            if (fs.existsSync(src)) fs.copyFileSync(src, path.join(buildDir, f));
        }

        // Pages + modules
        const build_content = layout.build_content_root || path.join(buildDir, 'content');
        let pages_copied = 0;
        for (const entry of fs.readdirSync(src_content, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dest_page = path.join(build_content, entry.name);
            copyDir(path.join(src_content, entry.name), dest_page);
            if (fs.existsSync(src_modules)) copyDir(src_modules, path.join(dest_page, 'modules'));
            pages_copied++;
        }

        // Assets
        if (fs.existsSync(src_assets))   copyDir(src_assets,   path.join(buildDir, 'assets'));
        // Licenses
        if (fs.existsSync(src_licenses)) copyDir(src_licenses, path.join(buildDir, 'licenses'));
        // Resources (icons, manifests)
        if (fs.existsSync(src_resource)) copyDir(src_resource, path.join(buildDir, 'resource'));

        // Engine / bundle
        if (wantBundle) {
            ensureBundle(projectRoot, buildDir, targetOs, targetArch);
        } else {
            removeBundleArtifacts(buildDir);
            ensureExecutable(projectRoot, buildDir, targetOs, targetArch);
        }

        console.log(`✓ Build complete (${pages_copied} page${pages_copied !== 1 ? 's' : ''} → build/content/).`);
        return;
    }

    // Vite-based project — delegate to package manager
    const pm  = state.pkg_manager();
    const cmd = pm.build_cmd();
    if (!cmd) {
        console.error(`No build command available for js_engine='${state.js_engine}' build_tool='${state.build_tool}'.`);
        process.exit(1);
    }
    const [bin, bin_args] = cmd;
    console.log(`Building (${state.framework})…`);
    const r = spawnSync(bin, bin_args, { cwd: projectRoot, stdio: 'inherit' });
    process.exit(r.status ?? 0);
}

module.exports = { run };
