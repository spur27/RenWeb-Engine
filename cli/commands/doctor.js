'use strict';
// renweb doctor
// Inspect the environment and current project, report issues.

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const { findProjectRoot, findProjectExecutable, loadInfo } = require('./shared');

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
        const projectRoot = findProjectRoot();
        if (!projectRoot) {
            warn('Not inside a RenWeb project (no info.json found) — project checks skipped');
            return;
        }
        sect('Project');

        const info = loadInfo(projectRoot);
        if (!info) { fail('info.json missing or unreadable'); return; }
        ok(`info.json  (${info.title} v${info.version})`);

        const configPath = path.join(projectRoot, 'build', 'config.json');
        if (fs.existsSync(configPath)) {
            try { JSON.parse(fs.readFileSync(configPath, 'utf8')); ok('build/config.json'); }
            catch (_) { fail('build/config.json — invalid JSON'); }
        } else {
            fail('build/config.json missing');
        }

        const buildDir = path.join(projectRoot, 'build');
        const exeName  = findProjectExecutable(buildDir);
        if (exeName) {
            const stat   = fs.statSync(path.join(buildDir, exeName));
            const execOk = process.platform === 'win32' || !!(stat.mode & 0o111);
            if (execOk) ok(`Engine: ${exeName}  (${(stat.size / 1024).toFixed(0)} KB)`);
            else        fail(`Engine: ${exeName} exists but is not executable — run: chmod +x build/${exeName}`);
        } else {
            fail('No engine executable found in build/ — run `rw update`');
        }

        const pages = info.starting_pages || [];
        for (const page of pages.slice(0, 3)) {
            const built = path.join(buildDir, 'content', page, 'index.html');
            if (fs.existsSync(built)) ok(`build/content/${page}/index.html`);
            else                      warn(`build/content/${page}/index.html not found`);
        }

        const plugDir = path.join(buildDir, 'plugins');
        if (fs.existsSync(plugDir)) {
            const plugins = fs.readdirSync(plugDir)
                .filter(f => ['.so', '.dylib', '.dll'].some(e => f.endsWith(e)));
            ok(`Plugins: ${plugins.length} installed`);
        } else {
            ok('Plugins: none');
        }
    }

    // ── Run all checks ──────────────────────────────────────────────────────
    sect('Environment');
    checkNodeVersion();
    checkBin('curl',   'needed for downloads');
    checkBinOptional('wget',     'fallback downloader');
    checkBin('git',    'needed for `rw create repo`');
    checkBinOptional('docker',   'needed for `rw package`');
    checkBinOptional('xdg-open', 'needed for `rw doc` on Linux');
    checkBinOptional('make',     'needed for building plugins');
    checkBinOptional('cmake',    'needed for CMake-based plugins');

    checkProject();

    console.log('');
    console.log(exitCode === 0 ? 'All checks passed.' : 'One or more checks failed — see above.');
    process.exit(exitCode);
}

module.exports = { run };

