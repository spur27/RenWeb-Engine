'use strict';
// rw run
// Searches for a build/ directory (upward then bounded downward), finds the
// RenWeb engine binary that matches the host OS and arch, and launches it.

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { detectTarget, findBuildDir, findProjectExecutable } = require('./shared');

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const { os: targetOs, arch: targetArch } = detectTarget();

    const buildDir = findBuildDir();
    if (!buildDir) {
        console.error('Could not find a build/ directory from the current location.');
        process.exit(1);
    }

    const exeName = findProjectExecutable(buildDir, targetOs, targetArch);
    if (!exeName) {
        console.error(`No engine executable found in ${buildDir} for ${targetOs}-${targetArch}.`);
        process.exit(1);
    }

    const exePath = path.join(buildDir, exeName);
    try { fs.chmodSync(exePath, 0o755); } catch (_) {}

    console.log(`Launching: ${exeName}`);
    const engineProc = spawn(exePath, [], {
        cwd: buildDir, stdio: 'inherit', detached: false,
    });
    console.log(`Engine running (PID ${engineProc.pid}). Press Ctrl+C to stop.`);

    const cleanup = (code) => { process.exit(code ?? 0); };

    process.on('SIGINT',  () => { try { engineProc.kill('SIGTERM'); } catch (_) {} cleanup(0); });
    process.on('SIGTERM', () => { try { engineProc.kill('SIGTERM'); } catch (_) {} cleanup(0); });
    engineProc.on('exit', code => cleanup(code));
}

module.exports = { run };

