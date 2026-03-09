'use strict';
// rw doc [--js | --plugin]
// Opens the RenWeb documentation in the system default browser.
//   (no flag)  → https://spur27.github.io/RenWeb-Engine/?page=home
//   --js       → ?page=api
//   --plugin   → ?page=plugins

const { spawnSync } = require('child_process');

const BASE = 'https://spur27.github.io/RenWeb-Engine/';
const PAGES = { '--js': 'api', '--plugin': 'plugins' };

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
    const flag = (args || []).find(a => a.startsWith('-'));
    if (flag && !PAGES[flag]) {
        console.error(`Unknown flag '${flag}'. Usage: rw doc [--js | --plugin]`);
        process.exit(1);
    }
    const page = flag ? PAGES[flag] : 'home';
    openBrowser(`${BASE}?page=${page}`);
}

module.exports = { run };
