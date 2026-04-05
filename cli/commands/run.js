'use strict';

const fs   = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectTarget, findProjectExecutable } = require('../shared/utils');

function findBuildDir(start) {
    if (path.basename(start) === 'build') return start;
    let cur = start;
    while (true) {
        const candidate = path.join(cur, 'build');
        if (fs.existsSync(path.join(cur, 'info.json')) && fs.existsSync(candidate))
            return candidate;
        const parent = path.dirname(cur);
        if (parent === cur) break;
        cur = parent;
    }
    return null;
}

function run(_args) {
    const { os: targetOs, arch: targetArch } = detectTarget();
    const buildDir = findBuildDir(process.cwd());

    if (!buildDir) {
        console.error('Not inside a RenWeb project (no info.json / build/ found).');
        process.exit(1);
    }

    const exeName = findProjectExecutable(buildDir, targetOs, targetArch);
    if (!exeName) {
        console.error(`No engine executable found in ${buildDir} for ${targetOs}-${targetArch}.`);
        console.error('  Run `rw build` first to fetch the engine.');
        process.exit(1);
    }

    const exePath = path.join(buildDir, exeName);
    try { fs.chmodSync(exePath, 0o755); } catch (_) {}

    console.log(`Launching: ${exeName}`);
    const r = spawnSync(exePath, [], { cwd: buildDir, stdio: 'inherit' });
    process.exit(r.status ?? 0);
}

module.exports = { run };

