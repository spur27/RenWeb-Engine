'use strict';
// cli/shared/fetchers.js
// Shared GitHub / release download helpers used by both create.js and init.js.

const fs   = require('fs');
const path = require('path');
const ui = require('./ui');
const {
    download, downloadText, detectTarget, fetchRelease,
    resolveEngineRepo, engineRawBase, engineApiBase,
    rwPluginsDir, ensureRwGitignore, parseGitHubUrl,
} = require('./utils');

/**
 * Download the RenWeb JS API files (index.js + index.d.ts) into renwebDir.
 */
function fetchWebApi(renwebDir) {
    ui.step('Fetching RenWeb JS API…');
    fs.mkdirSync(renwebDir, { recursive: true });
    const rawBase = engineRawBase(resolveEngineRepo());
    for (const file of ['index.js', 'index.d.ts']) {
        const ok = download(`${rawBase}/web/api/${file}`, path.join(renwebDir, file));
        if (!ok) ui.warn(`Failed to fetch ${file} — skipping`);
    }
}

/**
 * Download the latest engine executable for the host OS/arch into buildDir.
 * Returns { filename, version } on success, or null on failure.
 */
function fetchEngineExecutable(buildDir) {
    const { os: tOs, arch: tArch } = detectTarget();
    ui.step(`Fetching latest RenWeb engine for ${tOs}-${tArch}…`);

    const release = fetchRelease(null);
    if (!release) {
        ui.warn('Could not reach GitHub — download the engine executable manually');
        return null;
    }
    const ver     = release.tag_name || release.name || 'latest';
    const pattern = new RegExp(`-${tOs}-${tArch}(\\.exe)?$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        ui.warn(`No release asset found for ${tOs}-${tArch} — add the engine executable to build/ manually`);
        return null;
    }

    fs.mkdirSync(buildDir, { recursive: true });
    const dest = path.join(buildDir, asset.name);
    ui.step(`Downloading: ${asset.name}`);
    if (!download(asset.browser_download_url, dest)) {
        ui.warn('Download failed — add the engine executable to build/ manually');
        return null;
    }
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
    return { filename: asset.name, version: ver };
}

/**
 * Download plugin.hpp from the engine repo into includeDir.
 */
function fetchPluginHpp(includeDir) {
    ui.step('Fetching plugin.hpp…');
    fs.mkdirSync(includeDir, { recursive: true });
    const rawBase = engineRawBase(resolveEngineRepo());
    const ok = download(`${rawBase}/include/plugin.hpp`, path.join(includeDir, 'plugin.hpp'));
    if (!ok) ui.warn('Failed to fetch plugin.hpp');
}

/**
 * Download all files listed under repoPath in the engine repo into localDir.
 */
function fetchGitHubDirectory(repoPath, localDir) {
    const apiBase = engineApiBase(resolveEngineRepo());
    const text = downloadText(`${apiBase}/contents/${repoPath}`);
    if (!text) {
        ui.warn(`Could not list ${repoPath} from GitHub — skipping`);
        return;
    }
    let entries;
    try { entries = JSON.parse(text); } catch (_) {
        ui.warn(`Could not parse ${repoPath} listing — skipping`);
        return;
    }
    fs.mkdirSync(localDir, { recursive: true });
    for (const entry of entries) {
        if (entry.type === 'file' && entry.download_url) {
            if (!download(entry.download_url, path.join(localDir, entry.name)))
                ui.warn(`Failed to fetch ${entry.name}`);
        }
    }
}

/**
 * Download RenWeb plugins listed in info.json `plugins: string[]`.
 * Each entry is a GitHub repo URL. The matching release asset for the current
 * OS/arch is downloaded, cached in .rw/plugins/<owner>-<repo>/, and copied
 * into buildDir/plugins/.
 */
function fetchPlugins(projectRoot, buildDir, targetOs, targetArch) {
    let info;
    try { info = JSON.parse(fs.readFileSync(path.join(projectRoot, 'info.json'), 'utf8')); } catch (_) { return; }
    const repos = Array.isArray(info.plugin_repositories) ? info.plugin_repositories.filter(Boolean) : [];
    if (repos.length === 0) return;

    const pluginsOutDir = path.join(buildDir, 'plugins');
    fs.mkdirSync(pluginsOutDir, { recursive: true });
    ensureRwGitignore(projectRoot);

    const extRE = new RegExp(`-${targetOs}-${targetArch}\\.(so|dylib|dll)$`, 'i');

    for (const repoUrl of repos) {
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) {
            ui.warn(`Skipping invalid plugin URL: ${repoUrl}`);
            continue;
        }
        const slug     = `${parsed.owner}-${parsed.repo}`;
        const cacheDir = path.join(rwPluginsDir(projectRoot), slug);
        fs.mkdirSync(cacheDir, { recursive: true });

        let cached = null;
        try { cached = fs.readdirSync(cacheDir).find(f => extRE.test(f)) || null; } catch (_) {}

        if (cached) {
            ui.info(`Using cached plugin: ${cached}`);
        } else {
            ui.step(`Fetching plugin ${slug} for ${targetOs}-${targetArch}…`);
            const release = fetchRelease(null, repoUrl);
            if (!release) {
                ui.warn(`Could not reach GitHub for plugin: ${slug}`);
                continue;
            }
            const asset = (release.assets || []).find(a => extRE.test(a.name));
            if (!asset) {
                ui.warn(`No plugin asset found for ${targetOs}-${targetArch} in ${slug}`);
                continue;
            }
            cached = asset.name;
            if (!download(asset.browser_download_url, path.join(cacheDir, cached))) {
                ui.warn(`Failed to download plugin: ${cached}`);
                continue;
            }
            ui.ok(`Plugin cached: ${cached}`);
        }

        fs.copyFileSync(path.join(cacheDir, cached), path.join(pluginsOutDir, cached));
    }
}

module.exports = { fetchWebApi, fetchEngineExecutable, fetchPluginHpp, fetchGitHubDirectory, fetchPlugins };
