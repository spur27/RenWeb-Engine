'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const { findProjectExecutable } = require('../shared/utils');
const { ProjectState } = require('../project/project_state');
const ui = require('../shared/ui');

const PASS = '\u2713'; // ✓
const FAIL = '\u2717'; // ✗
const WARN = '\u26a0'; // ⚠

function runVersionProbe(command, args = ['--version']) {
    try {
        return spawnSync(command, args, { encoding: 'utf8', stdio: 'pipe' });
    } catch (_) {
        return null;
    }
}

function probeNpm() {
    if (process.platform === 'win32') {
        for (const [cmd, args] of [
            ['npm.cmd', ['--version']],
            ['npm',     ['--version']],
            ['cmd.exe', ['/d', '/s', '/c', 'npm --version']],
        ]) {
            const r = runVersionProbe(cmd, args);
            if (r && r.status === 0) return r;
        }
        return null;
    }

    // First try with the inherited PATH
    const r = runVersionProbe('npm', ['--version']);
    if (r && r.status === 0) return r;

    // macOS / Linux: PATH may not include npm when launched outside an
    // interactive shell (e.g. nvm, Homebrew). Try augmented PATH first.
    const extra = [
        process.env.NVM_BIN,
        process.env.NVM_DIR && require('path').join(process.env.NVM_DIR, 'versions', 'node',
            (process.env.NODE_VERSION || ''), 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/usr/bin',
    ].filter(Boolean);

    const augmented = [...extra, process.env.PATH || ''].join(':');
    const r2 = spawnSync('npm', ['--version'], {
        encoding: 'utf8', stdio: 'pipe',
        env: { ...process.env, PATH: augmented },
    });
    if (r2 && r2.status === 0) return r2;

    // Last resort: use the shell to locate npm (handles aliases and custom PATHs)
    const shell = process.env.SHELL || '/bin/sh';
    const r3 = spawnSync(shell, ['-lc', 'npm --version'], { encoding: 'utf8', stdio: 'pipe' });
    return (r3 && r3.status === 0) ? r3 : null;
}


function run() {
    let exitCode = 0;

    const ok   = (msg) => ui.ok(msg);
    const fail = (msg) => { ui.error(msg); exitCode = 1; };
    const warn = (msg) => ui.warn(msg);
    const sect = (msg) => ui.section(msg);

    function checkBin(name, installHint) {
        const r = runVersionProbe(name);
        if (r && (r.status === 0 || r.stdout)) {
            const ver = (r.stdout || r.stderr || '').trim().split('\n')[0] || '';
            ok(`${name}${ver ? '  (' + ver + ')' : ''}`);
            return true;
        }
        fail(`${name} not found${installHint ? ' — ' + installHint : ''}`);
        return false;
    }

    function checkBinOptional(name, note) {
        const r = runVersionProbe(name);
        if (r && (r.status === 0 || r.stdout)) {
            ok(`${name}  (optional, present)`);
        } else {
            warn(`${name} not found${note ? ' — ' + note : ''}`);
        }
    }

    function checkNpmOptional(note) {
        const r = probeNpm();
        if (r && r.status === 0) {
            const ver = (r.stdout || r.stderr || '').trim().split('\n')[0] || '';
            ok(`npm${ver ? '  (' + ver + ')' : ''}  (optional, present)`);
        } else {
            warn(`npm not found${note ? ' — ' + note : ''}`);
        }
    }

    function checkNodeVersion() {
        const ver = process.version;
        const maj = parseInt(ver.slice(1), 10);
        if (maj >= 16) { ok(`Node.js ${ver}`); }
        else           { fail(`Node.js ${ver} — v16 or later required`); }
    }

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

        const layout    = state.layout();
        const existing  = layout.listPages();
        const declared  = (state.info && state.info.starting_pages) || [];

        if (existing.length === 0 && !fs.existsSync(layout.content_root)) {
            if (declared.length > 0)
                warn(`content: ${path.relative(state.root, layout.content_root)} not found (declared pages: ${declared.join(', ')})`);
        } else {
            const preview = existing.slice(0, 5).join(', ') + (existing.length > 5 ? ', …' : '');
            ok(`content: ${existing.length} page(s)  (${preview})`);
            for (const page of declared) {
                if (!existing.includes(page))
                    warn(`content: declared starting page "${page}" not found`);
            }
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

    sect('Environment');
    checkNodeVersion();

    const hasCurl = spawnSync('curl', ['--version'], { stdio: 'ignore' }).status === 0;
    const hasWget = spawnSync('wget', ['--version'], { stdio: 'ignore' }).status === 0;
    if      (hasCurl && hasWget) ok('curl + wget  (both available)');
    else if (hasCurl)            ok('curl  (downloader)');
    else if (hasWget)            ok('wget  (downloader)');
    else                         fail('curl / wget — at least one is required for downloads');

    checkBin('git',    'needed for `rw create engine` and `rw plugin add`');
    checkNpmOptional('needed for Vite-based projects (react / vue / svelte / preact)');
    if (process.platform === 'linux')
        checkBinOptional('xdg-open', 'needed for `rw doc`');
    checkBinOptional('make',     'needed for building plugins');
    checkBinOptional('cmake',    'needed for CMake-based plugins');

    checkProject();

    ui.spacer();
    if (exitCode === 0) ui.ok('All checks passed.');
    else ui.error('One or more checks failed — see above.');
    process.exit(exitCode);
}

module.exports = { run };

