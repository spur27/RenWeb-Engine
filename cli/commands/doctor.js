'use strict';
// renweb doctor
// Inspect the environment and current project, report issues.

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const { findProjectExecutable } = require('./shared');
const { ProjectState } = require('../project/project_state');

const PASS = '\u2713'; // ✓
const FAIL = '\u2717'; // ✗
const WARN = '\u26a0'; // ⚠

// ─── Entry ────────────────────────────────────────────────────────────────────

function run() {
    let exitCode = 0;

    // Reporters close over the local exitCode so each run() call is independent
    const ok   = (msg) => console.log(`  ${PASS} ${msg}`);
    const fail = (msg) => { console.log(`  ${FAIL} ${msg}`); exitCode = 1; };
    const warn = (msg) => console.log(`  ${WARN} ${msg}`);
    const sect = (msg) => console.log(`\n${msg}`);

    // ── Binary helpers ──────────────────────────────────────────────────────
    function checkBin(name, installHint) {
        const r = spawnSync(name, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
        if (r.status === 0 || r.stdout) {
            const ver = (r.stdout || r.stderr || '').trim().split('\n')[0] || '';
            ok(`${name}${ver ? '  (' + ver + ')' : ''}`);
            return true;
        }
        fail(`${name} not found${installHint ? ' — ' + installHint : ''}`);
        return false;
    }

    function checkBinOptional(name, note) {
        const r = spawnSync(name, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
        if (r.status === 0 || r.stdout) {
            ok(`${name}  (optional, present)`);
        } else {
            warn(`${name} not found${note ? ' — ' + note : ''}`);
        }
    }

    // ── Node version ────────────────────────────────────────────────────────
    function checkNodeVersion() {
        const ver = process.version;
        const maj = parseInt(ver.slice(1), 10);
        if (maj >= 16) { ok(`Node.js ${ver}`); }
        else           { fail(`Node.js ${ver} — v16 or later required`); }
    }

    // ── Project checks ──────────────────────────────────────────────────────
    function checkProject() {
        const state = ProjectState.detect();
        if (!state) {
            warn('Not inside a RenWeb project (no info.json found) — project checks skipped');
            return;
        }
        sect('Project');

        if (!state.info) { fail('info.json missing or unreadable'); return; }
        ok(`info.json  (${state.info.title} v${state.info.version})`);

        if (!state.config) { fail('config.json missing'); }
        else {
            try { ok(`config.json  (${Object.keys(state.config).filter(k => k !== '__defaults__').length} page(s))`); }
            catch (_) { fail('config.json — invalid JSON'); }
        }

        // Report detected project dimensions
        const dim_parts = [state.framework];
        if (state.build_tool !== 'none') dim_parts.push(state.build_tool);
        if (state.js_engine  !== 'none') dim_parts.push(`[${state.js_engine}]`);
        ok(`State: ${dim_parts.join(' + ')}`);

        const build_dir = path.join(state.root, 'build');
        const exe_name  = findProjectExecutable(build_dir);
        if (exe_name) {
            const stat   = fs.statSync(path.join(build_dir, exe_name));
            const execOk = process.platform === 'win32' || !!(stat.mode & 0o111);
            if (execOk) ok(`Engine: ${exe_name}  (${(stat.size / 1024).toFixed(0)} KB)`);
            else        fail(`Engine: ${exe_name} exists but is not executable — run: chmod +x build/${exe_name}`);
        } else {
            fail('No engine executable found in build/ — run `rw fetch` to download it');
        }

        const pages  = (state.info && state.info.starting_pages) || [];
        const layout = state.layout();
        for (const page of pages.slice(0, 3)) {
            if (layout.pageExists(page)) ok(`content: ${page}/index.html`);
            else                         warn(`content: ${page}/index.html not found`);
        }

        const plug_dir = path.join(state.root, 'build', 'plugins');
        if (fs.existsSync(plug_dir)) {
            const plugins = fs.readdirSync(plug_dir)
                .filter(f => ['.so', '.dylib', '.dll'].some(e => f.endsWith(e)));
            ok(`Plugins: ${plugins.length} installed`);
        } else {
            ok('Plugins: none');
        }
    }

    // ── Run all checks ──────────────────────────────────────────────────────
    sect('Environment');
    checkNodeVersion();

    // curl and wget are interchangeable; only report failure if neither exists
    const hasCurl = spawnSync('curl', ['--version'], { stdio: 'ignore' }).status === 0;
    const hasWget = spawnSync('wget', ['--version'], { stdio: 'ignore' }).status === 0;
    if      (hasCurl && hasWget) ok('curl + wget  (both available)');
    else if (hasCurl)            ok('curl  (downloader)');
    else if (hasWget)            ok('wget  (downloader)');
    else                         fail('curl / wget — at least one is required for downloads');

    checkBin('git',    'needed for `rw create engine` and `rw plugin add`');
    checkBinOptional('npm',     'needed for Vite-based projects (react / vue / svelte / preact)');
    if (process.platform === 'linux')
        checkBinOptional('xdg-open', 'needed for `rw doc`');
    checkBinOptional('make',     'needed for building plugins');
    checkBinOptional('cmake',    'needed for CMake-based plugins');

    checkProject();

    console.log('');
    console.log(exitCode === 0 ? 'All checks passed.' : 'One or more checks failed — see above.');
    process.exit(exitCode);
}

module.exports = { run };

