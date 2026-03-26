'use strict';
// rw list [type]
//   rw list            Show both pages and plugins
//   rw list pages      Show pages found in src/content/ (or build/content/)
//   rw list plugins    Show plugins registered in info.json

const fs   = require('fs');
const path = require('path');
const { detectTarget, parseGitHubUrl, rwPluginsDir } = require('./shared');
const { ProjectState } = require('../project/project_state');

const SHARED_EXTS = ['.so', '.dylib', '.dll'];

// ─── list pages ───────────────────────────────────────────────────────────────

function listPages(state) {
    const layout   = state.layout();
    const pages    = layout.listPages();  // filesystem scan
    const starting = new Set(
        Array.isArray(state.info?.starting_pages) ? state.info.starting_pages : []
    );

    if (pages.length === 0) { console.log('  (no pages found)'); return; }

    console.log('Pages:');
    for (const p of pages) {
        const star = starting.has(p) ? ' \u2605' : '';
        console.log(`  ${p}${star}`);
    }
    console.log('  \u2605 = starting page');
}

// ─── list plugins ─────────────────────────────────────────────────────────────

function listPlugins(state) {
    const plugins = state.info?.plugins;
    if (!plugins || !plugins.length) { console.log('  (no plugins registered)'); return; }

    const { os: tOs, arch: tArch } = detectTarget();
    const buildPluginsDir = path.join(state.root, 'build', 'plugins');
    let buildFiles = [];
    try { buildFiles = fs.readdirSync(buildPluginsDir); } catch (_) {}

    console.log('Plugins:');
    for (const repoUrl of plugins) {
        const parsed     = parseGitHubUrl(repoUrl);
        const identifier = parsed ? `${parsed.owner}-${parsed.repo}` : path.basename(repoUrl);
        const repoName   = parsed ? parsed.repo : identifier;

        const cached    = fs.existsSync(path.join(rwPluginsDir(state.root), identifier));
        const installed = buildFiles.some(f =>
            SHARED_EXTS.some(ext => f.endsWith(ext)) &&
            f.toLowerCase().startsWith(repoName.toLowerCase())
        );

        const status = installed ? '\u2713' : cached ? '\u25cb' : '\u26a0';
        const label  = installed ? 'installed' : cached ? 'cached, not installed' : 'not downloaded';
        console.log(`  [${status}] ${repoUrl}  (${label})`);
    }
    console.log('  \u2713 = in build/plugins  \u25cb = cached only  \u26a0 = not downloaded');
}

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const state = ProjectState.detect();
    if (!state) { console.error('Not inside a RenWeb project (no info.json found)'); process.exit(1); }

    const filter = ((args || [])[0] || '').toLowerCase();

    if (!filter || filter === 'pages' || filter === 'page') {
        listPages(state);
        if (!filter) console.log();
    }

    if (!filter || filter === 'plugins' || filter === 'plugin') {
        listPlugins(state);
    }

    if (filter && !['pages', 'page', 'plugins', 'plugin'].includes(filter)) {
        console.error(`Unknown type '${filter}'. Use: rw list [pages|plugins]`);
        process.exit(1);
    }
}

module.exports = { run };
