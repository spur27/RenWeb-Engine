'use strict';
// renweb plugin <subcommand> [args]
// Subcommands: add <repo-url>   — clone, build, install .so/.dylib/.dll
//              remove <name>    — delete from build/plugins/
//              list             — show installed plugins

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const { findProjectRoot } = require('./shared');

const SHARED_EXTS = ['.so', '.dylib', '.dll'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pluginsDir(projectRoot) {
    return path.join(projectRoot, 'build', 'plugins');
}

/** Returns basenames of installed plugin libraries in build/plugins/. */
function listInstalledLibs(projectRoot) {
    const dir = pluginsDir(projectRoot);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => SHARED_EXTS.some(ext => f.endsWith(ext)));
}

/** Best-effort: find the shared lib produced by running make in srcDir. */
function findBuiltLib(srcDir) {
    for (const f of fs.readdirSync(srcDir)) {
        if (SHARED_EXTS.some(ext => f.endsWith(ext))) return path.join(srcDir, f);
    }
    return null;
}

function assertProjectRoot() {
    const r = findProjectRoot();
    if (!r) { console.error('Not inside a RenWeb project (no info.json found)'); process.exit(1); }
    return r;
}

// ─── add ──────────────────────────────────────────────────────────────────────

function add(repoUrl) {
    if (!repoUrl) { console.error('Usage: renweb plugin add <repo-url>'); process.exit(1); }

    if (spawnSync('git', ['--version'], { stdio: 'ignore' }).status !== 0) {
        console.error('git is required for `renweb plugin add`');
        process.exit(1);
    }

    const projectRoot = assertProjectRoot();
    const plugDir     = pluginsDir(projectRoot);
    fs.mkdirSync(plugDir, { recursive: true });

    const repoName = path.basename(repoUrl.replace(/\.git$/, ''));
    const tmpDir   = path.join(os.tmpdir(), `renweb-plugin-${repoName}-${Date.now()}`);
    console.log(`\nCloning ${repoUrl}…`);
    const cloneR = spawnSync('git', ['clone', '--depth=1', repoUrl, tmpDir], { stdio: 'inherit' });
    if (cloneR.status !== 0) { console.error('git clone failed'); process.exit(cloneR.status); }

    const hasMakefile = fs.existsSync(path.join(tmpDir, 'Makefile'));
    const hasCmake    = fs.existsSync(path.join(tmpDir, 'CMakeLists.txt'));

    if (hasMakefile) {
        console.log('Building with make…');
        const r = spawnSync('make', [], { cwd: tmpDir, stdio: 'inherit' });
        if (r.status !== 0) { console.error('make failed'); process.exit(r.status); }
    } else if (hasCmake) {
        console.log('Building with cmake…');
        const buildDir = path.join(tmpDir, '_build');
        fs.mkdirSync(buildDir, { recursive: true });
        const cfg = spawnSync('cmake', ['..', '-DCMAKE_BUILD_TYPE=Release'], { cwd: buildDir, stdio: 'inherit' });
        if (cfg.status !== 0) { console.error('cmake configure failed'); process.exit(cfg.status); }
        const bld = spawnSync('cmake', ['--build', '.', '--config', 'Release'], { cwd: buildDir, stdio: 'inherit' });
        if (bld.status !== 0) { console.error('cmake build failed'); process.exit(bld.status); }
    } else {
        console.error('No Makefile or CMakeLists.txt found in repository — cannot build automatically');
        process.exit(1);
    }

    const lib = findBuiltLib(tmpDir) || (hasCmake ? findBuiltLib(path.join(tmpDir, '_build')) : null);
    if (!lib) {
        console.error('Build succeeded but no .so/.dylib/.dll found — copy it to build/plugins/ manually');
        process.exit(1);
    }

    const libName = path.basename(lib);
    fs.copyFileSync(lib, path.join(plugDir, libName));
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n✓ Plugin installed: build/plugins/${libName}`);
}

// ─── remove ───────────────────────────────────────────────────────────────────

function remove(name) {
    if (!name) { console.error('Usage: renweb plugin remove <name>'); process.exit(1); }
    const projectRoot = assertProjectRoot();
    const libs        = listInstalledLibs(projectRoot);

    // Match by exact filename, stem (no extension), or substring
    const matches = libs.filter(f => {
        const stem = f.replace(/\.[^.]+$/, '');
        return f === name || stem === name || stem.includes(name) || f.includes(name);
    });

    if (matches.length === 0) {
        console.error(`No installed plugin matches "${name}"`);
        console.log('Run `renweb plugin list` to see installed plugins.');
        process.exit(1);
    }
    if (matches.length > 1) {
        console.error(`"${name}" matches multiple plugins — be more specific:`);
        matches.forEach(f => console.log(`  ${f}`));
        process.exit(1);
    }

    fs.unlinkSync(path.join(pluginsDir(projectRoot), matches[0]));
    console.log(`✓ Removed: ${matches[0]}`);
}

// ─── list ─────────────────────────────────────────────────────────────────────

function list() {
    const projectRoot = assertProjectRoot();
    const libs        = listInstalledLibs(projectRoot);
    const dir         = pluginsDir(projectRoot);

    if (libs.length === 0) { console.log('No plugins installed in build/plugins/'); return; }
    console.log(`\nInstalled plugins (${libs.length}):\n`);
    for (const f of libs) {
        const stat = fs.statSync(path.join(dir, f));
        const kb   = (stat.size / 1024).toFixed(1);
        console.log(`  ${f.padEnd(40)}  ${kb} KB`);
    }
    console.log('');
}

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const [subcmd, ...rest] = (args || []);
    switch ((subcmd || '').toLowerCase()) {
        case 'add':    return add(rest[0]);
        case 'remove': return remove(rest[0]);
        case 'list':   return list();
        default:
            console.log('Usage: renweb plugin <add|remove|list> [args]');
            console.log('  add <repo-url>   Clone, build and install a plugin');
            console.log('  remove <name>    Remove an installed plugin');
            console.log('  list             List installed plugins');
            process.exit(1);
    }
}

module.exports = { run };
