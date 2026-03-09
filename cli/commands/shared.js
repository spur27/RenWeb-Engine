'use strict';

const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const readline   = require('readline');
const { spawnSync } = require('child_process');

// ─── Constants ────────────────────────────────────────────────────────────────

const GITHUB_RAW = 'https://raw.githubusercontent.com/spur27/RenWeb-Engine/main';
const GITHUB_API = 'https://api.github.com/repos/spur27/RenWeb-Engine/releases/latest';

// ─── Network ─────────────────────────────────────────────────────────────────

/**
 * Download url → dest using curl or wget.
 * Returns true on success.
 */
function download(url, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    for (const [cmd, args] of [
        ['curl', ['-fsSL', '--output', dest, url]],
        ['wget', ['-q',    '-O',       dest, url]],
    ]) {
        try {
            const r = spawnSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
            if (r.status === 0) return true;
        } catch (_) {}
    }
    return false;
}

/** Download url and return contents as a string, or null on failure. */
function downloadText(url) {
    const tmp = path.join(os.tmpdir(), `renweb-${Date.now()}.txt`);
    if (!download(url, tmp)) return null;
    try { const t = fs.readFileSync(tmp, 'utf8'); fs.unlinkSync(tmp); return t; }
    catch (_) { return null; }
}

/**
 * Fetch the latest RenWeb release metadata from GitHub.
 * Returns the parsed JSON or null on failure.
 */
function fetchLatestRelease() {
    const text = downloadText(GITHUB_API);
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
}

// ─── Platform ────────────────────────────────────────────────────────────────

function detectTarget() {
    const plat = process.platform;
    const arch  = process.arch;
    const targetOs   = plat === 'win32' ? 'windows' : plat === 'darwin' ? 'macos' : 'linux';
    const ARCH_MAP   = { x64: 'x86_64', ia32: 'x86_32', arm: 'arm32' };
    const targetArch = ARCH_MAP[arch] ?? arch;
    return { os: targetOs, arch: targetArch };
}

// ─── Project type detection ───────────────────────────────────────────────────

/**
 * Infer the frontend framework used by a project from its package.json.
 * Returns 'react' | 'vue' | 'svelte' | 'preact' | 'vanilla'.
 */
function detectProjectType(projectRoot) {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return 'vanilla';
    try {
        const pkg  = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps['react'])   return 'react';
        if (deps['vue'])     return 'vue';
        if (deps['svelte'])  return 'svelte';
        if (deps['preact'])  return 'preact';
        if (deps['vite'])    return 'vanilla';
    } catch (_) {}
    return 'vanilla';
}

// ─── Project root ─────────────────────────────────────────────────────────────

/**
 * Bounded downward search: recursively look for a directory containing
 * info.json (or build/info.json) up to maxDepth levels deep.
 * Skips hidden dirs, node_modules, and build/.
 */
function _findRootDown(dir, maxDepth) {
    if (maxDepth <= 0) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'build') continue;
        const sub = path.join(dir, e.name);
        if (fs.existsSync(path.join(sub, 'info.json')))               return sub;
        if (fs.existsSync(path.join(sub, 'build', 'info.json')))      return sub;
        const found = _findRootDown(sub, maxDepth - 1);
        if (found) return found;
    }
    return null;
}

/**
 * Walk up from cwd looking for a RenWeb project root, then fall back to a
 * bounded downward search (maxDownDepth levels, default 5).
 * Checks for info.json at the root and build/info.json.
 */
function findProjectRoot(start, maxDownDepth = 5) {
    let cur = path.resolve(start || process.cwd());
    // Walk upward first (fast path)
    let check = cur;
    while (true) {
        if (fs.existsSync(path.join(check, 'info.json')))          return check;
        if (fs.existsSync(path.join(check, 'build', 'info.json'))) return check;
        const parent = path.dirname(check);
        if (parent === check) break;
        check = parent;
    }
    // Fallback: bounded downward search from the starting directory
    return maxDownDepth > 0 ? _findRootDown(cur, maxDownDepth) : null;
}

/**
 * Find the nearest build/ directory: walk upward first, then bounded downward.
 */
function findBuildDir(start, maxDownDepth = 5) {
    let cur = path.resolve(start || process.cwd());
    // Walk upward
    let check = cur;
    while (true) {
        const candidate = path.join(check, 'build');
        try { if (fs.statSync(candidate).isDirectory()) return candidate; } catch (_) {}
        const parent = path.dirname(check);
        if (parent === check) break;
        check = parent;
    }
    // Bounded downward search
    if (maxDownDepth <= 0) return null;
    return _findBuildDown(cur, maxDownDepth);
}

function _findBuildDown(dir, maxDepth) {
    if (maxDepth <= 0) return null;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        if (e.name.startsWith('.') || e.name === 'node_modules') continue;
        const sub = path.join(dir, e.name);
        if (e.name === 'build') return sub;
        const found = _findBuildDown(sub, maxDepth - 1);
        if (found) return found;
    }
    return null;
}

/**
 * Scan buildDir for an engine executable matching the host (or provided) OS/arch.
 * Returns the filename, or null.
 */
function findProjectExecutable(buildDir, targetOs, targetArch) {
    if (!targetOs || !targetArch) {
        const t = detectTarget();
        targetOs   = targetOs   || t.os;
        targetArch = targetArch || t.arch;
    }
    const pattern = new RegExp(`-${targetOs}-${targetArch}(\\.exe)?$`, 'i');
    let entries;
    try { entries = fs.readdirSync(buildDir); } catch (_) { return null; }
    const match = entries.find(f => {
        if (!pattern.test(f)) return false;
        try { return fs.statSync(path.join(buildDir, f)).isFile(); } catch (_) { return false; }
    });
    return match || null;
}

/**
 * Read and parse info.json from a project root.
 * Looks for info.json at the root first, then build/info.json.
 */
function loadInfo(projectRoot) {
    for (const rel of ['info.json', path.join('build', 'info.json')]) {
        const p = path.join(projectRoot, rel);
        if (fs.existsSync(p)) {
            try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {}
        }
    }
    return null;
}

/**
 * Write info.json to both the project root AND build/.
 * Callers should pass the full parsed object to save.
 */
function saveInfo(projectRoot, data) {
    const text = JSON.stringify(data, null, 4) + '\n';
    const rootPath  = path.join(projectRoot, 'info.json');
    const buildPath = path.join(projectRoot, 'build', 'info.json');
    // Only write to locations that already exist, but always write build/ if build dir is present
    if (fs.existsSync(rootPath)) fs.writeFileSync(rootPath, text, 'utf8');
    if (fs.existsSync(path.join(projectRoot, 'build'))) {
        fs.mkdirSync(path.join(projectRoot, 'build'), { recursive: true });
        fs.writeFileSync(buildPath, text, 'utf8');
    }
}

// ─── Engine PID management ───────────────────────────────────────────────────

const PID_FILE = (projectRoot) => path.join(projectRoot, 'build', '.engine.pid');

/** Kill any tracked engine process started by this project. */
function killEngine(projectRoot) {
    const pidFile = PID_FILE(projectRoot);
    if (!fs.existsSync(pidFile)) return false;
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
    try { fs.unlinkSync(pidFile); } catch (_) {}
    if (!pid) return false;
    try { process.kill(pid, 'SIGTERM'); return true; } catch (_) { return false; }
}

/** Record the PID of a newly launched engine process. */
function saveEnginePid(projectRoot, pid) {
    fs.writeFileSync(PID_FILE(projectRoot), String(pid), 'utf8');
}

// ─── File utils ──────────────────────────────────────────────────────────────

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
    }
}

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function makeRl() {
    return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function prompt(rl, question, fallback = '') {
    return new Promise(resolve => {
        const display = fallback ? `${question} [${fallback}]: ` : `${question}: `;
        rl.question(display, ans => resolve(ans.trim() || fallback));
    });
}

// ─── String utils ────────────────────────────────────────────────────────────

function toSnake(s) { return s.trim().toLowerCase().replace(/[\s\-]+/g, '_'); }
function toKebab(s) { return s.trim().toLowerCase().replace(/[\s_]+/g, '-'); }

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    GITHUB_RAW,
    GITHUB_API,
    download,
    downloadText,
    fetchLatestRelease,
    detectTarget,
    detectProjectType,
    findProjectRoot,
    findBuildDir,
    findProjectExecutable,
    loadInfo,
    saveInfo,
    killEngine,
    saveEnginePid,
    copyDir,
    makeRl,
    prompt,
    toSnake,
    toKebab,
};
