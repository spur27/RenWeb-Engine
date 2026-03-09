'use strict';
// renweb update [--bundle-only | --executable-only]
// Updates the engine executable (and bundle libs/launcher) in an existing RenWeb project.
// Auto-detects bundle vs bare install; macOS always uses executable-only.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawnSync } = require('child_process');
const {
    download, fetchLatestRelease,
    detectTarget, findProjectRoot, findProjectExecutable,
    loadInfo, saveInfo, copyDir,
} = require('./shared');

// ─── Bundle detection ─────────────────────────────────────────────────────────

/**
 * Returns the bundle-exec script filename present in buildDir, or null.
 * Bundles always ship with bundle_exec.sh (Linux) or bundle_exec.bat (Windows).
 */
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
        console.warn(`  ⚠ No executable asset found for ${tOs}-${tArch}`);
        return;
    }

    const currentExe = findProjectExecutable(buildDir, tOs, tArch);
    if (currentExe === asset.name) {
        console.log(`  ✓ Engine already up-to-date (${asset.name})`);
    } else {
        const newDest = path.join(buildDir, asset.name);
        console.log(`  Downloading: ${asset.name}`);
        if (!download(asset.browser_download_url, newDest)) {
            console.warn('  ⚠ Download failed — engine not updated');
            return;
        }
        try { fs.chmodSync(newDest, 0o755); } catch (_) {}

        if (currentExe && currentExe !== asset.name) {
            try { fs.unlinkSync(path.join(buildDir, currentExe)); } catch (_) {
                console.warn(`  ⚠ Could not remove old executable: ${currentExe}`);
            }
        }
        console.log(`  ✓ Engine updated to ${asset.name}`);
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
        console.warn(`  ⚠ No bundle asset found for ${tOs}-${tArch} — falling back to executable-only`);
        updateExeOnly(projectRoot, buildDir, tOs, tArch, release);
        return;
    }

    const bundleAsset = assets[0];
    console.log(`  Downloading bundle: ${bundleAsset.name}`);
    const tmpTar = path.join(os.tmpdir(), `renweb-bundle-${Date.now()}.tar.gz`);
    if (!download(bundleAsset.browser_download_url, tmpTar)) {
        console.warn('  ⚠ Bundle download failed');
        return;
    }

    const tmpExtract = path.join(os.tmpdir(), `renweb-bundle-${Date.now()}`);
    fs.mkdirSync(tmpExtract, { recursive: true });
    const r = spawnSync('tar', ['-xzf', tmpTar, '-C', tmpExtract], { stdio: 'inherit' });
    try { fs.unlinkSync(tmpTar); } catch (_) {}
    if (r.status !== 0) { console.warn('  ⚠ Bundle extraction failed'); return; }

    // Archive is flat (created with `tar -C srcDir .`); files are at tmpExtract root
    const srcDir = tmpExtract;

    // Update lib/
    const srcLib = path.join(srcDir, 'lib');
    if (fs.existsSync(srcLib)) {
        console.log('  Updating lib/…');
        const destLib = path.join(buildDir, 'lib');
        try { fs.rmSync(destLib, { recursive: true, force: true }); } catch (_) {}
        copyDir(srcLib, destLib);
        console.log('  ✓ lib/ updated');
    }

    // Update bundle_exec script(s)
    for (const script of ['bundle_exec.sh', 'bundle_exec.bat']) {
        const src = path.join(srcDir, script);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(buildDir, script));
            try { fs.chmodSync(path.join(buildDir, script), 0o755); } catch (_) {}
            console.log(`  ✓ ${script} updated`);
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
                    console.warn(`  ⚠ Could not remove old executable: ${currentExe}`);
                }
            }
            console.log(`  ✓ Engine updated to ${entry}`);
        } else {
            console.log(`  ✓ Engine already up-to-date (${entry})`);
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

// ─── Entry ────────────────────────────────────────────────────────────────────

function run(args) {
    const bundleOnly     = args.includes('--bundle-only');
    const executableOnly = args.includes('--executable-only');

    const projectRoot = findProjectRoot();
    if (!projectRoot) {
        console.error('Not inside a RenWeb project (no info.json found).');
        process.exit(1);
    }

    const { os: tOs, arch: tArch } = detectTarget();
    const buildDir = path.join(projectRoot, 'build');
    const isMacOs  = process.platform === 'darwin';

    console.log(`\nChecking for latest release (${tOs}-${tArch})…`);
    const release = fetchLatestRelease();
    if (!release) {
        console.error('Could not reach GitHub — aborting.');
        process.exit(1);
    }

    // macOS never uses bundles; warn if --bundle-only was passed
    if (isMacOs) {
        if (bundleOnly) console.warn('  ⚠ Bundles are not used on macOS — running executable-only update');
        updateExeOnly(projectRoot, buildDir, tOs, tArch, release);
        console.log('\nDone.');
        return;
    }

    // Explicit flag wins; otherwise auto-detect from bundle_exec script presence
    const bundleScript     = findBundleExecScript(buildDir);
    const isBundleInstall  = !!bundleScript;
    const useBundle = bundleOnly || (!executableOnly && isBundleInstall);

    if (useBundle) {
        if (bundleScript) console.log(`  (Bundle install detected via ${bundleScript})`);
        updateBundle(projectRoot, buildDir, tOs, tArch, release);
    } else {
        updateExeOnly(projectRoot, buildDir, tOs, tArch, release);
    }

    console.log('\nDone.');
}

module.exports = { run };
