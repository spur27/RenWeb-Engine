'use strict';

const fs   = require('fs');
const path = require('path');
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

const EXAMPLE_PLUGIN_REPO = 'https://github.com/spur27/renweb-example-plugin';

function fetchPlugin(cwd, tag) {
    const { os: tOs, arch: tArch } = detectTarget();
    const label = tag ? `v${tag}` : 'latest';
    ui.step(`Fetching example plugin (${label}) for ${tOs}-${tArch}…`);
    const release = fetchRelease(tag, EXAMPLE_PLUGIN_REPO);
    if (!release) {
        ui.error('Could not reach GitHub — aborting.');
        process.exit(1);
    }
    const ver     = release.tag_name || release.name || 'latest';
    const pattern = new RegExp(`-${tOs}-${tArch}(\\.(so|dylib|dll))?$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        ui.error(`No plugin asset found for ${tOs}-${tArch} in release ${ver}`);
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
    ui.ok(asset.name);
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

function selectExampleAsset(release) {
    const assets = release.assets || [];
    const isExampleArchive = (name) => /^example-\d+\.\d+\.\d+\.(zip|tar\.gz)$/i.test(name);
    const candidates = assets.filter(a => isExampleArchive(a.name || ''));
    if (candidates.length === 0) return null;

    const preferredExt = process.platform === 'win32' ? '.zip' : '.tar.gz';
    const preferred = candidates.find(a => (a.name || '').toLowerCase().endsWith(preferredExt));
    return preferred || candidates[0];
}

function fetchExample(cwd) {
    ui.step('Fetching latest example project archive…');
    const release = fetchRelease(null);
    if (!release) {
        ui.error('Could not reach GitHub — aborting.');
        process.exit(1);
    }

    const asset = selectExampleAsset(release);
    if (!asset) {
        const ver = release.tag_name || release.name || 'latest';
        ui.error(`No example archive found in release ${ver}`);
        ui.info('Expected: example-x.y.z.zip or example-x.y.z.tar.gz');
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
    ui.ok(asset.name);
}

function run(args) {
    // Collect positional verbs (non-flag args before --version)
    const verbs = args.filter((a, i) => {
        if (a.startsWith('--')) return false;
        const prev = args[i - 1];
        return prev !== '--version';
    });

    const hasExe    = verbs.includes('executable');
    const hasPlugin = verbs.includes('plugin');
    const hasApi    = verbs.includes('api');
    const hasExample = verbs.includes('example');
    const defaultMode = !hasExe && !hasPlugin && !hasApi && !hasExample;

    if (defaultMode) {
        ui.info('Usage: rw fetch <verb> [--version <tag>]');
        ui.info('  executable   Download the engine binary for the current OS/arch');
        ui.info('  plugin       Download the example plugin for the current OS/arch');
        ui.info('  api          Download the JS/TS API files (index.js, .ts, .d.ts, .js.map)');
        ui.info('  example      Download latest example-x.y.z archive (zip on Windows, tar.gz elsewhere)');
        process.exit(0);
    }

    const verIdx = args.indexOf('--version');
    const tag    = verIdx !== -1 && verIdx + 1 < args.length && !args[verIdx + 1].startsWith('--')
        ? args[verIdx + 1]
        : null;

    const cwd = process.cwd();

    if (hasPlugin) {
        fetchPlugin(cwd, tag);
    }

    if (hasApi) {
        ui.step('Fetching JS/TS API files…');
        fetchApi(cwd);
    }

    if (hasExample) {
        fetchExample(cwd);
    }

    if (hasExe) {
        const { os: tOs, arch: tArch } = detectTarget();
        const label = tag ? `v${tag}` : 'latest';
        ui.step(`Fetching RenWeb executable (${label}) for ${tOs}-${tArch}…`);
        const release = fetchRelease(tag);
        if (!release) { console.error('Could not reach GitHub — aborting.'); process.exit(1); }
        fetchExecutable(release, cwd);
    }
}

module.exports = { run };
