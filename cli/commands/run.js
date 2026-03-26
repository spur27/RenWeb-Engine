'use strict';
// rw run
// Kills any previously tracked engine instance, then launches the engine.
// Prefers bundle_exec.sh/bat when present (bundle install).
// Falls back to .rw/executables/ cache or a GitHub download when no exe is
// present in build/.
// For Vite projects (react / vue / svelte / preact), also starts
// `npm run build -- --watch` and waits up to 60 s for the initial bundle
// before launching, tearing both processes down cleanly on Ctrl+C.

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
    detectTarget,
    findProjectExecutable,
    killEngine,
    saveEnginePid,
    fetchRelease,
    download,
    rwExecutablesDir,
    ensureRwGitignore,
} = require('./shared');
const { ProjectState } = require('../project/project_state');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the bundle launcher script if present in buildDir, else null. */
function findBundleExec(buildDir) {
    for (const name of ['bundle_exec.sh', 'bundle_exec.bat']) {
        const p = path.join(buildDir, name);
        if (fs.existsSync(p)) return { name, fullPath: p };
    }
    return null;
}

/**
 * Ensure the engine exe is present in buildDir.
 * Checks .rw/executables/ then downloads from GitHub if needed.
 * Returns the exe filename, or null on failure.
 */
function fetchExeToCache(projectRoot, buildDir, targetOs, targetArch) {
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
        return cached;
    }

    // Download from GitHub
    console.log(`  Fetching engine for ${targetOs}-${targetArch}…`);
    const release = fetchRelease(null);
    if (!release) { console.warn('  ⚠ Could not reach GitHub'); return null; }
    const asset = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset)   { console.warn(`  ⚠ No engine asset for ${targetOs}-${targetArch}`); return null; }

    const cachePath = path.join(exeDir, asset.name);
    if (!download(asset.browser_download_url, cachePath)) {
        console.warn('  ⚠ Download failed'); return null;
    }
    try { fs.chmodSync(cachePath, 0o755); } catch (_) {}
    const dest = path.join(buildDir, asset.name);
    fs.copyFileSync(cachePath, dest);
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    console.log(`  ✓ Engine fetched: ${asset.name}`);
    return asset.name;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function run(_args) {
    const { os: targetOs, arch: targetArch } = detectTarget();

    const state = ProjectState.detect();
    if (!state) {
        console.error('Not inside a RenWeb project (no info.json found).');
        process.exit(1);
    }

    const projectRoot = state.root;
    const buildDir    = path.join(projectRoot, 'build');

    killEngine(projectRoot);

    // Prefer bundle_exec when present (bundle install)
    const bundleExec = findBundleExec(buildDir);
    let launchPath, launchName;

    if (bundleExec) {
        launchName = bundleExec.name;
        launchPath = bundleExec.fullPath;
        try { fs.chmodSync(launchPath, 0o755); } catch (_) {}
    } else {
        let exeName = findProjectExecutable(buildDir, targetOs, targetArch);
        if (!exeName) {
            console.log('No engine executable in build/ — checking cache…');
            exeName = fetchExeToCache(projectRoot, buildDir, targetOs, targetArch);
        }
        if (!exeName) {
            console.error(`No engine executable available for ${targetOs}-${targetArch}.`);
            process.exit(1);
        }
        launchName = exeName;
        launchPath = path.join(buildDir, exeName);
        try { fs.chmodSync(launchPath, 0o755); } catch (_) {}
    }

    const isVite = state.isVite();
    let viteProc = null;

    if (isVite) {
        const [wcmd, wargs] = state.pkg_manager().watch_cmd();
        console.log(`Starting Vite watch mode (${state.framework})…`);
        viteProc = spawn(wcmd, wargs, {
            cwd: projectRoot, stdio: ['ignore', 'inherit', 'inherit'], detached: false,
        });

        const startPage = (state.info?.starting_pages || [])[0];
        const outIndex = startPage
            ? path.join(buildDir, 'content', startPage, 'index.html')
            : null;

        if (outIndex) {
            console.log('Waiting for initial Vite build…');
            let waited = 0;
            while (!fs.existsSync(outIndex) && waited < 60000) {
                await new Promise(r => setTimeout(r, 500));
                waited += 500;
            }
            if (!fs.existsSync(outIndex))
                console.warn('⚠ Build output not found after 60 s — engine may show a blank page');
        }
    }

    console.log(`Launching: ${launchName}`);
    const engineProc = spawn(launchPath, [], {
        cwd: buildDir, stdio: 'inherit', detached: false,
    });
    console.log(`Engine running (PID ${engineProc.pid}). Press Ctrl+C to stop.`);
    saveEnginePid(projectRoot, engineProc.pid);

    const cleanup = (code) => {
        if (viteProc) { try { viteProc.kill('SIGTERM'); } catch (_) {} }
        try { fs.unlinkSync(path.join(projectRoot, 'build', '.engine.pid')); } catch (_) {}
        process.exit(code ?? 0);
    };

    process.on('SIGINT',  () => { try { engineProc.kill('SIGTERM'); } catch (_) {} cleanup(0); });
    process.on('SIGTERM', () => { try { engineProc.kill('SIGTERM'); } catch (_) {} cleanup(0); });
    engineProc.on('exit', code => cleanup(code));
}

module.exports = { run };

