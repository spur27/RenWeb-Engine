'use strict';
const { spawnSync } = require('child_process');

function quoteForCmd(arg) {
    const s = String(arg);
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
    return `"${s.replace(/(["^])/g, '^$1')}"`;
}

function runWithWindowsCmdFallback(bin, args, cwd, stdio = 'inherit', env = process.env) {
    const options = { cwd, stdio, env };
    let result = spawnSync(bin, args, options);

    if (result.error && process.platform === 'win32') {
        const cmd = `${bin} ${args.map(quoteForCmd).join(' ')}`;
        result = spawnSync('cmd.exe', ['/d', '/s', '/c', cmd], options);
    }

    return result;
}

class NoneAdapter {
    name()              { return 'none'; }
    build_cmd()         { return null; }
    run()               { return null; }
    install()           { return null; }
}

class NpmAdapter {
    constructor(root)  { this.root = root; }
    _bin()             { return process.platform === 'win32' ? 'npm.cmd' : 'npm'; }
    name()             { return 'node'; }
    build_cmd()        { return [this._bin(), ['run', 'build']]; }
    run(script, ...a)  {
        const env = (script === 'build')
            ? { ...process.env, NG_CLI_ANALYTICS: 'false' }
            : process.env;
        return runWithWindowsCmdFallback(this._bin(), ['run', '--silent', script, ...a], this.root, 'inherit', env);
    }
    install()          { return runWithWindowsCmdFallback(this._bin(), ['install'], this.root, 'pipe'); }
}

class DenoAdapter {
    constructor(root)  { this.root = root; }
    name()             { return 'deno'; }
    build_cmd()        { return ['deno', ['task', 'build']]; }
    run(script, ...a)  { return spawnSync('deno', ['task', script, ...a], { cwd: this.root, stdio: 'inherit' }); }
    install()          { return null; }
}

class BunAdapter {
    constructor(root)  { this.root = root; }
    name()             { return 'bun'; }
    build_cmd()        { return ['bun', ['run', 'build']]; }
    run(script, ...a)  { return spawnSync('bun', ['run', script, ...a], { cwd: this.root, stdio: 'inherit' }); }
    install()          { return spawnSync('bun', ['install'],            { cwd: this.root, stdio: 'pipe' }); }
}

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
