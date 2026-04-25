'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const {
    copyDir, detectTarget, fetchRelease, download,
    findProjectExecutable,
    rwExecutablesDir, ensureRwGitignore,
} = require('../shared/utils');
const { fetchPlugins } = require('../shared/fetchers');
const { ProjectState } = require('../project/project_state');
const ui = require('../shared/ui');

function finishBuild(result, buildLabel) {
    if (!result) {
        ui.error(`Build failed (${buildLabel}) — no process result.`);
        process.exit(1);
    }

    if (result.error) {
        ui.error(`Build failed (${buildLabel}) — ${result.error.message}`);
        process.exit(1);
    }

    if (result.status === 0) {
        ui.ok(`Build complete (${buildLabel}).`);
        process.exit(0);
    }

    ui.error(`Build failed (${buildLabel}) with exit code ${result.status}.`);
    process.exit(result.status ?? 1);
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

/** On Windows, find MSYS2/Git-for-Windows usr/bin directories and prepend them
 *  to PATH so that make shell recipes can find grep, sed, tr, xargs, etc. */
function buildMakeEnv() {
    if (process.platform !== 'win32') return process.env;

    const candidates = [
        'C:\\msys64\\usr\\bin',
        'C:\\msys32\\usr\\bin',
        'C:\\Program Files\\Git\\usr\\bin',
        'C:\\Git\\usr\\bin',
    ];

    const found = candidates.filter(p => { try { return fs.statSync(p).isDirectory(); } catch (_) { return false; } });
    if (found.length === 0) return process.env;

    return { ...process.env, PATH: found.join(path.delimiter) + path.delimiter + (process.env.PATH || '') };
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

    ensureExecutable(projectRoot, buildDir, targetOs, targetArch);

    fetchPlugins(projectRoot, buildDir, targetOs, targetArch);

    if (metaOnly) return;

    const makefilePath = ['makefile', 'Makefile'].find(f => fs.existsSync(path.join(projectRoot, f)));
    if (makefilePath && state.js_engine === 'none') {
        ui.step('Building plugin (make)…');
        const makeEnv = buildMakeEnv();
        const r = spawnSync('make', [], { cwd: projectRoot, stdio: 'inherit', env: makeEnv });
        finishBuild(r, 'plugin');
    }

    if (hasBuildScript(projectRoot, state.js_engine)) {
        const pm = state.pkg_manager();
        const buildLabel = state.isVanilla() ? state.js_engine : state.framework;
        ui.step(`Building (${buildLabel})…`);
        const r = pm.run('build');
        finishBuild(r, buildLabel);
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

