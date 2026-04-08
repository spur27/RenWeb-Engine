'use strict';
// rw fetch [--executable | --bundle | --plugin | --api]
// No flag → --executable (backward compat).
// Flags are combinable: e.g. `rw fetch --api --plugin`

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const { download, fetchRelease, detectTarget, GITHUB_RAW, resolveEngineRepo, engineRawBase } = require('../shared/utils');
const { API_FILES }            = require('../shared/constants');
const { DEFAULT_TEMPLATE_INFO } = require('../shared/templates/project');
const ui = require('../shared/ui');

function writeInfoIfMissing(cwd) {
    const dest    = path.join(cwd, 'info.json');
    const infoText = JSON.stringify(DEFAULT_TEMPLATE_INFO, null, 4) + '\n';
    if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, infoText, 'utf8');
        ui.ok('info.json  (template — edit with your details)');
    } else {
        ui.dim('↷ info.json already exists — skipped');
    }
}

function fetchExecutable(release, cwd) {
    const { os: tOs, arch: tArch } = detectTarget();
    const ver     = release.tag_name || release.name || 'latest';
    const pattern = new RegExp(`-${tOs}-${tArch}(\\.exe)?$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        ui.error(`No executable asset found for ${tOs}-${tArch} in release ${ver}`);
        ui.info('Available assets:');
        (release.assets || []).forEach(a => ui.dim(a.name));
        process.exit(1);
    }
    const dest = path.join(cwd, asset.name);
    ui.step(`Downloading: ${asset.name}`);
    if (!download(asset.browser_download_url, dest)) {
        ui.error('Download failed');
        process.exit(1);
    }
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    ui.ok(asset.name);
    writeInfoIfMissing(cwd);
    ui.ok('Done. Run `rw run` to launch the engine.');
}

function fetchBundle(release, cwd) {
    const { os: tOs, arch: tArch } = detectTarget();
    const ver     = release.tag_name || release.name || 'latest';
    const pattern = new RegExp(`^bundle-[\\d][\\w.]*-${tOs}-${tArch}\\.tar\\.gz$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        ui.error(`No bundle asset found for ${tOs}-${tArch} in release ${ver}`);
        console.log('Available assets:');
        (release.assets || []).forEach(a => console.log(`  ${a.name}`));
        process.exit(1);
    }
    const tmp = path.join(os.tmpdir(), asset.name);
    ui.step(`Downloading: ${asset.name}`);
    if (!download(asset.browser_download_url, tmp)) {
        console.error('  ✗ Download failed');
        process.exit(1);
    }
    ui.step('Extracting to cwd…');
    const r = spawnSync('tar', ['-xzf', tmp, '-C', cwd], { stdio: 'inherit' });
    try { fs.unlinkSync(tmp); } catch (_) {}
    if (r.status !== 0) {
        ui.error('Extraction failed');
        process.exit(1);
    }
    ui.ok('bundle extracted');
    writeInfoIfMissing(cwd);
    console.log(`\nDone. Run \`rw run\` to launch the engine.\n`);
}

function fetchPlugin(cwd) {
    const rawBase = engineRawBase(resolveEngineRepo());
    const url  = `${rawBase}/include/plugin.hpp`;
    const dest = path.join(cwd, 'plugin.hpp');
    ui.step('Downloading: plugin.hpp');
    if (!download(url, dest)) {
        console.error('  ✗ Download failed');
        process.exit(1);
    }
    console.log(`  ✓ plugin.hpp`);
}

function fetchApi(cwd) {
    const rawBase = engineRawBase(resolveEngineRepo());
    for (const file of API_FILES) {
        const url  = `${rawBase}/web/api/${file}`;
        const dest = path.join(cwd, file);
        ui.step(`Downloading: ${file}`);
        if (!download(url, dest)) {
            ui.error(`Download failed for ${file}`);
            process.exit(1);
        }
        ui.ok(file);
    }
}

function run(args) {
    const hasExe    = args.includes('--executable');
    const hasBundle = args.includes('--bundle');
    const hasPlugin = args.includes('--plugin');
    const hasApi    = args.includes('--api');
    const defaultMode = !hasExe && !hasBundle && !hasPlugin && !hasApi;

    const verIdx = args.indexOf('--version');
    const tag    = verIdx !== -1 ? args[verIdx + 1] : null;

    const cwd = process.cwd();

    if (hasPlugin) {
        ui.step('Fetching plugin.hpp…');
        fetchPlugin(cwd);
    }

    if (hasApi) {
        ui.step('Fetching JS/TS API files…');
        fetchApi(cwd);
    }

    if (hasBundle) {
        const { os: tOs, arch: tArch } = detectTarget();
        const label = tag ? `v${tag}` : 'latest';
        ui.step(`Fetching RenWeb bundle (${label}) for ${tOs}-${tArch}…`);
        const release = fetchRelease(tag);
        if (!release) { ui.error('Could not reach GitHub — aborting.'); process.exit(1); }
        fetchBundle(release, cwd);
    }

    if (hasExe || defaultMode) {
        const { os: tOs, arch: tArch } = detectTarget();
        const label = tag ? `v${tag}` : 'latest';
        ui.step(`Fetching RenWeb executable (${label}) for ${tOs}-${tArch}…`);
        const release = fetchRelease(tag);
        if (!release) { console.error('Could not reach GitHub — aborting.'); process.exit(1); }
        fetchExecutable(release, cwd);
    }

    if (hasPlugin || hasApi) {
        ui.ok('Done.');
    }
}

module.exports = { run };
