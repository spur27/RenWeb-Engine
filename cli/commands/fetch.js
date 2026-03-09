'use strict';
// rw fetch [--executable | --bundle | --plugin | --api]
// No flag → --executable (backward compat).
// Flags are combinable: e.g. `rw fetch --api --plugin`

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const { download, fetchLatestRelease, detectTarget, GITHUB_RAW } = require('./shared');

const TEMPLATE_INFO = {
    title:          'My RenWeb App',
    description:    '',
    author:         '',
    version:        '0.0.1',
    license:        'BSL 1.0',
    categories:     ['Utility'],
    app_id:         'io.github.user.my_renweb_app',
    repository:     '',
    starting_pages: ['my_renweb_app'],
    permissions: {
        geolocation: false, notifications: true, media_devices: false,
        pointer_lock: false, install_missing_media_plugins: true, device_info: true,
    },
    origins: [],
};

const API_FILES = ['index.js', 'index.js.map', 'index.d.ts', 'index.ts'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function writeInfoIfMissing(cwd) {
    const dest    = path.join(cwd, 'info.json');
    const infoText = JSON.stringify(TEMPLATE_INFO, null, 4) + '\n';
    if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, infoText, 'utf8');
        console.log(`  ✓ info.json  (template — edit with your details)`);
    } else {
        console.log(`  ↷ info.json already exists — skipped`);
    }
}

function fetchExecutable(release, cwd) {
    const { os: tOs, arch: tArch } = detectTarget();
    const ver     = release.tag_name || release.name || 'latest';
    const pattern = new RegExp(`-${tOs}-${tArch}(\\.exe)?$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        console.error(`No executable asset found for ${tOs}-${tArch} in release ${ver}`);
        console.log('Available assets:');
        (release.assets || []).forEach(a => console.log(`  ${a.name}`));
        process.exit(1);
    }
    const dest = path.join(cwd, asset.name);
    console.log(`  Downloading: ${asset.name}`);
    if (!download(asset.browser_download_url, dest)) {
        console.error('  ✗ Download failed');
        process.exit(1);
    }
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    console.log(`  ✓ ${asset.name}`);
    writeInfoIfMissing(cwd);
    console.log(`\nDone. Run \`rw run\` to launch the engine.\n`);
}

function fetchBundle(release, cwd) {
    const { os: tOs, arch: tArch } = detectTarget();
    const ver     = release.tag_name || release.name || 'latest';
    const pattern = new RegExp(`^bundle-[\\d][\\w.]*-${tOs}-${tArch}\\.tar\\.gz$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        console.error(`No bundle asset found for ${tOs}-${tArch} in release ${ver}`);
        console.log('Available assets:');
        (release.assets || []).forEach(a => console.log(`  ${a.name}`));
        process.exit(1);
    }
    const tmp = path.join(os.tmpdir(), asset.name);
    console.log(`  Downloading: ${asset.name}`);
    if (!download(asset.browser_download_url, tmp)) {
        console.error('  ✗ Download failed');
        process.exit(1);
    }
    // Bundle tar.gz is flat (exe + bundle_exec script + lib/) — extract directly to cwd
    console.log(`  Extracting to cwd…`);
    const r = spawnSync('tar', ['-xzf', tmp, '-C', cwd], { stdio: 'inherit' });
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (r.status !== 0) {
        console.error('  ✗ Extraction failed');
        process.exit(1);
    }
    console.log(`  ✓ bundle extracted`);
    writeInfoIfMissing(cwd);
    console.log(`\nDone. Run \`rw run\` to launch the engine.\n`);
}

function fetchPlugin(cwd) {
    const url  = `${GITHUB_RAW}/include/plugin.hpp`;
    const dest = path.join(cwd, 'plugin.hpp');
    console.log(`  Downloading: plugin.hpp`);
    if (!download(url, dest)) {
        console.error('  ✗ Download failed');
        process.exit(1);
    }
    console.log(`  ✓ plugin.hpp`);
}

function fetchApi(cwd) {
    for (const file of API_FILES) {
        const url  = `${GITHUB_RAW}/web/api/${file}`;
        const dest = path.join(cwd, file);
        console.log(`  Downloading: ${file}`);
        if (!download(url, dest)) {
            console.error(`  ✗ Download failed for ${file}`);
            process.exit(1);
        }
        console.log(`  ✓ ${file}`);
    }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

function run(args) {
    const hasExe    = args.includes('--executable');
    const hasBundle = args.includes('--bundle');
    const hasPlugin = args.includes('--plugin');
    const hasApi    = args.includes('--api');
    const defaultMode = !hasExe && !hasBundle && !hasPlugin && !hasApi;

    const cwd = process.cwd();

    if (hasPlugin) {
        console.log('\nFetching plugin.hpp…');
        fetchPlugin(cwd);
    }

    if (hasApi) {
        console.log('\nFetching JS/TS API files…');
        fetchApi(cwd);
    }

    if (hasBundle) {
        const { os: tOs, arch: tArch } = detectTarget();
        console.log(`\nFetching latest RenWeb bundle for ${tOs}-${tArch}…`);
        const release = fetchLatestRelease();
        if (!release) { console.error('Could not reach GitHub — aborting.'); process.exit(1); }
        fetchBundle(release, cwd);
    }

    if (hasExe || defaultMode) {
        const { os: tOs, arch: tArch } = detectTarget();
        console.log(`\nFetching latest RenWeb executable for ${tOs}-${tArch}…`);
        const release = fetchLatestRelease();
        if (!release) { console.error('Could not reach GitHub — aborting.'); process.exit(1); }
        fetchExecutable(release, cwd);
    }

    if (hasPlugin || hasApi) {
        console.log('\nDone.\n');
    }
}

module.exports = { run };
