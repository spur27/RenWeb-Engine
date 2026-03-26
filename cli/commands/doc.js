'use strict';
// rw doc [page...]
// Opens the RenWeb documentation in the system default browser.
//   (no arg)      → https://spur27.github.io/RenWeb-Engine/?page=home
//   rw doc js     → ?page=api
//   rw doc plugin → ?page=plugins

const { spawnSync } = require('child_process');

const BASE  = 'https://spur27.github.io/RenWeb-Engine/';
const PAGES = {
    'home':        'home',
    'js':          'api',
    'api':         'api',
    'usage':       'usage',
    'cli':         'cli',
    'compilation': 'compilation',
    'download':    'downloads',
    'downloads':   'downloads',
    'plugin':      'plugins',
    'plugins':     'plugins',
};

function openBrowser(url) {
    const plat = process.platform;
    let cmd, args;
    if      (plat === 'win32')  { cmd = 'cmd';      args = ['/c', 'start', '', url]; }
    else if (plat === 'darwin') { cmd = 'open';     args = [url]; }
    else                        { cmd = 'xdg-open'; args = [url]; }

    const r = spawnSync(cmd, args, { stdio: 'ignore' });
    if (r.error) {
        console.error(`Could not open browser: ${r.error.message}`);
        console.log(`Visit: ${url}`);
    } else {
        console.log(`Opening: ${url}`);
    }
}

function run(args) {
    // Accept positional tokens; silently ignore anything starting with '-'
    const tokens = (args || []).filter(a => !a.startsWith('-'));
    if (tokens.length === 0) {
        openBrowser(`${BASE}?page=home`);
        return;
    }
    const unknown = tokens.filter(t => !PAGES[t.toLowerCase()]);
    if (unknown.length > 0) {
        console.error(`Unknown page(s): ${unknown.join(', ')}`);
        console.error(`Valid pages: ${[...new Set(Object.keys(PAGES))].join(' | ')}`);
        process.exit(1);
    }
    // Deduplicate pages (e.g. 'js' and 'api' both map to 'api')
    const seen = new Set();
    for (const token of tokens) {
        const page = PAGES[token.toLowerCase()];
        if (seen.has(page)) continue;
        seen.add(page);
        openBrowser(`${BASE}?page=${page}`);
    }
}

module.exports = { run };
