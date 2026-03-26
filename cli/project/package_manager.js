'use strict';
// package_manager.js
// Strategy pattern for npm / deno / bun / none.
//
// Each adapter exposes a uniform interface:
//   name()              → string identifier
//   build_cmd()         → [cmd, args] | null
//   watch_cmd()         → [cmd, args] | null
//   run(script, ...a)   → SpawnSyncReturns | null
//   install()           → SpawnSyncReturns | null

const { spawnSync } = require('child_process');

// ─── Adapters ─────────────────────────────────────────────────────────────────

class NoneAdapter {
    name()              { return 'none'; }
    build_cmd()         { return null; }
    watch_cmd()         { return null; }
    run()               { return null; }
    install()           { return null; }
}

class NpmAdapter {
    constructor(root)  { this.root = root; }
    _bin()             { return process.platform === 'win32' ? 'npm.cmd' : 'npm'; }
    name()             { return 'node'; }
    build_cmd()        { return [this._bin(), ['run', 'build']]; }
    watch_cmd()        { return [this._bin(), ['run', 'build', '--', '--watch']]; }
    run(script, ...a)  { return spawnSync(this._bin(), ['run', script, ...a], { cwd: this.root, stdio: 'inherit' }); }
    install()          { return spawnSync(this._bin(), ['install'],            { cwd: this.root, stdio: 'inherit' }); }
}

class DenoAdapter {
    constructor(root)  { this.root = root; }
    name()             { return 'deno'; }
    build_cmd()        { return ['deno', ['task', 'build']]; }
    watch_cmd()        { return ['deno', ['task', 'build', '--watch']]; }
    run(script, ...a)  { return spawnSync('deno', ['task', script, ...a], { cwd: this.root, stdio: 'inherit' }); }
    install()          { return null; } // Deno resolves dependencies at runtime
}

class BunAdapter {
    constructor(root)  { this.root = root; }
    name()             { return 'bun'; }
    build_cmd()        { return ['bun', ['run', 'build']]; }
    watch_cmd()        { return ['bun', ['run', 'build', '--watch']]; }
    run(script, ...a)  { return spawnSync('bun', ['run', script, ...a], { cwd: this.root, stdio: 'inherit' }); }
    install()          { return spawnSync('bun', ['install'],            { cwd: this.root, stdio: 'inherit' }); }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

class PackageManagerAdapter {
    static from(state) {
        switch (state.js_engine) {
            case 'node': return new NpmAdapter(state.root);
            case 'deno': return new DenoAdapter(state.root);
            case 'bun':  return new BunAdapter(state.root);
            default:     return new NoneAdapter();
        }
    }
}

module.exports = { PackageManagerAdapter, NpmAdapter, DenoAdapter, BunAdapter, NoneAdapter };
