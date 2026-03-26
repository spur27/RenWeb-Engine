'use strict';
// rw add <type> [args]
//   rw add page <name> [--starting-page]   Scaffold a new page
//   rw add plugin <repo-url>               Download plugin release binaries from GitHub

const fs   = require('fs');
const path = require('path');
const {
    download, downloadText, detectTarget, saveInfo,
    parseGitHubUrl, rwPluginsDir, ensureRwGitignore,
} = require('./shared');
const { ProjectState } = require('../project/project_state');

const SHARED_EXTS = ['.so', '.dylib', '.dll'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireState() {
    const state = ProjectState.detect();
    if (!state) { console.error('Not inside a RenWeb project (no info.json found)'); process.exit(1); }
    return state;
}

function saveConfig(state) {
    fs.writeFileSync(state.config_path, JSON.stringify(state.config, null, 4) + '\n', 'utf8');
}

// ─── add page ─────────────────────────────────────────────────────────────────

function addPage(args) {
    const name         = (args || [])[0];
    const startingPage = (args || []).includes('--starting-page');
    if (!name) { console.error('Usage: rw add page <name> [--starting-page]'); process.exit(1); }

    const pageName = name.trim().toLowerCase().replace(/[\s\-]+/g, '_');
    const state    = requireState();
    const layout   = state.layout();

    const { created, index_path } = layout.scaffoldPage(pageName, state.info);
    const rel = path.relative(state.root, index_path);
    if (created) console.log(`  \u2713 ${rel}  (created)`);
    else         console.log(`  \u21b7 ${rel}  (already exists \u2014 skipped)`);

    // Register in config.json if not already present.
    if (!state.config) {
        console.warn('  \u26a0 config.json not found \u2014 add the page entry manually');
    } else if (!state.config[pageName]) {
        state.config[pageName] = { title: pageName, merge_defaults: true };
        saveConfig(state);
        console.log(`  \u2713 ${path.relative(state.root, state.config_path)}  (entry added for '${pageName}')`);
    } else {
        console.log(`  \u21b7 config entry for '${pageName}' already exists \u2014 skipped`);
    }

    // Add to info.json starting_pages if --starting-page flag is present.
    if (startingPage) {
        const info = state.info || {};
        if (!Array.isArray(info.starting_pages)) info.starting_pages = [];
        if (!info.starting_pages.includes(pageName)) {
            info.starting_pages.push(pageName);
            saveInfo(state.root, info);
            console.log(`  \u2713 Added '${pageName}' to info.json starting_pages`);
        } else {
            console.log(`  \u21b7 '${pageName}' already in info.json starting_pages`);
        }
    }

    console.log(`\nDone. Navigate at runtime with renweb.navigate.to('${pageName}').\n`);
}

// ─── add plugin ───────────────────────────────────────────────────────────────

function addPlugin(repoUrl) {
    if (!repoUrl) { console.error('Usage: rw add plugin <repo-url>'); process.exit(1); }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
        console.error(`Cannot parse as a GitHub URL: ${repoUrl}`);
        console.error('Expected format: https://github.com/owner/repo');
        process.exit(1);
    }
    const { owner, repo } = parsed;
    const identifier      = `${owner}-${repo}`;

    const state = requireState();
    ensureRwGitignore(state.root);

    // \u2500\u2500 Fetch latest GitHub release
    const releaseUrl  = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    console.log(`\nFetching latest release for ${owner}/${repo}\u2026`);
    const releaseText = downloadText(releaseUrl);
    if (!releaseText) { console.error('Could not reach GitHub releases API.'); process.exit(1); }
    let release;
    try { release = JSON.parse(releaseText); } catch (_) {
        console.error('Failed to parse release JSON.'); process.exit(1);
    }
    if (release.message === 'Not Found' || !release.assets) {
        console.error(`No releases found for ${owner}/${repo}.`); process.exit(1);
    }
    const binaryAssets = release.assets.filter(a => SHARED_EXTS.some(ext => a.name.endsWith(ext)));
    if (!binaryAssets.length) {
        console.error(`Release ${release.tag_name} has no binary assets (.so/.dll/.dylib).`); process.exit(1);
    }

    // \u2500\u2500 Download all binaries to .rw/plugins/<id>/
    const cacheDir = path.join(rwPluginsDir(state.root), identifier);
    fs.mkdirSync(cacheDir, { recursive: true });
    console.log(`Downloading ${binaryAssets.length} asset(s) to .rw/plugins/${identifier}/\u2026`);
    const downloaded = [];
    for (const asset of binaryAssets) {
        const dest = path.join(cacheDir, asset.name);
        if (download(asset.browser_download_url, dest)) {
            console.log(`  \u2713 ${asset.name}`);
            downloaded.push(asset.name);
        } else {
            console.warn(`  \u26a0 Failed to download ${asset.name}`);
        }
    }
    if (!downloaded.length) { console.error('No binaries could be downloaded.'); process.exit(1); }

    // \u2500\u2500 Copy host binary to build/plugins/
    const { os: tOs, arch: tArch } = detectTarget();
    const hostBinary = downloaded.find(n =>
        n.toLowerCase().includes(`-${tOs}-`) && n.toLowerCase().includes(`${tArch}.`)
    );
    if (hostBinary) {
        const buildPluginsDir = path.join(state.root, 'build', 'plugins');
        fs.mkdirSync(buildPluginsDir, { recursive: true });
        fs.copyFileSync(path.join(cacheDir, hostBinary), path.join(buildPluginsDir, hostBinary));
        console.log(`\n  \u2713 Installed build/plugins/${hostBinary}`);
    } else {
        console.warn(`\n  \u26a0 No binary for ${tOs}-${tArch} \u2014 install manually from .rw/plugins/${identifier}/`);
    }

    // \u2500\u2500 Record in info.json
    const info = state.info || {};
    if (!Array.isArray(info.plugins)) info.plugins = [];
    const canonical = `https://github.com/${owner}/${repo}`;
    const alreadyListed = info.plugins.some(u => {
        const p = parseGitHubUrl(u);
        return p && p.owner === owner && p.repo === repo;
    });
    if (!alreadyListed) {
        info.plugins.push(canonical);
        saveInfo(state.root, info);
        console.log(`  \u2713 Recorded in info.json`);
    } else {
        console.log(`  \u21b7 Already recorded in info.json`);
    }

    console.log(`\nPlugin ${owner}/${repo} installed (${release.tag_name || 'latest'}).\n`);
}

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const [type, ...rest] = (args || []);
    switch ((type || '').toLowerCase()) {
        case 'page':   return addPage(rest);
        case 'plugin': return addPlugin(rest[0]);
        default:
            console.error('Usage: rw add <page|plugin> [args]');
            console.error('  rw add page <name> [--starting-page]  Scaffold a new page');
            console.error('  rw add plugin <repo-url>               Download and install a plugin');
            process.exit(1);
    }
}

module.exports = { run };
