'use strict';
// renweb build [--watch]
// Run vite build from anywhere inside a RenWeb project.
// For vanilla projects, nothing to build — reports that clearly.

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const { findProjectRoot, loadInfo, detectProjectType } = require('./shared');

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const watch = args.includes('--watch') || args.includes('-w');

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
        console.error('Not inside a RenWeb project (no info.json found).');
        process.exit(1);
    }

    const type = detectProjectType(projectRoot);
    const info = loadInfo(projectRoot);
    const page = info && (info.starting_pages || [])[0];

    if (type === 'vanilla') {
        console.log('Vanilla project — no build step required.');
        if (page) console.log(`Edit build/content/${page}/index.html directly, then run \`rw run\`.`);
        return;
    }

    const npm     = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const vitArgs = watch ? ['run', 'build', '--', '--watch'] : ['run', 'build'];

    console.log(`Building (${type})${watch ? ' in watch mode' : ''}…`);
    const r = spawnSync(npm, vitArgs, { cwd: projectRoot, stdio: 'inherit' });
    process.exit(r.status ?? 0);
}

module.exports = { run };
