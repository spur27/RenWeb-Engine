'use strict';

const fs         = require('fs');
const path       = require('path');
const os         = require('os');
const readline   = require('readline');
const { spawnSync } = require('child_process');

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_ENGINE_REPO = 'https://github.com/spur27/RenWeb-Engine';
const GITHUB_RAW      = 'https://raw.githubusercontent.com/spur27/RenWeb-Engine/main';
const GITHUB_API_BASE = 'https://api.github.com/repos/spur27/RenWeb-Engine';
const GITHUB_API      = `${GITHUB_API_BASE}/releases/latest`;

/**
 * Derive the raw.githubusercontent.com base URL from a GitHub repo URL.
 * Falls back to the default engine raw base if the URL is not a GitHub repo.
 */
function engineRawBase(repoUrl) {
    const m = (repoUrl || '').replace(/\.git$/, '').match(/github\.com\/([^/\s]+)\/([^/\s]+)/);
    return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/main` : GITHUB_RAW;
}

/**
 * Derive the api.github.com repos base URL from a GitHub repo URL.
 * Falls back to the default engine API base if the URL is not a GitHub repo.
 */
function engineApiBase(repoUrl) {
    const m = (repoUrl || '').replace(/\.git$/, '').match(/github\.com\/([^/\s]+)\/([^/\s]+)/);
    return m ? `https://api.github.com/repos/${m[1]}/${m[2]}` : GITHUB_API_BASE;
}

/**
 * Resolve the engine repository URL.
 * Reads `engine_repository` from the nearest project info.json (upward walk);
 * falls back to DEFAULT_ENGINE_REPO.
 * Pass an explicit projectRoot to skip the auto-detect.
 */
function resolveEngineRepo(projectRoot) {
    const roots = [];
    if (projectRoot) roots.push(projectRoot);
    const autoRoot = findProjectRoot(process.cwd(), 0);
    if (autoRoot && autoRoot !== projectRoot) roots.push(autoRoot);
    for (const r of roots) {
        const info = loadInfo(r);
        const repo = info && (info.engine_repository || info['engine-repository']);
        if (typeof repo === 'string' && repo.trim()) return repo.trim();
    }
    return DEFAULT_ENGINE_REPO;
}

// ─── Network ─────────────────────────────────────────────────────────────────

/**
 * Download url → dest using curl or wget.
 * Returns true on success.
 */
function download(url, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    for (const [cmd, args] of [
        ['curl', ['-fsSL', '--max-time', '30', '--output', dest, url]],
        ['wget', ['-q', '--timeout=30', '-O', dest, url]],
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
 * Fetch a RenWeb engine release from GitHub.
 * Pass a tag string (e.g. '0.0.7') to pin to a specific release, or null/undefined
 * for the latest. Pass repoUrl to override the auto-resolved engine repository
 * (defaults to the `engine_repository` field in the nearest info.json, or
 * DEFAULT_ENGINE_REPO when not set).
 * Returns the parsed JSON or null on failure.
 */
function fetchRelease(tag, repoUrl) {
    const base = engineApiBase(repoUrl || resolveEngineRepo());
    const url  = tag ? `${base}/releases/tags/${tag}` : `${base}/releases/latest`;
    const text = downloadText(url);
    if (!text) return null;
    try { return JSON.parse(text); } catch (_) { return null; }
}

/** Convenience wrapper. Pass repoUrl to target a specific GitHub repo. */
function fetchLatestRelease(repoUrl) { return fetchRelease(null, repoUrl); }

// ─── Platform ────────────────────────────────────────────────────────────────

function detectTarget() {
    const plat = process.platform;
    const arch  = process.arch;
    const targetOs   = plat === 'win32' ? 'windows' : plat === 'darwin' ? 'macos' : 'linux';
    const ARCH_MAP   = { x64: 'x86_64', ia32: 'x86_32', arm: 'arm32' };
    const targetArch = ARCH_MAP[arch] ?? arch;
    return { os: targetOs, arch: targetArch };
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

// ─── RenWeb cache helpers ────────────────────────────────────────────────────

/** Absolute path to the .rw/ cache directory in a project root. */
function rwCacheDir(root)        { return path.join(root, '.rw'); }
/** Absolute path to the .rw/plugins/ directory. */
function rwPluginsDir(root)      { return path.join(root, '.rw', 'plugins'); }
/** Absolute path to the .rw/trash/ directory. */
function rwTrashDir(root)        { return path.join(root, '.rw', 'trash'); }
/** Absolute path to the .rw/executables/ cache directory. */
function rwExecutablesDir(root)  { return path.join(root, '.rw', 'executables'); }
/** Absolute path to the .rw/bundles/ cache directory. */
function rwBundlesDir(root)      { return path.join(root, '.rw', 'bundles'); }

/**
 * Ensure '.rw/' appears in the project's .gitignore.
 * Creates the file if it does not exist.
 */
function ensureRwGitignore(root) {
    const gitignorePath = path.join(root, '.gitignore');
    const entry = '.rw/';
    try {
        if (fs.existsSync(gitignorePath)) {
            const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n');
            if (!lines.some(l => l.trim() === entry || l.trim() === '.rw'))
                fs.appendFileSync(gitignorePath, `\n# RenWeb cache\n${entry}\n`, 'utf8');
        } else {
            fs.writeFileSync(gitignorePath, `# RenWeb cache\n${entry}\n`, 'utf8');
        }
    } catch (_) {}
}

/**
 * Parse a GitHub repository URL or shorthand into { owner, repo }.
 * Accepts: https://github.com/owner/repo[.git], github.com/owner/repo, owner/repo
 * Returns null if the input cannot be parsed as a GitHub repo path.
 */
function parseGitHubUrl(input) {
    const clean = (input || '').trim().replace(/\.git$/, '').replace(/\/$/, '');
    const m = clean.match(/(?:https?:\/\/)?(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (!m) return null;
    return { owner: m[1], repo: m[2] };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    DEFAULT_ENGINE_REPO,
    GITHUB_RAW,
    GITHUB_API,
    GITHUB_API_BASE,
    engineRawBase,
    engineApiBase,
    resolveEngineRepo,
    download,
    downloadText,
    fetchRelease,
    fetchLatestRelease,
    detectTarget,
    findProjectRoot,
    findProjectExecutable,
    loadInfo,
    saveInfo,
    copyDir,
    makeRl,
    prompt,
    toSnake,
    toKebab,
    rwCacheDir,
    rwPluginsDir,
    rwTrashDir,
    rwExecutablesDir,
    rwBundlesDir,
    ensureRwGitignore,
    parseGitHubUrl,
};
