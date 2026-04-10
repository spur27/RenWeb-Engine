'use strict';
// renweb update [--bundle-only | --executable-only]
// Updates the engine executable (and bundle libs/launcher) in an existing RenWeb project.
// Also updates npm/deno packages, vanilla JS API modules, and all registered plugins.
// Auto-detects bundle vs bare install; macOS always uses executable-only.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const {
    download, fetchRelease, fetchLatestRelease,
    detectTarget, findProjectExecutable,
    loadInfo, saveInfo, copyDir,
    rwPluginsDir, ensureRwGitignore,
    parseGitHubUrl,
    engineRawBase, resolveEngineRepo,
} = require('../shared/utils');
const { ProjectState } = require('../project/project_state');
const ui = require('../shared/ui');

// ─── Bundle detection ─────────────────────────────────────────────────────────

/** Returns 'bundle_exec.sh' or 'bundle_exec.bat' if present in buildDir, else null. */
function findBundleExecScript(buildDir) {
    for (const name of ['bundle_exec.sh', 'bundle_exec.bat']) {
        if (fs.existsSync(path.join(buildDir, name))) return name;
    }
    return null;
}

// ─── Update engine executable only ───────────────────────────────────────────

function updateExeOnly(projectRoot, buildDir, tOs, tArch, release) {
    const pattern = new RegExp(`-${tOs}-${tArch}(\\.exe)?$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) {
        ui.warn(`No executable asset found for ${tOs}-${tArch}`);
        return;
    }

    const currentExe = findProjectExecutable(buildDir, tOs, tArch);
    if (currentExe === asset.name) {
        ui.ok(`Engine already up-to-date (${asset.name})`);
    } else {
        const newDest = path.join(buildDir, asset.name);
        ui.step(`Downloading: ${asset.name}`);
        if (!download(asset.browser_download_url, newDest)) {
            ui.warn('Download failed — engine not updated');
            return;
        }
        try { fs.chmodSync(newDest, 0o755); } catch (_) {}

        if (currentExe && currentExe !== asset.name) {
            try { fs.unlinkSync(path.join(buildDir, currentExe)); } catch (_) {
                ui.warn(`Could not remove old executable: ${currentExe}`);
            }
        }
        ui.ok(`Engine updated to ${asset.name}`);
    }

    // Sync version in info.json
    const verMatch = asset.name.match(/-(\d+\.\d+\.\d+(?:[.-][^-]+)?)-(\w+)-(\w+)/);
    if (verMatch) {
        const info = loadInfo(projectRoot);
        if (info) { info.version = verMatch[1]; saveInfo(projectRoot, info); }
    }
}

// ─── Update bundle (libs + launcher + exe) ───────────────────────────────────

function updateBundle(projectRoot, buildDir, tOs, tArch, release) {
    // Find the non-bootstrap bundle tar.gz asset; fall back to .zip
    const RE = /^bundle-([\d][\w.]*)-(\w+)-([\w]+?)\.(tar\.gz|zip)$/;
    const assets = (release.assets || []).filter(a => {
        const m = RE.exec(a.name);
        return m && m[2] === tOs && m[3] === tArch;
    }).sort((a, b) => (a.name.endsWith('.tar.gz') ? -1 : 1)); // prefer tar.gz

    if (!assets.length) {
        ui.warn(`No bundle asset found for ${tOs}-${tArch} — falling back to executable-only`);
        updateExeOnly(projectRoot, buildDir, tOs, tArch, release);
        return;
    }

    const bundleAsset = assets[0];
    ui.step(`Downloading bundle: ${bundleAsset.name}`);
    const tmpTar = path.join(os.tmpdir(), `renweb-bundle-${Date.now()}.tar.gz`);
    if (!download(bundleAsset.browser_download_url, tmpTar)) {
        ui.warn('Bundle download failed');
        return;
    }

    const tmpExtract = path.join(os.tmpdir(), `renweb-bundle-${Date.now()}`);
    fs.mkdirSync(tmpExtract, { recursive: true });
    const r = spawnSync('tar', ['-xzf', tmpTar, '-C', tmpExtract], { stdio: 'inherit' });
    try { fs.unlinkSync(tmpTar); } catch (_) {}
    if (r.status !== 0) { ui.warn('Bundle extraction failed'); return; }

    // Archive is flat (created with `tar -C srcDir .`); files are at tmpExtract root
    const srcDir = tmpExtract;

    // Update lib/
    const srcLib = path.join(srcDir, 'lib');
    if (fs.existsSync(srcLib)) {
        ui.step('Updating lib/…');
        const destLib = path.join(buildDir, 'lib');
        try { fs.rmSync(destLib, { recursive: true, force: true }); } catch (_) {}
        copyDir(srcLib, destLib);
        ui.ok('lib/ updated');
    }

    // Update bundle_exec script(s)
    for (const script of ['bundle_exec.sh', 'bundle_exec.bat']) {
        const src = path.join(srcDir, script);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(buildDir, script));
            try { fs.chmodSync(path.join(buildDir, script), 0o755); } catch (_) {}
            ui.ok(`${script} updated`);
        }
    }

    // Update engine executable
    const exePattern = new RegExp(`-${tOs}-${tArch}(\\.exe)?$`, 'i');
    const currentExe = findProjectExecutable(buildDir, tOs, tArch);
    let newExeName = null;
    for (const entry of fs.readdirSync(srcDir)) {
        if (!exePattern.test(entry)) continue;
        newExeName = entry;
        if (currentExe !== entry) {
            fs.copyFileSync(path.join(srcDir, entry), path.join(buildDir, entry));
            try { fs.chmodSync(path.join(buildDir, entry), 0o755); } catch (_) {}
            if (currentExe) {
                try { fs.unlinkSync(path.join(buildDir, currentExe)); } catch (_) {
                    ui.warn(`Could not remove old executable: ${currentExe}`);
                }
            }
            ui.ok(`Engine updated to ${entry}`);
        } else {
            ui.ok(`Engine already up-to-date (${entry})`);
        }
        break;
    }

    try { fs.rmSync(tmpExtract, { recursive: true, force: true }); } catch (_) {}

    // Sync version in info.json
    const verMatch = bundleAsset.name.match(/-(\d+\.\d+\.\d+(?:[.-][^-]+)?)-/);
    if (verMatch) {
        const info = loadInfo(projectRoot);
        if (info) { info.version = verMatch[1]; saveInfo(projectRoot, info); }
    }
}

// ─── Vanilla module update ────────────────────────────────────────────────────

/** Re-download JS API files to src/modules/renweb/. No-ops if directory doesn't exist. */
function updateVanillaModules(projectRoot) {
    const renwebDir = path.join(projectRoot, 'src', 'modules', 'renweb');
    if (!fs.existsSync(renwebDir)) return;
    ui.step('Updating RenWeb JS API modules…');
    const rawBase = engineRawBase(resolveEngineRepo(projectRoot));
    let updated = 0;
    for (const file of ['index.js', 'index.d.ts']) {
        const dest = path.join(renwebDir, file);
        const url  = `${rawBase}/web/api/${file}`;
        if (download(url, dest)) {
            ui.ok(file);
            updated++;
        } else {
            ui.warn(`Failed to update ${file}`);
        }
    }
    if (updated > 0) ui.ok(`JS API modules updated (${updated} file${updated !== 1 ? 's' : ''})`);
}

// ─── Plugin update ────────────────────────────────────────────────────────────

/** Download the host-arch binary for each plugin in info.json["plugin_repositories"] to build/plugins/. */
function updatePlugins(projectRoot, buildDir) {
    const info    = loadInfo(projectRoot);
    const plugins = (info && Array.isArray(info.plugin_repositories)) ? info.plugin_repositories : [];
    if (plugins.length === 0) return;

    const { os: tOs, arch: tArch } = detectTarget();
    const pluginCacheRoot = rwPluginsDir(projectRoot);
    const buildPluginsDir = path.join(buildDir, 'plugins');
    fs.mkdirSync(pluginCacheRoot, { recursive: true });
    fs.mkdirSync(buildPluginsDir, { recursive: true });
    ensureRwGitignore(projectRoot);

    ui.section(`Updating ${plugins.length} plugin${plugins.length !== 1 ? 's' : ''}`);

    for (const repoUrl of plugins) {
        const parsed = parseGitHubUrl(repoUrl);
        if (!parsed) { ui.warn(`Cannot parse plugin URL: ${repoUrl}`); continue; }
        const { owner, repo } = parsed;
        const cacheDir = path.join(pluginCacheRoot, `${owner}-${repo}`);
        fs.mkdirSync(cacheDir, { recursive: true });

        ui.step(`${owner}/${repo}`);
        const rel = fetchLatestRelease(repoUrl);
        if (!rel) { ui.warn('Could not fetch release metadata'); continue; }

        // Download only the asset matching the host OS+arch
        const hostPattern = new RegExp(`[_.-]${tOs}[_.-]${tArch}`, 'i');
        for (const asset of (rel.assets || [])) {
            const name = (asset.name || '').trim();
            const url  = asset.browser_download_url;
            if (!name || !url) continue;
            if (!hostPattern.test(name)) { continue; }
            const destPath = path.join(cacheDir, name);
            if (!download(url, destPath)) {
                ui.warn(`Failed to download ${name}`);
            } else {
                ui.ok(name);
            }
        }

        // Copy the host-arch binary to build/plugins/
        let entries;
        try { entries = fs.readdirSync(cacheDir); } catch (_) { entries = []; }
        const hostBinary = entries.find(f => hostPattern.test(f) && /\.(so|dll|dylib)$/.test(f));
        if (hostBinary) {
            fs.copyFileSync(path.join(cacheDir, hostBinary), path.join(buildPluginsDir, hostBinary));
            ui.ok(`Installed: ${hostBinary}`);
        }
    }
}

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const bundleOnly     = args.includes('--bundle-only');
    const executableOnly = args.includes('--executable-only');

    const verIdx = args.indexOf('--version');
    const tag    = verIdx !== -1 ? args[verIdx + 1] : null;

    const state = ProjectState.detect();
    if (!state) {
        ui.error('Not inside a RenWeb project (no info.json found).');
        process.exit(1);
    }
    const projectRoot = state.root;

    // ── 1. Package manager update ─────────────────────────────────────────────
    const pm = state.pkg_manager();
    if (pm && pm.name() !== 'none') {
        ui.step(`Updating ${pm.name()} packages…`);
        const r = pm.install();
        if (r && r.status !== 0) ui.warn('Package install returned non-zero');
        else if (r) ui.ok('Packages up to date');
    }

    // ── 2. Vanilla JS API modules ─────────────────────────────────────────────
    if (state.isVanilla()) {
        updateVanillaModules(projectRoot);
    }

    // ── 3. Engine / bundle update ─────────────────────────────────────────────

    const { os: tOs, arch: tArch } = detectTarget();
    const buildDir = path.join(projectRoot, 'build');
    const isMacOs  = process.platform === 'darwin';

    const label = tag ? `v${tag}` : 'latest';
    ui.step(`Checking for release ${label} (${tOs}-${tArch})…`);
    const release = fetchRelease(tag);
    if (!release) {
        ui.error('Could not reach GitHub — aborting.');
        process.exit(1);
    }

    // macOS never uses bundles; warn if --bundle-only was passed
    if (isMacOs) {
        if (bundleOnly) ui.warn('Bundles are not used on macOS — running executable-only update');
        updateExeOnly(projectRoot, buildDir, tOs, tArch, release);
        updatePlugins(projectRoot, buildDir);
        ui.ok('Done.');
        return;
    }

    // Explicit flag wins; otherwise auto-detect from bundle_exec script presence
    const bundleScript     = findBundleExecScript(buildDir);
    const isBundleInstall  = !!bundleScript;
    const useBundle = bundleOnly || (!executableOnly && isBundleInstall);

    if (useBundle) {
        if (bundleScript) ui.info(`Bundle install detected via ${bundleScript}`);
        updateBundle(projectRoot, buildDir, tOs, tArch, release);
    } else {
        updateExeOnly(projectRoot, buildDir, tOs, tArch, release);
    }

    // ── 4. Plugin update ──────────────────────────────────────────────────────
    updatePlugins(projectRoot, buildDir);

    ui.ok('Done');
}

module.exports = { run };
