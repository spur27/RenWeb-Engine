'use strict';

const { spawnSync } = require('child_process');
const ui = require('../shared/ui');

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
        ui.error(`Could not open browser: ${r.error.message}`);
        ui.info(`Visit: ${url}`);
    } else {
        ui.step(`Opening: ${url}`);
    }
}

function run(args) {
    const tokens = (args || []).filter(a => !a.startsWith('-'));
    if (tokens.length === 0) {
        openBrowser(`${BASE}?page=home`);
        return;
    }
    const unknown = tokens.filter(t => !PAGES[t.toLowerCase()]);
    if (unknown.length > 0) {
        ui.error(`Unknown page(s): ${unknown.join(', ')}`);
        ui.info(`Valid pages: ${[...new Set(Object.keys(PAGES))].join(' | ')}`);
        process.exit(1);
    }
    const seen = new Set();
    for (const token of tokens) {
        const page = PAGES[token.toLowerCase()];
        if (seen.has(page)) continue;
        seen.add(page);
        openBrowser(`${BASE}?page=${page}`);
    }
}

module.exports = { run };
