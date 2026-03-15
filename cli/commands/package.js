#!/usr/bin/env node
'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ENGINE_REPO = 'https://github.com/spur27/RenWeb-Engine';

/** Runtime deps shown in install.sh; ugly/bad are listed as "recommended". */
const LINUX_DEPS_REQUIRED = [
    'libgtk-3-0',
    'libwebkit2gtk-4.1-0',
    'gstreamer1.0-plugins-base',
    'gstreamer1.0-plugins-good',
];
const LINUX_DEPS_RECOMMENDED = [
    'gstreamer1.0-plugins-bad',
    'gstreamer1.0-plugins-ugly',   // patent-free to recommend; installs from distro repos
];

// Asset filename patterns produced by the engine's build system:
//   bare executable : {name}-{version}-{os}-{arch}[.exe]
//   bundle archive  : bundle[-bootstrap]-{version}-{os}-{arch}.{zip|tar.gz}
const RE_EXEC   = /^(.+)-(\d+[\w.]*)-(\w+)-([\w]+?)(?:\.exe)?$/;
const RE_BUNDLE = /^bundle(?:-(bootstrap))?-(\d+[\w.]*)-(\w+)-([\w]+?)\.(zip|tar\.gz)$/;

// Build files that must never be included in the packaged output
const BUILD_EXCLUDES        = new Set(['log.txt', 'plugins', 'lib']);
const BUILD_EXCLUDE_PREFIXES = ['lib-']; // e.g. lib-x86_64

// fpm native Linux package formats
const FPM_FORMATS = [
    'deb',      // Debian / Ubuntu / Mint …
    'rpm',      // Fedora / RHEL / openSUSE …
    'pacman',   // Arch Linux (needs zstd; fpm handles it natively)
    'apk',      // Alpine Linux
    'freebsd',  // FreeBSD txz
    // 'osxpkg' is NOT included here — pkgbuild is macOS-only and fpm cannot
    // cross-build osxpkg from Linux.  macOS .pkg is handled in the macOS step.
];
const FPM_EXT = {
    deb     : '.deb',
    rpm     : '.rpm',
    pacman  : '.pkg.tar.zst',
    apk     : '.apk',
    freebsd : '.txz',
};

// Maps engine arch names → fpm --architecture values.
// fpm normalises these per output format (e.g. x86_64→amd64 for deb).
const FPM_ARCH_MAP = {
    x86_64   : 'x86_64',
    x86_32   : 'i686',
    arm64    : 'aarch64',
    aarch64  : 'aarch64',
    arm32    : 'armhf',
    armhf    : 'armhf',
    mips32   : 'mips',
    mips32el : 'mipsel',
    mips64   : 'mips64',
    mips64el : 'mips64el',
    powerpc32: 'ppc',
    powerpc64: 'ppc64',
    riscv64  : 'riscv64',
    s390x    : 's390x',
    sparc64  : 'sparcv9',
};

// WebView2 runtime bootstrapper URL — required by bare Windows executables
const WEBVIEW2_BOOTSTRAPPER_URL = 'https://go.microsoft.com/fwlink/p/?LinkId=2124703';

// appimagetool static binary path inside the Docker image
const APPIMAGETOOL = '/opt/appimagetool';
// Per-architecture runtime stubs (ELF binary prepended to every AppImage).
// Must match the TARGET architecture, not the build host.
const APPIMAGE_RUNTIME_DIR = '/opt';
const APPIMAGE_RUNTIME_FOR_ARCH = {
    x86_64 : 'appimage-runtime-x86_64',
    i686   : 'appimage-runtime-i686',
    aarch64: 'appimage-runtime-aarch64',
    armhf  : 'appimage-runtime-armhf',
};

// ELF e_machine values for architectures we package.
const ELF_MACHINE_FOR_APPIMAGE_ARCH = { x86_64: 0x3E, i686: 0x03, aarch64: 0xB7, armhf: 0x28 };

// Paths to the ELF dynamic linker (PT_INTERP) inside the Debian cross-compile
/**
 * Returns the ELF e_machine uint16 for a file, or null if it is not an ELF.
 */
function readElfMachine(filePath) {
    try {
        const buf = Buffer.alloc(20);
        const fd  = fs.openSync(filePath, 'r');
        const n   = fs.readSync(fd, buf, 0, 20, 0);
        fs.closeSync(fd);
        if (n >= 20 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46)
            return buf.readUInt16LE(18);
    } catch (_) {}
    return null;
}

/**
 * Recursively remove every ELF file inside dir whose e_machine does not match
 * wantMachine.  Prevents appimagetool from aborting with
 * "More than one architectures were found".
 */
function purgeForeignElfs(dir, wantMachine) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { purgeForeignElfs(full, wantMachine); continue; }
        const machine = readElfMachine(full);
        if (machine !== null && machine !== wantMachine) {
            try { fs.rmSync(full, { force: true }); } catch (_) {}
        }
    }
}

// rcedit path inside the Docker image
const RCEDIT_EXE = '/opt/rcedit-x64.exe';

// ─── Low-level utils ─────────────────────────────────────────────────────────

function toKebab(str) {
    return str.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

function toSnake(str) {
    return str.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Derive a stable RFC-4122-like UUID from a string using MD5. */
function hashToUuid(str) {
    const h = crypto.createHash('md5').update(str).digest('hex');
    return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20,32)]
        .join('-').toUpperCase();
}

/**
 * Parse info.json `categories` into a valid freedesktop.org `Categories=` value.
 * Handles arrays, semicolon-separated strings, and space-separated strings.
 * Falls back to 'Utility;' when empty.
 * Ensures only one main category appears (freedesktop spec requirement).
 */
const FREEDESKTOP_MAIN_CATS = new Set([
    'AudioVideo','Audio','Video','Development','Education','Game','Graphics',
    'Network','Office','Science','Settings','System','Utility',
]);
function parseCats(raw) {
    if (!raw || (Array.isArray(raw) && raw.length === 0)) return 'Utility;';
    const arr = Array.isArray(raw) ? raw : raw.split(/[\s;]+/);
    const cats = arr.map(s => s.trim()).filter(Boolean);
    if (!cats.length) return 'Utility;';
    // Keep at most one main category; additional/extra cats are fine.
    let mainSeen = false;
    const filtered = cats.filter(c => {
        if (FREEDESKTOP_MAIN_CATS.has(c)) {
            if (mainSeen) return false;
            mainSeen = true;
        }
        return true;
    });
    return filtered.join(';') + ';';
}

/**
 * Download a URL to a local file using curl or wget.
 * Returns true on success.
 */
function download(url, dest) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    for (const [cmd, args] of [
        ['curl', ['-fsSL', '--output', dest, url]],
        ['wget', ['-q',    '-O',       dest, url]],
    ]) {
        try {
            const r = spawnSync(cmd, args, { stdio: 'inherit' });
            if (r.status === 0) return true;
        } catch (_) {}
    }
    return false;
}

/** tar-extract an archive into a directory (creates dir if needed). */
function extractTar(archive, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    const r = spawnSync('tar', ['-xzf', archive, '-C', destDir], { stdio: 'inherit' });
    return r.status === 0;
}

/** Recursively copy srcDir into destDir (destDir is created if needed). */
function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
    }
}

/** chmod +x a file, ignoring errors. */
function makeExecutable(p) {
    try { fs.chmodSync(p, 0o755); } catch (_) {}
}

/** Create a .tar.gz of srcDir's contents at destArchive. */
function makeTarGz(srcDir, destArchive) {
    fs.mkdirSync(path.dirname(destArchive), { recursive: true });
    const r = spawnSync('tar', ['-czf', destArchive, '-C', srcDir, '.'], { stdio: 'inherit' });
    return r.status === 0;
}

/** Create a .zip of srcDir's contents at destArchive. */
function makeZip(srcDir, destArchive) {
    fs.mkdirSync(path.dirname(destArchive), { recursive: true });
    // Run zip from inside srcDir so paths inside are relative
    const r = spawnSync('zip', ['-r', destArchive, '.'], { cwd: srcDir, stdio: 'inherit' });
    return r.status === 0;
}

/**
 * Find the first available executable from a list of candidate names.
 * Falls back to searching PATH directories manually when `which` is absent
 * (e.g. minimal Docker environments).
 * Returns the resolved command name/path, or null if none found.
 */
function findBin(...names) {
    for (const name of names) {
        // 1. Try `which` (most UNIX systems)
        const r = spawnSync('which', [name], { encoding: 'utf8' });
        if (r.status === 0) return (r.stdout || '').trim() || name;
        // 2. Scan PATH directories directly
        const dirs = (process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin')
            .split(':').filter(Boolean);
        for (const dir of dirs) {
            try {
                const full = path.join(dir, name);
                fs.accessSync(full, fs.constants.X_OK);
                return full;
            } catch (_) {}
        }
    }
    return null;
}

/** Fetch the latest GitHub release metadata JSON for a repo URL. */
function fetchLatestRelease(repoUrl) {
    if (!repoUrl.includes('github.com')) {
        throw new Error(`Unsupported repository URL: ${repoUrl}`);
    }
    const ownerRepo = repoUrl.split('github.com/').pop().replace(/\.git$/, '');
    const apiUrl    = `https://api.github.com/repos/${ownerRepo}/releases/latest`;
    console.log(`  Fetching release metadata: ${apiUrl}`);
    const tmpFile = path.join(os.tmpdir(), `renweb-rel-${Date.now()}.json`);
    if (!download(apiUrl, tmpFile)) {
        throw new Error(`Failed to fetch release metadata from ${apiUrl}`);
    }
    const rel = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return rel;
}

/** Find the build/ directory by walking up from cwd. */
function findBuildDir() {
    let cur = process.env.RENWEB_CWD ? path.resolve(process.env.RENWEB_CWD) : process.cwd();
    while (true) {
        const cand = path.join(cur, 'build');
        if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) return cand;
        const parent = path.dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}

// ─── Argument parsing ────────────────────────────────────────────────────────

/** Normalize ext aliases to a canonical lowercase form. */
function normalizeExt(raw) {
    const s = raw.toLowerCase().replace(/^\./, '');
    if (s === 'tgz')                               return 'tar.gz';
    if (s === 'txz')                               return 'freebsd';
    if (s === 'pkg.tar.zst' || s === 'alpm')       return 'pacman';
    if (s === 'appimage')                          return 'AppImage';
    if (s === 'msi')                               return 'msi';
    if (s === 'choco' || s === 'chocolatey')       return 'choco';
    if (s === 'nuget' || s === 'nupkg')            return 'nuget';
    if (s === 'winget')                            return 'winget';
    if (s === 'scoop')                             return 'scoop';
    if (s === 'brew' || s === 'homebrew')          return 'homebrew';
    if (s === 'snap')                              return 'snap';
    if (s === 'flatpak')                           return 'flatpak';
    if (s === 'setup' || s === 'nsis')             return 'exe';    // NSIS installer output
    if (s === 'pkg' && raw.indexOf('.') === -1)    return 'osxpkg'; // bare "pkg" = macOS pkg
    if (s === 'msix')                              return 'msix';
    if (s === 'mas' || s === 'macstore')           return 'mas';
    return s;
}

/**
 * Parse CLI args passed to run().
 *   --bundle-only        Only process bundle archives (skip bare executables)
 *   --executable-only    Only process bare executables (skip bundles)
 *   -e<ext> / --ext <ext>  Output format filter (repeatable); empty = all
 *   -o<os>  / --os  <os>   Target OS filter (repeatable); empty = all
 *   -c / --cache         Reuse cached downloads in ./.package
 */
function parseArgs(args) {
    const opts = {
        bundleOnly     : false,
        executableOnly : false,
        exts           : new Set(),   // empty = all formats
        oses           : new Set(),   // empty = all OS targets
        cache          : false,
    };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--bundle-only')                    { opts.bundleOnly = true;     continue; }
        if (a === '--executable-only')                { opts.executableOnly = true; continue; }
        if (a === '-c' || a === '--cache')            { opts.cache = true;          continue; }
        if (a.startsWith('-e') && a.length > 2)       { opts.exts.add(normalizeExt(a.slice(2))); continue; }
        if (a === '-e' || a === '--ext')              { const v = args[++i]; if (v) opts.exts.add(normalizeExt(v)); continue; }
        if (a.startsWith('-o') && a.length > 2)       { opts.oses.add(a.slice(2).toLowerCase()); continue; }
        if (a === '-o' || a === '--os')               { const v = args[++i]; if (v) opts.oses.add(v.toLowerCase()); continue; }
    }
    return opts;
}

// ─── Asset name parsing ───────────────────────────────────────────────────────

/**
 * Parse a bare-executable release asset filename.
 * Returns { name, version, os, arch } or null.
 */
function parseExecAsset(filename) {
    const m = RE_EXEC.exec(filename);
    if (!m) return null;
    return { name: m[1], version: m[2], os: m[3], arch: m[4] };
}

/**
 * Parse a bundle archive release asset filename.
 * Returns { bootstrap, version, os, arch, ext } or null.
 */
function parseBundleAsset(filename) {
    const m = RE_BUNDLE.exec(filename);
    if (!m) return null;
    return { bootstrap: !!m[1], version: m[2], os: m[3], arch: m[4], ext: m[5] };
}

/**
 * Group a release's assets by {os}-{arch}.
 * Each group gets: { bare?, bundle?, bootstrap? }
 *   bare      — plain executable (no bundled libs)
 *   bundle    — tar.gz with bundled libs
 *   bootstrap — bundle-bootstrap variant (self-extracting bootstrapper)
 */
function groupAssets(assets) {
    const groups = new Map();
    for (const asset of (assets || [])) {
        const name = (asset.name || '').trim();
        const url  = asset.browser_download_url;
        if (!name || !url) continue;

        const exec = parseExecAsset(name);
        if (exec) {
            const key = `${exec.os}-${exec.arch}`;
            const g   = groups.get(key) || {};
            g.bare    = { ...exec, filename: name, url };
            groups.set(key, g);
            continue;
        }
        const bundle = parseBundleAsset(name);
        if (bundle && bundle.ext === 'tar.gz') {
            const key = `${bundle.os}-${bundle.arch}`;
            const g   = groups.get(key) || {};
            if (bundle.bootstrap) {
                g.bootstrap = { ...bundle, filename: name, url };
            } else {
                g.bundle    = { ...bundle, filename: name, url };
            }
            groups.set(key, g);
        }
    }
    return groups;
}

// ─── Staging / package builder ────────────────────────────────────────────────

/**
 * Build one staging tree for (os, arch), package it, and write outputs.
 *
 * Bundles   → ./package/{os}/bundle/{stem}.tar.gz  and  .zip
 * Bare exes → ./package/{os}/{stem}.tar.gz, .zip, plus fpm packages (linux)
 */
function buildPackageForTarget(opts, buildSrc, pluginDirs, engineAsset, info, pkgDir, tmpDir, homebrewBottles) {
    const { os: targetOs, arch: targetArch } = engineAsset;
    const pkgId      = toKebab(info.title || 'app');
    const version    = (info.version || '0.0.1').trim();
    const stem       = `${pkgId}-${version}-${targetOs}-${targetArch}`;
    // Route output to the right subdirectory:
    //   bootstrap bundles  → package/{os}/bundle_bootstrap/
    //   regular bundles    → package/{os}/bundle/
    //   bare executables   → package/{os}/
    const outDir = engineAsset.isBootstrap
        ? path.join(pkgDir, targetOs, 'bundle_bootstrap')
        : engineAsset.isBundle
            ? path.join(pkgDir, targetOs, 'bundle')
            : path.join(pkgDir, targetOs);
    const stagingSuffix = engineAsset.isBootstrap ? '-bundle-bootstrap'
                        : engineAsset.isBundle     ? '-bundle'
                        : '';
    const stagingDir = path.join(tmpDir, stem + stagingSuffix);    

    console.log(`\n── Building ${stem}${engineAsset.isBundle ? ' [bundle]' : ''} ──`);

    // 1. Fresh staging tree
    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    // 2. Copy sanitised build/ content
    console.log('  Copying build files…');
    copyDir(buildSrc, stagingDir);

    // 3. Copy matching plugins → staging/plugins/
    if (pluginDirs.length > 0) {
        console.log(`  Copying ${pluginDirs.length} plugin bundle(s)…`);
        const stagingPlugins = path.join(stagingDir, 'plugins');
        fs.mkdirSync(stagingPlugins, { recursive: true });
        for (const pDir of pluginDirs) copyDir(pDir, stagingPlugins);
    }

    // 4. Place the engine executable (or extract bundle)
    if (engineAsset.isBundle) {
        console.log('  Extracting bundle archive…');
        extractTar(engineAsset.localPath, stagingDir);
    } else {
        const exeDest = path.join(stagingDir, engineAsset.filename);
        fs.copyFileSync(engineAsset.localPath, exeDest);
        makeExecutable(exeDest);
    }

    // 4a. Patch Windows PE version info + icon immediately after the exe lands in
    //     staging so that ALL outputs (tar.gz, zip, NSIS, MSI, MSIX, choco) contain
    //     the patched binary.  Must happen before the step-5 archiving below.
    if (targetOs === 'windows' || targetOs === 'win') {
        const winExe = path.join(stagingDir, engineAsset.filename);
        if (fs.existsSync(winExe)) patchWindowsExe(winExe, info);
    }

    // 5. Archive outputs (tar.gz / zip) — raw files only, no wrapper scripts
    fs.mkdirSync(outDir, { recursive: true });
    const wantTarGz = opts.exts.size === 0 || opts.exts.has('tar.gz');
    const wantZip   = opts.exts.size === 0 || opts.exts.has('zip');

    if (wantTarGz) {
        const dest = path.join(outDir, `${stem}.tar.gz`);
        console.log(`  → ${path.relative(process.cwd(), dest)}`);
        if (!makeTarGz(stagingDir, dest)) console.warn(`  ⚠ tar failed for ${stem}`);
    }
    if (wantZip) {
        const dest = path.join(outDir, `${stem}.zip`);
        console.log(`  → ${path.relative(process.cwd(), dest)}`);
        if (!makeZip(stagingDir, dest)) console.warn(`  ⚠ zip failed for ${stem}`);
    }

    // 6. OS-specific native packages
    if (targetOs === 'linux') {
        // deb / rpm / pacman / apk / freebsd / sh via fpm
        buildFpmPackages(opts, info, stagingDir, targetOs, targetArch, outDir, tmpDir, engineAsset.isBundle, engineAsset.filename);
        // AppImage (portable, no install needed)
        buildAppImage(opts, info, stagingDir, targetArch, outDir, engineAsset.isBundle, engineAsset.filename);
        // Snap package (squashfs-based, built inline)
        buildSnapPackage(opts, info, stagingDir, targetArch, outDir, engineAsset.isBundle, engineAsset.filename);
        // Flatpak bundle (.flatpak single-file, built via flatpak-builder --disable-sandbox)
        buildFlatpakBundle(opts, info, stagingDir, targetArch, outDir, engineAsset.isBundle, engineAsset.filename);
    }

    if (targetOs === 'windows' || targetOs === 'win') {
        // NSIS installer
        const nsisOut = path.join(outDir, `${stem}-setup.exe`);
        buildNsisInstaller(opts, info, stagingDir, targetArch, nsisOut, engineAsset.isBundle);
        // MSI installer via wixl
        buildMsiInstaller(opts, info, stagingDir, targetArch, path.join(outDir, `${stem}.msi`), engineAsset.isBundle);
        // MSIX / Windows Store package via makemsix
        buildMsixPackage(opts, info, stagingDir, targetArch, path.join(outDir, `${stem}.msix`), engineAsset.isBundle, engineAsset.filename);
        // Chocolatey nupkg (single file, root of windows output dir)
        buildChocoPackage(opts, info, targetArch, nsisOut, outDir, engineAsset.isBundle);
    }

    if (targetOs === 'macos' || targetOs === 'darwin') {
        // DMG disk image
        const dmgOut = path.join(outDir, `${stem}.dmg`);
        buildMacDmg(opts, info, stagingDir, targetArch, dmgOut);
        // macOS .pkg installer via fpm osxpkg — requires pkgbuild (macOS-only binary)
        if (opts.exts.size === 0 || opts.exts.has('osxpkg') || opts.exts.has('pkg')) {
            const pkgbuildOk = spawnSync('which', ['pkgbuild'], { encoding: 'utf8' }).status === 0;
            if (!pkgbuildOk) {
                console.log('  [osxpkg] skipped — pkgbuild not available (macOS only)');
            } else {
                const pkgOut = path.join(outDir, `${stem}.pkg`);
                const r = spawnSync('fpm', [
                    '-s', 'dir', '-t', 'osxpkg',
                    '-n', toKebab(info.title || 'app'),
                    '-v', (info.version || '0.0.1').trim(),
                    '--description', info.description || info.title || 'App',
                    '-p', pkgOut, '-C', stagingDir, '.',
                ], { stdio: 'inherit' });
                if (r.status === 0) console.log(`  [osxpkg] → ${path.relative(process.cwd(), pkgOut)}`);
                else console.warn('  ⚠ fpm osxpkg failed');
            }
        }
        // Homebrew formula — collect bottle info; formula written once after all archs
        generateHomebrewFormula(opts, info, targetArch, outDir, stagingDir, engineAsset.isBundle, engineAsset.filename, homebrewBottles);
        // macOS App Store .pkg via productbuild (macOS-only; skipped in Docker/Linux)
        buildMacAppStorePackage(opts, info, stagingDir, targetArch, outDir, engineAsset.isBundle, engineAsset.filename);
    }

    console.log(`  \u2713 ${stem} done`);

    // Free the staging tree immediately to avoid accumulating gigabytes of
    // bundle libs across the many targets (would exhaust disk in Docker).
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build Linux native packages (deb, rpm, pacman, apk, freebsd) using fpm.
 * Creates a system-layout staging tree (/usr/share, /usr/bin, etc.) then
 * invokes fpm for each requested format.
 */
/**
 * @param {boolean} isBundle  When true the package bundles its own libs, so no
 *                            runtime deps are declared.
 */
function buildFpmPackages(opts, info, stagingDir, targetOs, targetArch, outDir, tmpDir, isBundle = false, exeFilename = '') {
    const pkgId   = toKebab(info.title || 'app');
    const version = (info.version || '0.0.1').trim();
    const desc    = info.description || '';
    const license = info.license     || 'BSL-1.0';
    const website = info.repository  || '';

    // Which fpm formats to produce (filtered by -e flag)
    const formats = FPM_FORMATS.filter(fmt => opts.exts.size === 0 || opts.exts.has(fmt));
    if (formats.length === 0) return;

    // Require fpm
    const fpmCheck = spawnSync('fpm', ['--version'], { encoding: 'utf8' });
    if (fpmCheck.status !== 0) {
        console.warn('  ⚠ fpm not found — skipping native Linux packages');
        return;
    }

    // Build system-layout staging tree
    // Include bundle flag in path so bare and bundle builds never share a directory.
    const fpmRoot  = path.join(tmpDir, 'fpm-staging', `${pkgId}-${version}-${targetOs}-${targetArch}${isBundle ? '-bundle' : ''}`);
    const appShare = path.join(fpmRoot, 'opt', pkgId);
    const appsDir  = path.join(fpmRoot, 'usr', 'share', 'applications');
    const iconsDir = path.join(fpmRoot, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const binDir   = path.join(fpmRoot, 'usr', 'bin');

    if (fs.existsSync(fpmRoot)) fs.rmSync(fpmRoot, { recursive: true, force: true });
    for (const d of [appShare, appsDir, iconsDir, binDir]) fs.mkdirSync(d, { recursive: true });

    // App files → /opt/<pkgId>/
    copyDir(stagingDir, appShare);

    // /usr/bin/<pkgId> → exec the real binary (or bundle_exec.sh) directly
    const binTarget   = isBundle ? `bundle_exec.sh` : exeFilename;
    const binLauncher = `#!/bin/sh\nexec /opt/${pkgId}/${binTarget} "$@"\n`;
    const binPath     = path.join(binDir, pkgId);
    fs.writeFileSync(binPath, binLauncher, 'utf8');
    makeExecutable(binPath);

    // Icon
    let iconSystemPath = pkgId; // fallback: icon name only (theme lookup)
    for (const ext of ['png', 'svg', 'jpg']) {
        for (const cand of [
            path.join(stagingDir, 'resource',  `icon.${ext}`),
            path.join(stagingDir, 'resource',  `app.${ext}`),
            path.join(stagingDir, 'resources', `icon.${ext}`),
            path.join(stagingDir, 'resources', `app.${ext}`),
        ]) {
            if (fs.existsSync(cand)) {
                fs.copyFileSync(cand, path.join(iconsDir, `${pkgId}.${ext}`));
                iconSystemPath = `/usr/share/icons/hicolor/256x256/apps/${pkgId}.${ext}`;
                break;
            }
        }
        if (iconSystemPath !== pkgId) break;
    }

    // .desktop file (system paths)
    const cats     = parseCats(info.categories || info.category);
    const appId    = info.app_id || pkgId;
    const desktopLines = [
        '[Desktop Entry]',
        'Version=1.0',
        'Type=Application',
        `Name=${info.title || pkgId}`,
        `Comment=${desc}`,
        `Exec=/opt/${pkgId}/${isBundle ? 'bundle_exec.sh' : exeFilename}`,
        `TryExec=/opt/${pkgId}/${isBundle ? 'bundle_exec.sh' : exeFilename}`,
        `Icon=${iconSystemPath}`,
        'Terminal=false',
        `Categories=${cats}`,
        `StartupWMClass=${appId}`,
        'StartupNotify=true',
        `X-RenWeb-PackageId=${pkgId}`,
    ];
    if (website) desktopLines.push(`URL=${website}`);
    desktopLines.push('');
    fs.writeFileSync(path.join(appsDir, `${pkgId}.desktop`), desktopLines.join('\n'), 'utf8');

    // Run fpm for each format
    for (const fmt of formats) {
        const stem       = `${pkgId}-${version}-${targetOs}-${targetArch}`;
        const outputFile = path.join(outDir, `${stem}${FPM_EXT[fmt]}`);
        // Give each fpm invocation its own isolated copy of the staging tree.
        // Some fpm backend/format combinations delete or rename the source
        // directory after packaging, which would break subsequent format runs.
        const fmtRoot = fpmRoot + '-' + fmt;
        if (fs.existsSync(fmtRoot)) fs.rmSync(fmtRoot, { recursive: true, force: true });
        copyDir(fpmRoot, fmtRoot);
        // All package managers prefer hyphens over underscores in package names
        const fpmArgs    = [
            '-s', 'dir', '-t', fmt,
            '-n', pkgId, '-v', version,
            '--description', desc || pkgId,
            '-p', outputFile,
            '-C', fmtRoot,
            '--prefix', '/',
        ];
        if (website) fpmArgs.push('--url', website);
        if (license) fpmArgs.push('--license', license);
        const fpmArch = FPM_ARCH_MAP[targetArch];
        if (fpmArch) fpmArgs.push('--architecture', fpmArch);
        // Bundle releases carry their own .so libs — no runtime deps needed
        if (!isBundle) {
            for (const dep of LINUX_DEPS_REQUIRED) fpmArgs.push('--depends', dep);
            if (fmt === 'deb') {
                for (const dep of LINUX_DEPS_RECOMMENDED) fpmArgs.push('--deb-recommends', dep);
            }
        }
        // Post-install: make the app directory writable so the engine can write
        // log.txt, saves, and other runtime files next to the executable.
        const postInstallScript = path.join(os.tmpdir(), `_renweb-postinstall-${pkgId}-${fmt}.sh`);
        fs.writeFileSync(postInstallScript,
            `#!/bin/sh\nchmod -R a+rwX /opt/${pkgId}/\n`, 'utf8');
        makeExecutable(postInstallScript);
        fpmArgs.push('--after-install', postInstallScript);

        // Post-remove: force-delete the install directory so dpkg/rpm don't
        // leave it behind when the app has written runtime files (log.txt, etc.).
        const postRemoveScript = path.join(os.tmpdir(), `_renweb-postremove-${pkgId}-${fmt}.sh`);
        fs.writeFileSync(postRemoveScript,
            `#!/bin/sh\nrm -rf /opt/${pkgId}/\n`, 'utf8');
        makeExecutable(postRemoveScript);
        fpmArgs.push('--after-remove', postRemoveScript);

        fpmArgs.push('.');

        console.log(`  [fpm ${fmt}] → ${path.relative(process.cwd(), outputFile)}`);
        try { fs.unlinkSync(outputFile); } catch (_) {} // remove stale file so fpm doesn't refuse to overwrite
        const r = spawnSync('fpm', fpmArgs, { stdio: 'inherit' });
        try { fs.unlinkSync(postInstallScript); } catch (_) {}
        try { fs.unlinkSync(postRemoveScript); } catch (_) {}
        try { fs.rmSync(fmtRoot, { recursive: true, force: true }); } catch (_) {} // free space immediately
        if (r.status !== 0) console.warn(`  ⚠ fpm failed for format: ${fmt}`);
    }

    try { fs.rmSync(fpmRoot, { recursive: true, force: true }); } catch (_) {}
}

// ─── Windows packaging ───────────────────────────────────────────────────────

/**
 * Patch version info + icon into a Windows .exe using rcedit (via Wine64).
 * Does nothing if rcedit or wine64 are absent (non-Docker environments).
 */
function patchWindowsExe(exePath, info) {
    // Accept wine64 or wine64-stable (Debian bullseye installs the latter).
    const wineBin  = findBin('wine64', 'wine64-stable');
    const rceditOk = fs.existsSync(RCEDIT_EXE);
    if (!wineBin || !rceditOk) {
        console.log('  (rcedit/wine64 not available — skipping PE version patch)');
        return;
    }

    const version    = (info.version || '0.0.1').trim();
    // Windows file-version must be four dotted numbers: 1.2.3.0
    const winVer     = version.replace(/[^\d.]/g, '').split('.').slice(0, 4)
                        .concat(['0','0','0','0']).slice(0, 4).join('.');
    const title      = info.title       || 'App';
    const desc       = info.description || title;
    const author     = info.author      || '';
    const website    = info.repository  || info.website || '';
    const copyright  = author ? `Copyright \u00a9 ${new Date().getFullYear()} ${author}` : '';

    const rcArgs = [
        '--set-version-string', 'ProductName',      title,
        '--set-version-string', 'FileDescription',  desc,
        '--set-version-string', 'InternalName',     title,
        '--set-version-string', 'OriginalFilename', path.basename(exePath),
        '--set-file-version',    winVer,
        '--set-product-version', winVer,
    ];
    if (copyright) rcArgs.push('--set-version-string', 'LegalCopyright', copyright);
    if (author)    rcArgs.push('--set-version-string', 'CompanyName',    author);
    if (website)   rcArgs.push('--set-version-string', 'Comments',       website);

    // Icon search order:
    //   1. info.json "icon" field (absolute or relative to build dir)
    //   2. staging dir resource/ subfolder (app.ico / icon.ico)
    //   3. staging dir root
    const exeDir = path.dirname(exePath);
    const iconCandidates = [
        info.icon ? path.resolve(exeDir, info.icon) : null,
        path.join(exeDir, 'resource',  'app.ico'),
        path.join(exeDir, 'resource',  'icon.ico'),
        path.join(exeDir, 'resources', 'app.ico'),
        path.join(exeDir, 'resources', 'icon.ico'),
        path.join(exeDir, 'app.ico'),
        path.join(exeDir, 'icon.ico'),
    ].filter(Boolean);
    const iconPath = iconCandidates.find(p => fs.existsSync(p));
    if (iconPath) {
        rcArgs.push('--set-icon', iconPath);
        console.log(`  Using icon: ${path.relative(process.cwd(), iconPath)}`);
    } else {
        console.warn('  \u26a0 No .ico found — executable icon will not be changed');
    }

    // Use the pre-initialised Wine prefix from /opt/wine.
    // Wine refuses to use a prefix not owned by the current user, so when
    // running as --user in Docker (where /opt/wine is root-owned), copy the
    // prefix to a user-owned tmpdir and point WINEPREFIX there.
    console.log('  Patching Windows PE resources (rcedit via wine64)…');
    const BASE_WINE_PREFIX = '/opt/wine';
    let winePrefix = BASE_WINE_PREFIX;
    const myUid = typeof process.getuid === 'function' ? process.getuid() : -1;
    let prefixOwnedByUs = false;
    try {
        const st = fs.statSync(BASE_WINE_PREFIX);
        prefixOwnedByUs = (myUid >= 0 && st.uid === myUid);
    } catch (_) {}
    if (!prefixOwnedByUs) {
        const tmpPrefix = path.join(require('os').tmpdir(), `renweb-wine-${myUid >= 0 ? myUid : 'u'}`);
        if (!fs.existsSync(tmpPrefix)) {
            console.log('  Copying Wine prefix to user-owned tmpdir…');
            fs.mkdirSync(tmpPrefix, { recursive: true });
            // --no-preserve=ownership so copied files are owned by the current user.
            spawnSync('cp', ['-a', '--no-preserve=ownership', BASE_WINE_PREFIX + '/.', tmpPrefix + '/'], { stdio: 'inherit' });
        }
        winePrefix = tmpPrefix;
    }
    const r = spawnSync(wineBin, [RCEDIT_EXE, exePath, ...rcArgs], {
        stdio : 'inherit',
        env   : { ...process.env, WINEDEBUG: '-all', WINEARCH: 'win64', WINEPREFIX: winePrefix },
    });
    if (r.status !== 0) console.warn('  \u26a0 rcedit returned non-zero — PE patch may have failed');
    else console.log('  PE resources patched: ProductName, FileDescription, CompanyName, version ' + winVer);
}

/**
 * Generate a .nsi script and compile it with makensis (native Linux binary — no Wine).
 * Non-bundle packages silently download + install the WebView2 Bootstrapper if absent.
 *
 * Escaping note: string concatenation is used for NSIS lines to avoid any
 * ambiguity between JS template-literal ${} and NSIS $VAR / registry paths.
 */
function buildNsisInstaller(opts, info, stagingDir, arch, outPath, isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('exe')) return;

    if (spawnSync('which', ['makensis'], { encoding: 'utf8' }).status !== 0) {
        console.warn('  ⚠ makensis not found — skipping NSIS installer'); return;
    }

    const title   = info.title       || 'App';
    const version = (info.version    || '0.0.1').trim();
    const desc    = info.description || title;
    const pkgId   = toKebab(info.title || 'app');
    const author  = info.author      || title;
    const website = info.repository  || '';
    const winVer  = version.replace(/[^\d.]/g,'').split('.').concat(['0','0','0','0']).slice(0,4).join('.');
    const exeName = pkgId + '-' + version + '-windows-' + arch + '.exe';
    const ukey    = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + pkgId;

    let iconLine = '';
    for (const cand of [
        path.join(stagingDir, 'resource',  'icon.ico'),
        path.join(stagingDir, 'resource',  'app.ico'),
        path.join(stagingDir, 'resources', 'icon.ico'),
    ]) {
        if (fs.existsSync(cand)) { iconLine = 'Icon "' + cand + '"'; break; }
    }

    const lines = [];
    const L = (s = '') => lines.push(s);

    L('!define APPNAME   "' + title   + '"');
    L('!define APPID     "' + pkgId   + '"');
    L('!define VERSION   "' + version + '"');
    L('!define PUBLISHER "' + author  + '"');
    if (website) L('!define WEBSITE   "' + website + '"');
    L();
    L('Name "' + title + '"');
    L('OutFile "' + outPath + '"');
    L('InstallDir "$PROGRAMFILES64\\' + title  + '"');
    L('InstallDirRegKey HKCU "Software\\' + pkgId + '" "InstallDir"');
    L('RequestExecutionLevel admin');
    if (iconLine) L(iconLine);
    L();
    L('VIProductVersion "' + winVer  + '"');
    L('VIAddVersionKey "ProductName"     "' + title   + '"');
    L('VIAddVersionKey "FileDescription" "' + desc    + '"');
    L('VIAddVersionKey "FileVersion"     "' + version + '"');
    L('VIAddVersionKey "ProductVersion"  "' + version + '"');
    L('VIAddVersionKey "LegalCopyright"  "Copyright (C) ' + author + '"');
    if (author !== title) L('VIAddVersionKey "CompanyName"     "' + author + '"');
    L();
    L('!include "MUI2.nsh"');
    L('!include "LogicLib.nsh"');
    L('!insertmacro MUI_PAGE_WELCOME');
    L('!insertmacro MUI_PAGE_DIRECTORY');
    L('!insertmacro MUI_PAGE_INSTFILES');
    L('!insertmacro MUI_PAGE_FINISH');
    L('!insertmacro MUI_UNPAGE_CONFIRM');
    L('!insertmacro MUI_UNPAGE_INSTFILES');
    L('!insertmacro MUI_LANGUAGE "English"');
    L();
    L('Section "Install"');
    L('  SetOutPath "$INSTDIR"');
    L('  File /r "' + stagingDir + '/"');
    L('  WriteRegStr HKCU "Software\\' + pkgId + '" "InstallDir" "$INSTDIR"');
    L('  WriteUninstaller "$INSTDIR\\Uninstall.exe"');
    L('  CreateShortCut "$DESKTOP\\' + title + '.lnk" "$INSTDIR\\' + exeName + '"');
    L('  WriteRegStr HKLM "' + ukey + '" "DisplayName"    "' + title   + '"');
    L('  WriteRegStr HKLM "' + ukey + '" "UninstallString" "$INSTDIR\\Uninstall.exe"');
    L('  WriteRegStr HKLM "' + ukey + '" "DisplayVersion"  "' + version + '"');
    L('  WriteRegStr HKLM "' + ukey + '" "Publisher"       "' + author  + '"');
    if (website) L('  WriteRegStr HKLM "' + ukey + '" "URLInfoAbout"    "' + website + '"');
    if (!isBundle) {
        L();
        L('  ; Check for WebView2 Runtime and install bootstrapper if missing');
        L('  ReadRegStr $0 HKLM "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"');
        L('  ${If} $0 == ""');
        L('    ReadRegStr $0 HKCU "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"');
        L('  ${EndIf}');
        L('  ${If} $0 == ""');
        L('    NSISdl::download "' + WEBVIEW2_BOOTSTRAPPER_URL + '" "$TEMP\\MicrosoftEdgeWebview2Setup.exe"');
        L('    ExecWait "$TEMP\\MicrosoftEdgeWebview2Setup.exe /silent /install"');
        L('  ${EndIf}');
    }
    L('SectionEnd');
    L();
    L('Section "Uninstall"');
    L('  RMDir /r "$INSTDIR"');
    L('  DeleteRegKey HKCU "Software\\' + pkgId + '"');
    L('  DeleteRegKey HKLM "' + ukey + '"');
    L('  Delete "$DESKTOP\\' + title + '.lnk"');
    L('SectionEnd');
    L();

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const nsiPath = path.join(os.tmpdir(), '_renweb-nsis-' + pkgId + '-' + arch + '.nsi');
    fs.writeFileSync(nsiPath, 'Unicode true\n' + lines.join('\n'), 'utf8');
    console.log('  [nsis] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync('makensis', [nsiPath], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 makensis failed');
    try { fs.unlinkSync(nsiPath); } catch (_) {}
}

/**
 * Build a Windows .msi installer via wixl (msitools) — native Linux binary, no Wine.
 * Uses wixl-heat to harvest staging dir files automatically.
 */
function buildMsiInstaller(opts, info, stagingDir, arch, outPath, isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('msi')) return;
    if (!findBin('wixl')) {
        console.warn('  \u26a0 wixl not found \u2014 skipping MSI'); return;
    }

    const title       = info.title    || 'App';
    const version     = (info.version || '0.0.1').trim();
    const desc        = info.description || title;
    const pkgId       = toKebab(info.title || 'app');
    const author      = info.author   || title;
    const website     = info.repository || '';
    const productCode = hashToUuid(pkgId + '-product-' + version);
    const upgradeCode = hashToUuid(pkgId + '-upgrade');
    const tmpBase     = path.join(path.dirname(outPath), '_msi-' + pkgId + '-' + arch);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });

    // MSI version must be strictly numeric (max four dotted parts)
    const msiVersion   = version.replace(/[^\d.]/g, '').split('.').slice(0, 4)
                         .concat(['0','0','0','0']).slice(0, 4).join('.');
    const progFilesDir = (arch === 'x86_32') ? 'ProgramFilesFolder' : 'ProgramFiles64Folder';

    // ── Walk staging dir and generate a WXS fragment with every file ───────
    // wixl-heat v0.101 (Debian bullseye) has a bug where it produces empty
    // ComponentGroup output. Generate the fragment manually instead.
    // wixl v0.101 also does not support the Directory attribute on <Component>
    // — components must be nested *inside* their parent <Directory> element,
    // with a separate <ComponentRef> list in the <ComponentGroup>.
    function xmlEscape(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    let idCounter   = 0;
    const compIds   = [];  // collected component IDs for ComponentGroup

    // Recursively builds the body XML (lines) to nest inside a <DirectoryRef>
    // or <Directory> element. Returns an array of XML line strings.
    function buildDirBody(dirPath, indent) {
        const lines   = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        // Files first: one <Component><File/></Component> per file
        for (const e of entries.filter(e => e.isFile())) {
            const n    = ++idCounter;
            const cid  = 'COMP' + n;
            const fid  = 'FILE' + n;
            const guid = hashToUuid(pkgId + '-comp-' + path.join(dirPath, e.name)).toUpperCase();
            compIds.push(cid);
            lines.push(
                indent + '<Component Id="' + cid + '" Guid="{' + guid + '}">',
                indent + '  <File Id="' + fid + '" Source="' + xmlEscape(path.join(dirPath, e.name)) + '" KeyPath="yes"/>',
                indent + '</Component>',
            );
        }
        // Then subdirectories, each with its own nested body
        for (const e of entries.filter(e => e.isDirectory())) {
            const did      = 'DIR' + (++idCounter);
            const body     = buildDirBody(path.join(dirPath, e.name), indent + '  ');
            if (body.length) {
                lines.push(indent + '<Directory Id="' + did + '" Name="' + xmlEscape(e.name) + '">');
                lines.push(...body);
                lines.push(indent + '</Directory>');
            } else {
                lines.push(indent + '<Directory Id="' + did + '" Name="' + xmlEscape(e.name) + '"/>');
            }
        }
        return lines;
    }

    const dirBody  = buildDirBody(stagingDir, '      ');
    const filesWxs = path.join(tmpBase, 'files.wxs');
    const filesContent = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">',
        '  <Fragment>',
        '    <DirectoryRef Id="APPDIR">',
        ...dirBody,
        '    </DirectoryRef>',
        '  </Fragment>',
        '  <Fragment>',
        '    <ComponentGroup Id="AppFiles">',
        ...compIds.map(id => '      <ComponentRef Id="' + id + '"/>'),
        '    </ComponentGroup>',
        '  </Fragment>',
        '</Wix>',
        '',
    ].join('\n');
    fs.writeFileSync(filesWxs, filesContent, 'utf8');

    const productWxs  = path.join(tmpBase, 'product.wxs');
    const wxsContent  = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">',
        '  <Product Name="' + xmlEscape(title) + '" Id="{' + productCode + '}"',
        '           UpgradeCode="{' + upgradeCode + '}"',
        '           Version="' + msiVersion + '" Language="1033" Manufacturer="' + xmlEscape(author) + '">',
        '    <Package Compressed="yes" InstallerVersion="200"/>',
        '    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed."/>',
        website ? '    <Property Id="ARPHELPLINK" Value="' + xmlEscape(website) + '"/>' : '',
        '    <Media Id="1" Cabinet="app.cab" EmbedCab="yes"/>',
        '    <Directory Id="TARGETDIR" Name="SourceDir">',
        '      <Directory Id="' + progFilesDir + '">',
        '        <Directory Id="APPDIR" Name="' + xmlEscape(title) + '"/>',
        '      </Directory>',
        '    </Directory>',
        '    <Feature Id="Main" Level="1">',
        '      <ComponentGroupRef Id="AppFiles"/>',
        '    </Feature>',
        '  </Product>',
        '</Wix>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(productWxs, wxsContent, 'utf8');

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    console.log('  [msi] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync('wixl', ['-o', outPath, productWxs, filesWxs], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 wixl failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build an MSIX package for the Windows Store / MSIX sideloading.
 * Requires makemsix (from microsoft/msix-packaging) at /opt/makemsix.
 * The resulting .msix is UNSIGNED — sign with signtool or osslsigncode
 * before Store submission, or install via Add-AppxPackage -AllowUnsigned.
 */
function buildMsixPackage(opts, info, stagingDir, arch, outPath, isBundle = false, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('msix')) return;

    const makemsix = fs.existsSync('/opt/makemsix') ? '/opt/makemsix'
                   : (spawnSync('which', ['makemsix'], { encoding: 'utf8' }).stdout || '').trim();
    if (!makemsix) { console.warn('  \u26a0 makemsix not found \u2014 skipping MSIX'); return; }

    const title    = info.title    || 'App';
    const version  = (info.version || '0.0.1').trim();
    const desc     = info.description || title;
    const pkgId    = toKebab(info.title || 'app');
    const author   = info.author   || title;
    // Identity Name: only letters, numbers, dots, hyphens
    const identity = pkgId.replace(/[^A-Za-z0-9.\-]/g, '-');
    const publisher = 'CN=' + author.replace(/[<>"]/g, '');
    // MSIX version must be strictly 4 numeric parts
    const msixVer  = version.replace(/[^\d.]/g, '').split('.')
                     .concat(['0','0','0','0']).slice(0, 4).join('.');
    // Architecture: makemsix accepts x86, x64, arm, arm64, neutral
    const msixArch = arch === 'x86_64' ? 'x64'
                   : arch === 'x86_32' ? 'x86'
                   : arch === 'arm64'  ? 'arm64'
                   : arch === 'arm32'  ? 'arm'
                   : 'neutral';

    // Minimal 1×1 transparent PNG for required logo assets
    const minPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
        'AABjkB6QAAAABJRU5ErkJggg==', 'base64'
    );

    const tmpBase   = path.join(path.dirname(outPath), '_msix-' + pkgId + '-' + arch);
    const assetsDir = path.join(tmpBase, 'Assets');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    copyDir(stagingDir, tmpBase);
    fs.writeFileSync(path.join(assetsDir, 'StoreLogo.png'),        minPng);
    fs.writeFileSync(path.join(assetsDir, 'Square44x44Logo.png'),  minPng);
    fs.writeFileSync(path.join(assetsDir, 'Square150x150Logo.png'),minPng);

    const manifest = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"',
        '         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"',
        '         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"',
        '         IgnorableNamespaces="rescap">',
        '  <Identity Name="' + identity + '"',
        '            Publisher="' + publisher + '"',
        '            Version="' + msixVer + '"',
        '            ProcessorArchitecture="' + msixArch + '"/>',
        '  <Properties>',
        '    <DisplayName>' + title + '</DisplayName>',
        '    <PublisherDisplayName>' + author + '</PublisherDisplayName>',
        '    <Description>' + desc + '</Description>',
        '    <Logo>Assets\\StoreLogo.png</Logo>',
        '  </Properties>',
        '  <Dependencies>',
        '    <TargetDeviceFamily Name="Windows.Desktop"',
        '      MinVersion="10.0.17763.0" MaxVersionTested="10.0.19041.0"/>',
        '  </Dependencies>',
        '  <Resources>',
        '    <Resource Language="en-us"/>',
        '  </Resources>',
        '  <Applications>',
        '    <Application Id="App" Executable="' + exeFilename + '"',
        '                 EntryPoint="Windows.FullTrustApplication">',
        '      <uap:VisualElements',
        '        DisplayName="' + title + '"',
        '        Description="' + desc + '"',
        '        BackgroundColor="transparent"',
        '        Square150x150Logo="Assets\\Square150x150Logo.png"',
        '        Square44x44Logo="Assets\\Square44x44Logo.png"/>',
        '    </Application>',
        '  </Applications>',
        '  <Capabilities>',
        '    <rescap:Capability Name="runFullTrust"/>',
        '    <Capability Name="internetClient"/>',
        '  </Capabilities>',
        '</Package>',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(tmpBase, 'AppxManifest.xml'), manifest, 'utf8');

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    console.log('  [msix] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync(makemsix, ['pack', '-d', tmpBase, '-p', outPath], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 makemsix failed');
    else console.log('  \u2139 Note: MSIX is unsigned \u2014 sign with signtool before Store submission, or install with Add-AppxPackage -AllowUnsigned');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build a Chocolatey .nupkg.
 * Embeds the NSIS installer EXE + PowerShell install/uninstall scripts.
 * Non-bundle: declares microsoft-edge-webview2-runtime dependency.
 * Publish to: https://community.chocolatey.org
 */
function buildChocoPackage(opts, info, arch, nsisExePath, outDir, isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('choco')) return;

    const title   = info.title    || 'App';
    const version = (info.version || '0.0.1').trim();
    const desc    = info.description || title;
    const pkgId   = toKebab(info.title || 'app');
    const author  = info.author   || title;
    const website = info.repository || '';
    const exeFile = path.basename(nsisExePath || (pkgId + '-' + version + '-windows-' + arch + '-setup.exe'));

    const tmpBase  = path.join(os.tmpdir(), '_renweb-choco-' + pkgId + '-' + arch);
    const toolsDir = path.join(tmpBase, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });

    if (nsisExePath && fs.existsSync(nsisExePath)) {
        fs.copyFileSync(nsisExePath, path.join(toolsDir, exeFile));
    }

    const installPs1 = [
        "$ErrorActionPreference = 'Stop'",
        '$packageArgs = @{',
        "  packageName    = '" + pkgId + "'",
        "  fileType       = 'exe'",
        "  file64         = Join-Path $PSScriptRoot '" + exeFile + "'",
        "  silentArgs     = '/S'",
        '  validExitCodes = @(0)',
        '}',
        'Install-ChocolateyInstallPackage @packageArgs',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(toolsDir, 'chocolateyInstall.ps1'), installPs1, 'utf8');

    const uninstallPs1 = [
        "$ErrorActionPreference = 'Stop'",
        "Uninstall-ChocolateyPackage '" + pkgId + "' 'exe' '/S' " +
        "\"$(Get-ItemPropertyValue 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + pkgId + "' UninstallString)\"",
        '',
    ].join('\n');
    fs.writeFileSync(path.join(toolsDir, 'chocolateyUninstall.ps1'), uninstallPs1, 'utf8');

    const depBlock = isBundle ? '' : [
        '    <dependencies>',
        '      <dependency id="microsoft-edge-webview2-runtime"/>',
        '    </dependencies>',
    ].join('\n');

    const nuspec = [
        '<?xml version="1.0"?>',
        '<package>',
        '  <metadata>',
        '    <id>'      + pkgId + '</id>',
        '    <version>' + version + '</version>',
        '    <title>'   + title   + '</title>',
        '    <authors>' + author  + '</authors>',
        '    <description>' + desc + '</description>',
        website ? '    <projectUrl>' + website + '</projectUrl>' : '',
        '    <requireLicenseAcceptance>false</requireLicenseAcceptance>',
        depBlock,
        '  </metadata>',
        '</package>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(path.join(tmpBase, pkgId + '.nuspec'), nuspec, 'utf8');

    const outFile = path.join(outDir, pkgId + '.' + version + '-' + arch + '.nupkg');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('  [choco] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('zip', ['-r', outFile, '.'], { cwd: tmpBase, stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 Chocolatey nupkg failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build a NuGet .nupkg (no PS scripts; for NuGet-aware toolchains / CI).
 * Non-bundle: declares Microsoft.Web.WebView2 as a dependency.
 */
function buildNugetPackage(opts, info, arch, outDir, isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('nuget')) return;

    const title   = info.title    || 'App';
    const version = (info.version || '0.0.1').trim();
    const desc    = info.description || title;
    const pkgId   = toKebab(info.title || 'app');
    const author  = info.author   || title;
    const website = info.repository || '';
    const license = info.license  || 'BSL-1.0';

    const tmpBase = path.join(path.dirname(outDir), '_nuget-' + pkgId + '-' + arch);
    fs.mkdirSync(tmpBase, { recursive: true });

    const depBlock = isBundle ? '' : [
        '    <dependencies>',
        '      <group targetFramework="native">',
        '        <dependency id="Microsoft.Web.WebView2" version="1.0.0"/>',
        '      </group>',
        '    </dependencies>',
    ].join('\n');

    const nuspec = [
        '<?xml version="1.0"?>',
        '<package>',
        '  <metadata>',
        '    <id>'      + pkgId + '</id>',
        '    <version>' + version + '</version>',
        '    <title>'   + title   + '</title>',
        '    <authors>' + author  + '</authors>',
        '    <description>' + desc + '</description>',
        website ? '    <projectUrl>' + website + '</projectUrl>' : '',
        license ? '    <license type="expression">' + license + '</license>' : '',
        '    <requireLicenseAcceptance>false</requireLicenseAcceptance>',
        '    <tags>desktop native</tags>',
        depBlock,
        '  </metadata>',
        '</package>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(path.join(tmpBase, pkgId + '.nuspec'), nuspec, 'utf8');

    const outFile = path.join(outDir, pkgId + '.' + version + '-' + arch + '.nupkg');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('  [nuget] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('zip', ['-r', outFile, '.'], { cwd: tmpBase, stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 NuGet nupkg failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

// ─── macOS packaging ──────────────────────────────────────────────────────────

/**
 * Build a macOS DMG-style distributable using xorrisofs/genisoimage with
 * Apple HFS extensions.  This produces an ISO-9660 image mountable by macOS
 * Finder without requiring a real HFS+ filesystem or macOS toolchain.
 */
function buildMacDmg(opts, info, stagingDir, arch, outPath) {
    if (opts.exts.size > 0 && !opts.exts.has('dmg')) return;

    // Prefer xorrisofs (newer), fall back to genisoimage
    let isoCmd = null;
    for (const cmd of ['xorrisofs', 'genisoimage']) {
        if (spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0) { isoCmd = cmd; break; }
    }
    if (!isoCmd) { console.warn('  \u26a0 xorrisofs/genisoimage not found — skipping DMG'); return; }

    const title   = info.title   || 'App';

    // Put staging content inside a <Title>.app folder so Finder sees it as an app bundle
    const tmpBase = path.join(path.dirname(outPath), `_dmg-${arch}`);
    const appDir  = path.join(tmpBase, `${title}.app`);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    copyDir(stagingDir, appDir);

    console.log(`  [dmg] \u2192 ${path.relative(process.cwd(), outPath)}`);
    const isoArgs = [
        '-V',     title.slice(0, 32),
        '-D',
        '-R',                       // Rock Ridge (preserves Unix permissions)
        '-o',     outPath,
        tmpBase,                    // burn dir containing <Title>.app/
    ];
    // Note: '-apple' HFS extensions are not supported by xorriso on Linux.
    // The resulting ISO-format image mounts normally on macOS.
    const r = spawnSync(isoCmd, isoArgs, { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 DMG creation failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

// ─── macOS extra formats ─────────────────────────────────────────────────────

// Map our arch names to Homebrew bottle tags
const HOMEBREW_BOTTLE_TAG = {
    arm64   : 'arm64_sequoia',
    aarch64 : 'arm64_sequoia',
    x86_64  : 'sequoia',
    universal: 'all',
};

/**
 * Build a real Homebrew bottle (.tar.gz in Cellar layout) and push the bottle
 * metadata into `homebrewBottles` for later unified formula generation.
 * Call writeHomebrewFormula() once after all arches to write the combined .rb.
 */
function generateHomebrewFormula(opts, info, arch, outDir, stagingDir, isBundle = false, exeFilename = '', homebrewBottles = null) {
    if (opts.exts.size > 0 && !opts.exts.has('homebrew')) return;

    const title   = info.title    || 'App';
    const version = (info.version || '0.0.1').trim();
    const pkgId   = toKebab(info.title || 'app');
    const desc    = info.description || title;
    const website = info.repository || '';
    const license = info.license  || 'BSL-1.0';
    const bottleTag = HOMEBREW_BOTTLE_TAG[arch] || 'all';
    // Homebrew formula class must be CamelCase
    const klass   = title.replace(/[^a-zA-Z0-9]/g, ' ').trim()
                         .replace(/\b\w/g, c => c.toUpperCase()).replace(/\s+/g, '');

    // ── Build the Cellar-layout staging tree ───────────────────────────────
    // Homebrew unpacks the bottle into HOMEBREW_CELLAR/<formula>/<version>/
    // so that must be the root path inside the archive.
    const tmpBase    = path.join(os.tmpdir(), '_renweb-hb-' + pkgId + '-' + arch);
    const cellarRoot = path.join(tmpBase, pkgId, version);
    const binDir     = path.join(cellarRoot, 'bin');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(binDir, { recursive: true });
    copyDir(stagingDir, cellarRoot);

    // bin/<pkgId> wrapper script — execs the real binary from the Cellar
    const binTarget = isBundle ? 'bundle_exec.sh' : exeFilename;
    const wrapperSh = [
        '#!/bin/sh',
        '# Resolve symlinks to find the real Cellar directory (POSIX-compatible).',
        '_self="$0"',
        'while [ -L "$_self" ]; do',
        '    _dir="$(dirname "$_self")"',
        '    _self="$(readlink "$_self")"',
        '    case "$_self" in /*) ;; *) _self="$_dir/$_self" ;; esac',
        'done',
        'CELLAR="$(cd "$(dirname "$_self")" && pwd)"',
        'exec "${CELLAR}/../' + binTarget + '" "$@"',
        '',
    ].join('\n');
    const wrapperPath = path.join(binDir, pkgId);
    fs.writeFileSync(wrapperPath, wrapperSh, 'utf8');
    makeExecutable(wrapperPath);

    // ── Pack the bottle ────────────────────────────────────────────────────
    fs.mkdirSync(outDir, { recursive: true });
    const bottleName = pkgId + '--' + version + '.' + bottleTag + '.bottle.tar.gz';
    const bottlePath = path.join(outDir, bottleName);
    try { fs.unlinkSync(bottlePath); } catch (_) {}
    // tar from inside tmpBase so archive root is "<pkgId>/<version>/..."
    const tarR = spawnSync('tar', ['-czf', bottlePath, pkgId], { cwd: tmpBase, stdio: 'inherit' });
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
    if (tarR.status !== 0) {
        console.warn('  \u26a0 homebrew bottle tar failed');
        return;
    }
    console.log('  [homebrew bottle] \u2192 ' + path.relative(process.cwd(), bottlePath));

    // ── Compute sha256 of the bottle ───────────────────────────────────────
    const sha256 = require('crypto')
        .createHash('sha256')
        .update(fs.readFileSync(bottlePath))
        .digest('hex');

    // Push bottle metadata for later unified formula write
    if (homebrewBottles) {
        homebrewBottles.push({ bottleTag, bottleName, sha256, binTarget, outDir, pkgId, klass, version, desc, website, license });
    }
}

/**
 * Write a single unified Homebrew formula .rb that includes all collected
 * bottle entries (arm64, x86_64, universal). Call once after all macOS arches.
 */
function writeHomebrewFormula(bottles) {
    if (!bottles || bottles.length === 0) return;

    // All bottles should agree on these fields; take from first entry.
    const { outDir, pkgId, klass, version, desc, website, license } = bottles[0];

    // Prefer the 'all' (universal) bottle as the primary download url;
    // fall back to the first bottle if none is present.
    const primary = bottles.find(b => b.bottleTag === 'all') || bottles[0];

    const rb = [
        'class ' + klass + ' < Formula',
        '  desc "' + desc.replace(/"/g, '\\"') + '"',
        '  homepage "' + website + '"',
        '  url "file://#{File.dirname(__FILE__)}/' + primary.bottleName + '"',
        '  sha256 "' + primary.sha256 + '"',
        '  version "' + version + '"',
        '  license "' + license + '"',
        '',
        '  bottle do',
        '    root_url "file://#{File.dirname(__FILE__)}"',
    ];
    for (const b of bottles) {
        rb.push('    sha256 cellar: :any_skip_relocation, ' + b.bottleTag + ': "' + b.sha256 + '"');
    }
    rb.push(
        '  end',
        '',
        '  def install',
        '    prefix.install Dir["*"]',
        '    bin.write_exec_script prefix/"' + primary.binTarget + '"',
        '  end',
        '',
        '  test do',
        '    system "#{bin}/' + pkgId + '", "--version" rescue nil',
        '  end',
        'end',
        '',
    );

    const formulaPath = path.join(outDir, pkgId + '.rb');
    console.log('  [homebrew formula] \u2192 ' + path.relative(process.cwd(), formulaPath));
    fs.writeFileSync(formulaPath, rb.join('\n'), 'utf8');
}

/**
 * Build a macOS App Store-ready .pkg installer using productbuild.
 * Creates a proper .app bundle (Contents/MacOS + Info.plist) then wraps it
 * with `productbuild --component`. Requires productbuild — macOS only;
 * skipped automatically on Linux/Docker.
 * ⚠ Actual App Store submission requires codesigning with a
 *   Mac App Distribution certificate before calling productsign.
 */
function buildMacAppStorePackage(opts, info, stagingDir, arch, outDir, isBundle = false, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('mas')) return;

    if (!findBin('productbuild')) {
        console.log('  [mas] skipped \u2014 productbuild not available (macOS only)');
        return;
    }

    const title     = info.title    || 'App';
    const version   = (info.version || '0.0.1').trim();
    const pkgId     = toKebab(info.title || 'app');
    const bundleId  = info.bundle_id || ('com.example.' + pkgId.replace(/-/g, '.'));
    const author    = info.author   || title;
    const copyright = 'Copyright \u00a9 ' + new Date().getFullYear() + ' ' + author;
    const stem      = pkgId + '-' + version + '-macos-' + arch + '-mas';

    const tmpBase      = path.join(os.tmpdir(), '_renweb-mas-' + pkgId + '-' + arch);
    const appBundle    = path.join(tmpBase, title + '.app');
    const contentsDir  = path.join(appBundle, 'Contents');
    const macosDir     = path.join(contentsDir, 'MacOS');
    const resourcesDir = path.join(contentsDir, 'Resources');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(macosDir,     { recursive: true });
    fs.mkdirSync(resourcesDir, { recursive: true });

    copyDir(stagingDir, macosDir);
    const exe = path.join(macosDir, exeFilename);
    if (fs.existsSync(exe)) { try { fs.chmodSync(exe, 0o755); } catch (_) {} }

    const plist = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
        '  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        '  <key>CFBundleIdentifier</key>        <string>' + bundleId    + '</string>',
        '  <key>CFBundleName</key>              <string>' + title       + '</string>',
        '  <key>CFBundleDisplayName</key>       <string>' + title       + '</string>',
        '  <key>CFBundleVersion</key>           <string>' + version     + '</string>',
        '  <key>CFBundleShortVersionString</key><string>' + version     + '</string>',
        '  <key>CFBundleExecutable</key>        <string>' + exeFilename + '</string>',
        '  <key>CFBundlePackageType</key>       <string>APPL</string>',
        '  <key>NSPrincipalClass</key>          <string>NSApplication</string>',
        '  <key>NSHighResolutionCapable</key>   <true/>',
        '  <key>LSMinimumSystemVersion</key>    <string>10.14</string>',
        '  <key>NSHumanReadableCopyright</key>  <string>' + copyright   + '</string>',
        '</dict></plist>',
    ].join('\n');
    fs.writeFileSync(path.join(contentsDir, 'Info.plist'), plist, 'utf8');

    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, stem + '.pkg');
    console.log('  [mas] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('productbuild', ['--component', appBundle, '/Applications', outFile], { stdio: 'inherit' });
    if (r.status === 0)
        console.log('  \u2139 Sign with productsign --sign <Mac Installer Distribution cert> before App Store upload');
    else
        console.warn('  \u26a0 productbuild failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

// ─── Linux extra formats ──────────────────────────────────────────────────────

// AppImage only supports these four architectures. Anything else (mips, powerpc,
// riscv, s390x, sparc …) cannot be packaged as an AppImage.
const APPIMAGE_ARCH_MAP = {
    x86_64 : 'x86_64',
    x86_32 : 'i686',
    arm64  : 'aarch64',
    aarch64: 'aarch64',
    arm32  : 'armhf',
    armhf  : 'armhf',
};

/**
 * Build an AppImage using appimagetool.
 * APPIMAGE_EXTRACT_AND_RUN=1 is set in the Dockerfile so FUSE is not needed
 * during the build.  At runtime, AppRun prefers the extract-and-run path
 * (writable tmpdir) over the old copy-on-first-run approach.
 */
function buildAppImage(opts, info, stagingDir, arch, outDir, isBundle = false, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('AppImage') && !opts.exts.has('appimage')) return;

    const archFlag = APPIMAGE_ARCH_MAP[arch];
    if (!archFlag) {
        console.log(`  [AppImage] skipped — ${arch} is not a supported AppImage architecture`);
        return;
    }

    if (!fs.existsSync(APPIMAGETOOL)) {
        console.warn('  \u26a0 ' + APPIMAGETOOL + ' not found — skipping AppImage'); return;
    }

    const title   = info.title    || 'App';
    const version = (info.version || '0.0.1').trim();
    const pkgId   = toKebab(info.title || 'app');
    const appId   = info.app_id  || pkgId;
    const desc    = info.description || title;
    const cats    = parseCats(info.categories || info.category);

    const appDir   = path.join(path.dirname(outDir), '_appimage-' + pkgId + '-' + arch + '.AppDir');
    const appShare = path.join(appDir, 'opt', pkgId);
    if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
    fs.mkdirSync(appShare, { recursive: true });
    copyDir(stagingDir, appShare);

    // ── AppRun ────────────────────────────────────────────────────────────────
    // The engine uses wai_getExecutablePath (/proc/self/exe) to resolve all
    // paths, so it must run from a writable directory.
    //
    // Strategy:
    //   1. If APPDIR is already writable (extract-and-run mode)  → exec directly.
    //   2. Otherwise re-exec $APPIMAGE with APPIMAGE_EXTRACT_AND_RUN=1 so the
    //      runtime extracts to a writable tmpdir before calling us again.
    //   3. Fallback (extract-and-run unavailable): copy to ~/.local/share once.
    const appTarget  = isBundle ? 'bundle_exec.sh' : exeFilename;
    const appRunPath = path.join(appDir, 'AppRun');
    fs.writeFileSync(appRunPath, [
        '#!/bin/sh',
        'APPDIR="$(dirname "$(readlink -f "$0")")"',
        '',
        '# Fast path: APPDIR is writable (extract-and-run tmpdir) — exec directly.',
        'if touch "$APPDIR/.w" 2>/dev/null && rm -f "$APPDIR/.w"; then',
        '    exec "$APPDIR/opt/' + pkgId + '/' + appTarget + '" "$@"',
        'fi',
        '',
        '# APPDIR is read-only (FUSE mount). Re-exec via extract-and-run so the',
        '# runtime lands in a writable tmpdir on the next invocation.',
        'if [ -z "${_RENWEB_REEXEC}" ]; then',
        '    export _RENWEB_REEXEC=1 APPIMAGE_EXTRACT_AND_RUN=1',
        '    exec "${APPIMAGE:-$0}" "$@"',
        'fi',
        '',
        '# Last-resort fallback: copy app to ~/.local/share once and exec from there.',
        'DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/' + pkgId + '"',
        'STAMP="$DATA_DIR/.version"',
        'if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "' + version + '" ]; then',
        '    rm -rf "$DATA_DIR" && mkdir -p "$DATA_DIR"',
        '    cp -a "$APPDIR/opt/' + pkgId + '/." "$DATA_DIR/" || { echo "AppImage: copy failed" >&2; exit 1; }',
        '    echo "' + version + '" > "$STAMP"',
        'fi',
        'exec "$DATA_DIR/' + appTarget + '" "$@"',
        '',
    ].join('\n'), 'utf8');
    makeExecutable(appRunPath);

    // AppStream metainfo (silences appimagetool appstream warning)
    const metainfoDir = path.join(appDir, 'usr', 'share', 'metainfo');
    fs.mkdirSync(metainfoDir, { recursive: true });
    fs.writeFileSync(path.join(metainfoDir, appId + '.appdata.xml'), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<component type="desktop-application">',
        '  <id>' + appId + '</id>',
        '  <name>' + (info.title || pkgId) + '</name>',
        '  <summary>' + desc + '</summary>',
        '  <metadata_license>BSL 1.0</metadata_license>',
        '  <project_license>' + (info.license || 'BSL-1.0') + '</project_license>',
        '  <releases>',
        '    <release version="' + version + '" date="' + new Date().toISOString().slice(0, 10) + '"/>',
        '  </releases>',
        '</component>',
        '',
    ].join('\n'), 'utf8');

    // .desktop file at root of AppDir
    for (const ext of ['png', 'svg']) {
        for (const cand of [
            path.join(stagingDir, 'resource',  'icon.' + ext),
            path.join(stagingDir, 'resource',  'app.'  + ext),
            path.join(stagingDir, 'resources', 'icon.' + ext),
        ]) {
            if (fs.existsSync(cand)) {
                fs.copyFileSync(cand, path.join(appDir, pkgId + '.' + ext)); break;
            }
        }
    }
    fs.writeFileSync(path.join(appDir, pkgId + '.desktop'), [
        '[Desktop Entry]',
        'Version=1.0',
        'Type=Application',
        'Name=' + title,
        'Comment=' + desc,
        'Exec=' + pkgId,
        'Icon=' + pkgId,
        'Terminal=false',
        'Categories=' + cats,
        'StartupWMClass=' + appId,
        '',
    ].join('\n'), 'utf8');

    const outFile = path.join(outDir, pkgId + '-' + version + '-' + archFlag + '.AppImage');
    fs.mkdirSync(outDir, { recursive: true });

    // Strip any ELF files whose architecture doesn't match archFlag.  This
    // prevents appimagetool aborting with "More than one architectures were found"
    // when e.g. host-arch libraries or scripts slip into the staging tree.
    const wantMachine = ELF_MACHINE_FOR_APPIMAGE_ARCH[archFlag];
    if (wantMachine !== undefined) purgeForeignElfs(appDir, wantMachine);

    console.log('  [AppImage] \u2192 ' + path.relative(process.cwd(), outFile));
    const appimageArgs = [appDir, outFile];
    const runtimeFile = path.join(APPIMAGE_RUNTIME_DIR, APPIMAGE_RUNTIME_FOR_ARCH[archFlag] || '');
    if (APPIMAGE_RUNTIME_FOR_ARCH[archFlag] && fs.existsSync(runtimeFile)) {
        appimageArgs.unshift('--runtime-file', runtimeFile);
    } else {
        console.warn('  \u26a0 No runtime file for ' + archFlag + ' — AppImage may not run on target arch');
    }
    const r = spawnSync(APPIMAGETOOL, appimageArgs, {
        stdio : 'inherit',
        // TMPDIR → output dir (Docker /tmp may be owned by root under --user runs).
        // ARCH   → required by appimagetool to embed the correct architecture.
        // APPIMAGE_EXTRACT_AND_RUN → build without FUSE (not available in Docker).
        env   : Object.assign({}, process.env, {
            ARCH                  : archFlag,
            APPIMAGE_EXTRACT_AND_RUN: '1',
            TMPDIR                : outDir,
        }),
    });
    if (r.status !== 0) {
        console.warn('  \u26a0 appimagetool failed');
    } else if (fs.existsSync(outFile)) {
        // Verify the embedded ELF runtime matches the target architecture.
        // The AppImage runtime stub is at byte offset 0; its e_machine field is
        // at bytes 18-19 (LE uint16). A mismatch means "Exec format error" on target.
        const ELF_MACHINE_NAMES = { 0x03: 'i686', 0x28: 'armhf', 0x3E: 'x86_64', 0xB7: 'aarch64' };
        try {
            const buf = Buffer.alloc(20);
            const fd  = fs.openSync(outFile, 'r');
            fs.readSync(fd, buf, 0, 20, 0);
            fs.closeSync(fd);
            const isElf     = buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
            const eMachine  = isElf ? buf.readUInt16LE(18) : null;
            const archName  = eMachine !== null ? (ELF_MACHINE_NAMES[eMachine] || `0x${eMachine.toString(16)}`) : '(not ELF)';
            const wantMachineName = ELF_MACHINE_NAMES[wantMachine] || archFlag;
            if (eMachine !== wantMachine) {
                console.warn(`  \u26a0 AppImage runtime arch mismatch: embedded=${archName}, expected=${wantMachineName}`);
                console.warn('     This AppImage will fail with "Exec format error" on the target.');
                console.warn('     Rebuild the Docker image so the per-arch runtime stubs are present.');
            } else {
                console.log(`  \u2714 AppImage runtime arch verified: ${archName}`);
            }
        } catch (_) {}
    }
    try { fs.rmSync(appDir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build a real .snap package using mksquashfs (squashfs-tools, already in Docker).
 * A snap file is a squashfs archive containing meta/snap.yaml and the app files.
 * Output naming follows the Snap Store convention: <name>_<version>_<arch>.snap
 */
function buildSnapPackage(opts, info, stagingDir, arch, outDir, isBundle = false, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('snap')) return;
    if (spawnSync('which', ['mksquashfs'], { encoding: 'utf8' }).status !== 0) {
        console.warn('  \u26a0 mksquashfs not found \u2014 skipping snap'); return;
    }

    const title    = info.title    || 'App';
    const version  = (info.version || '0.0.1').trim();
    const desc     = info.description || title;
    const pkgId    = toKebab(info.title || 'app');
    const website  = info.repository || '';
    const snapArch = arch.includes('arm64') || arch.includes('aarch64') ? 'arm64'
                   : arch.includes('arm') ? 'armhf'
                   : arch.includes('32')  ? 'i386'
                   : 'amd64';

    const tmpBase  = path.join(os.tmpdir(), '_renweb-snap-' + pkgId + '-' + arch);
    const appShare = path.join(tmpBase, 'opt', pkgId);
    const metaDir  = path.join(tmpBase, 'meta');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(appShare, { recursive: true });
    fs.mkdirSync(metaDir,  { recursive: true });
    copyDir(stagingDir, appShare);

    // ── Confinement strategy ────────────────────────────────────────────────
    // Bare exe: dynamically linked against the host GTK/WebKit stack.
    //   → classic confinement (full host library access).
    // Bundle: ships its own .so libs in lib/.
    //   → strict confinement + LD_LIBRARY_PATH wrapper.
    //
    // Both cases share the same root problem: $SNAP is a read-only squashfs
    // mount, and the engine writes log.txt next to its own executable
    // (Locate::currentDirectory() = exe.parent_path()).  The launcher wrapper
    // copies the app tree to $SNAP_USER_DATA once per version and then execs
    // from that writable directory, so all runtime writes land there instead
    // of the read-only snap mount.
    // ────────────────────────────────────────────────────────────────────────
    const confinement = isBundle ? 'strict' : 'classic';
    const appTarget   = isBundle ? 'bundle_exec.sh' : exeFilename;
    const wrapperName = 'snap-launch.sh';
    const wrapperPath = path.join(appShare, wrapperName);

    // Common launcher body — copy-once + exec from writable $SNAP_USER_DATA.
    const wrapperLines = [
        '#!/bin/sh',
        '# $SNAP         — read-only squashfs mount',
        '# $SNAP_USER_DATA — writable, per-user, per-version ($HOME/snap/<name>/current)',
        'SRC="$SNAP/opt/' + pkgId + '"',
        'DEST="${SNAP_USER_DATA:-$HOME/.local/share/' + pkgId + '}"',
        'STAMP="$DEST/.version"',
        '',
        '# Suppress WebKit\'s portal-based proxy detection (causes "not available inside',
        '# the sandbox" noise on classic snaps; actual network access is unaffected).',
        'export GDK_USE_PORTAL=0',
        '',
        '# Copy app tree once per version so the engine can write log.txt etc.',
        'if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "' + version + '" ]; then',
        '    rm -rf "$DEST" && mkdir -p "$DEST"',
        '    cp -a "$SRC/." "$DEST/" || { echo "snap: copy failed" >&2; exit 1; }',
        '    echo "' + version + '" > "$STAMP"',
        'fi',
        '',
    ];

    if (isBundle) {
        wrapperLines.push(
            '# Bundle: prepend bundled libs so the engine finds its own .so files.',
            'export LD_LIBRARY_PATH="$DEST/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"',
        );
    }

    wrapperLines.push(
        '# Suppress WebKit network-subprocess pxbackend proxy-portal warnings.',
        '# WebKit\'s sandboxed network process tries to query proxy settings via',
        '# the D-Bus portal and fails inside the snap sandbox.  GTK_USE_PORTAL=0',
        '# tells GTK/WebKit not to use the portal API at all.',
        'export GTK_USE_PORTAL=0',
        '',
        '# Tell KDE Plasma / GNOME / Mutter which .desktop file owns this process.',
        '# Without this the compositor cannot correlate the live Wayland app_id to',
        '# the snap .desktop entry, so it spawns a second taskbar icon instead of',
        '# grouping the window under the one the user launched.',
        'export BAMF_DESKTOP_FILE_HINT="/var/lib/snapd/desktop/applications/' + pkgId + '_' + pkgId + '.desktop"',
        '',
        'exec "$DEST/' + appTarget + '" "$@"',
        '',
    );

    fs.writeFileSync(wrapperPath, wrapperLines.join('\n'), 'utf8');
    makeExecutable(wrapperPath);
    const snapCommand = 'opt/' + pkgId + '/' + wrapperName;

    const yamlLines = [
        'name: ' + pkgId,
        "version: '" + version + "'",
        'summary: ' + title,
        'description: |',
        '  ' + desc,
        website ? '  ' + website : null,
        'base: core22',
        'grade: stable',
        'confinement: ' + confinement,
        'architectures:',
        '  - ' + snapArch,
        '',
        'apps:',
        '  ' + pkgId + ':',
        '    command: ' + snapCommand,
    ];

    // Plugs only apply to strict confinement (bundle); classic has full host access.
    if (confinement === 'strict') {
        yamlLines.push(
            '    plugs:',
            '      - desktop',
            '      - desktop-legacy',
            '      - wayland',
            '      - x11',
            '      - network',
            '      - audio-playback',
            '      - opengl',
            '      - home',
        );
    }
    yamlLines.push('');

    fs.writeFileSync(path.join(metaDir, 'snap.yaml'),
        yamlLines.filter(l => l !== null).join('\n'), 'utf8');

    // ── meta/gui — desktop integration (KDE/GNOME app launcher, KRunner, etc.) ──
    // snapd reads meta/gui/<name>.desktop and registers it in
    // ~/.local/share/applications/ so the app appears in system search.
    const guiDir  = path.join(metaDir, 'gui');
    fs.mkdirSync(guiDir, { recursive: true });
    const cats    = parseCats(info.categories || info.category);
    const appId   = info.app_id || pkgId;
    const desktopContent = [
        '[Desktop Entry]',
        'Version=1.0',
        'Type=Application',
        'Name=' + title,
        'Comment=' + desc,
        // Exec must be the snap name (snapd maps it to /snap/bin/<name>)
        'Exec=' + pkgId,
        // Icon path: snapd substitutes ${SNAP} when registering the .desktop file.
        // Point to meta/gui/ where we also copy the image, which is the conventional
        // snap icon location and avoids needing the full opt/ tree to be accessible.
        'Icon=${SNAP}/meta/gui/' + pkgId,
        'Terminal=false',
        'Categories=' + cats,
        'StartupWMClass=' + appId,
        'StartupNotify=true',
        '',
    ].join('\n');
    fs.writeFileSync(path.join(guiDir, pkgId + '.desktop'), desktopContent, 'utf8');
    // Also copy the icon into meta/gui/ so snapd can display it in stores/launchers
    for (const ext of ['png', 'svg']) {
        for (const cand of [
            path.join(stagingDir, 'resource', 'app.' + ext),
            path.join(stagingDir, 'resource', 'icon.' + ext),
            path.join(stagingDir, 'resources', 'icon.' + ext),
        ]) {
            if (fs.existsSync(cand)) {
                fs.copyFileSync(cand, path.join(guiDir, pkgId + '.' + ext));
                break;
            }
        }
    }

    const outFile = path.join(outDir, pkgId + '_' + version + '_' + snapArch + '.snap');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('  [snap] \u2192 ' + path.relative(process.cwd(), outFile));
    try { fs.unlinkSync(outFile); } catch (_) {}
    const r = spawnSync('mksquashfs', [
        tmpBase, outFile,
        '-noappend', '-comp', 'xz', '-no-progress',
    ], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 snap build failed');
    else console.log('  \u2139 To install: sudo snap install --dangerous' +
        (confinement === 'classic' ? ' --classic' : '') +
        ' ' + path.relative(process.cwd(), outFile));
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build a real .flatpak single-file bundle using flatpak-builder.
 * Requires flatpak + flatpak-builder + org.freedesktop.Platform/Sdk pre-installed
 * in the Docker image. Uses --disable-sandbox so bwrap is not needed inside Docker.
 */
function buildFlatpakBundle(opts, info, stagingDir, arch, outDir, isBundle = false, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('flatpak')) return;
    if (spawnSync('which', ['flatpak'], { encoding: 'utf8' }).status !== 0) {
        console.warn('  \u26a0 flatpak not found \u2014 skipping flatpak'); return;
    }

    const pkgId   = toKebab(info.title || 'app');
    const appId   = info.app_id  || pkgId;
    const version = (info.version || '0.0.1').trim();
    const binTarget = isBundle ? 'bundle_exec.sh' : exeFilename;

    const tmpBase  = path.join(os.tmpdir(), '_renweb-flatpak-' + pkgId + '-' + arch);
    const buildDir = path.join(tmpBase, 'build');
    const repoDir  = path.join(tmpBase, 'repo');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });

    // Step 1: initialise the build directory (creates files/, var/, metadata — no bwrap)
    const initR = spawnSync('flatpak', [
        'build-init', buildDir, appId,
        'org.freedesktop.Sdk', 'org.freedesktop.Platform', '23.08',
    ], { stdio: 'inherit' });
    if (initR.status !== 0) {
        console.warn('  \u26a0 flatpak build-init failed');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    // Step 2: copy app files into files/opt/<pkgId>/ and create bin wrapper — pure Node.js, no bwrap
    const appFiles = path.join(buildDir, 'files', 'opt', pkgId);
    const binDir   = path.join(buildDir, 'files', 'bin');
    fs.mkdirSync(appFiles, { recursive: true });
    fs.mkdirSync(binDir,   { recursive: true });
    copyDir(stagingDir, appFiles);
    // Make the target executable
    try { fs.chmodSync(path.join(appFiles, binTarget), 0o755); } catch (_) {}
    // bin/<pkgId> wrapper that execs from the Flatpak /app prefix
    const wrapperSh = [
        '#!/bin/sh',
        'exec "/app/opt/' + pkgId + '/' + binTarget + '" "$@"',
        '',
    ].join('\n');
    const binWrapper = path.join(binDir, pkgId);
    fs.writeFileSync(binWrapper, wrapperSh, 'utf8');
    makeExecutable(binWrapper);

    const outFile = path.join(outDir, pkgId + '-' + version + '-' + arch + '.flatpak');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('  [flatpak] \u2192 ' + path.relative(process.cwd(), outFile));

    // Step 3: finalise metadata (finish-args, command) — no bwrap
    const finishR = spawnSync('flatpak', [
        'build-finish',
        '--command=' + pkgId,
        '--share=network',
        '--share=ipc',
        '--socket=wayland',
        '--socket=fallback-x11',
        '--socket=pulseaudio',
        '--device=dri',
        buildDir,
    ], { stdio: 'inherit' });
    if (finishR.status !== 0) {
        console.warn('  \u26a0 flatpak build-finish failed');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    // Step 4: export build dir into a local OSTree repo — no bwrap
    const exportR = spawnSync('flatpak', [
        'build-export', repoDir, buildDir,
    ], { stdio: 'inherit' });
    if (exportR.status !== 0) {
        console.warn('  \u26a0 flatpak build-export failed');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    // Step 5: pack repo into a single-file .flatpak bundle
    const bundleR = spawnSync('flatpak', [
        'build-bundle',
        '--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo',
        repoDir, outFile, appId,
    ], { stdio: 'inherit' });
    if (bundleR.status !== 0) console.warn('  \u26a0 flatpak build-bundle failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}


// ─── Script generation ────────────────────────────────────────────────────────

/** Launcher for bare (no bundled libs) releases. */
function generateBareLauncher(exeFilename, info, targetOs, targetArch) {
    const pkgId = toKebab(info.title || 'app');
    return `#!/usr/bin/env bash
# launch.sh — ${info.title || 'app'} ${targetOs}/${targetArch}
set -e
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
# Run from a user-writable data dir so the engine can write log.txt, saves, etc.
DATA_DIR="\${XDG_DATA_HOME:-\$HOME/.local/share}/${pkgId}"
mkdir -p "\${DATA_DIR}"
cd "\${DATA_DIR}"
exec "\${SCRIPT_DIR}/${exeFilename}" "$@"
`;
}

/**
 * Launcher for bundle releases.
 * Delegates to bundle_exec.sh which sets LD_LIBRARY_PATH then calls the exe.
 */
function generateBundleLauncher(info, targetOs, targetArch) {
    const pkgId = toKebab(info.title || 'app');
    return `#!/usr/bin/env bash
# launch.sh — ${info.title || 'app'} ${targetOs}/${targetArch} [bundled]
set -e
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
# Run from a user-writable data dir so the engine can write log.txt, saves, etc.
DATA_DIR="\${XDG_DATA_HOME:-\$HOME/.local/share}/${pkgId}"
mkdir -p "\${DATA_DIR}"
cd "\${DATA_DIR}"
exec "\${SCRIPT_DIR}/bundle_exec.sh" "$@"
`;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Register SIGINT / SIGTERM / SIGHUP handlers so that Ctrl+C kills every
 * child process the script has started (fpm, wine, tar, zip, …).
 *
 * Strategy: `process.kill(0, signal)` sends to the entire process group of
 * the current process, which covers all non-detached children inherited from
 * Node.  We remove our own listeners first to prevent recursion (since the
 * kill also signals this process).
 */
function setupSignalHandlers() {
    let exiting = false;
    const onSignal = (sig) => {
        if (exiting) return;
        exiting = true;
        process.stderr.write('\n  Interrupted — terminating child processes…\n');
        // Deregister before killing so re-delivery of the signal doesn't recurse.
        process.off('SIGINT',  onSignal);
        process.off('SIGTERM', onSignal);
        process.off('SIGHUP',  onSignal);
        // Send SIGTERM to the whole process group (belt-and-suspenders: the
        // terminal already delivered SIGINT to the group on Ctrl+C, but some
        // tools like wine spawn sub-daemons that may ignore it).
        try { process.kill(0, 'SIGTERM'); } catch (_) {}
        // Hard exit — this node process may already be dying from the above.
        process.exitCode = (sig === 'SIGINT' ? 130 : 143);
        process.exit();
    };
    process.on('SIGINT',  onSignal);
    process.on('SIGTERM', onSignal);
    process.on('SIGHUP',  onSignal);
}

function run(args) {
    setupSignalHandlers();
    const opts = parseArgs(args);

    // ── 1. Locate and validate build/info.json ────────────────────────────────
    const buildDir = findBuildDir();
    if (!buildDir) { console.error('Error: Could not find a build/ directory.'); process.exit(1); }
    const infoPath = path.join(buildDir, 'info.json');
    if (!fs.existsSync(infoPath)) { console.error(`Error: ${infoPath} not found.`); process.exit(1); }
    let info;
    try { info = JSON.parse(fs.readFileSync(infoPath, 'utf8')); }
    catch (e) { console.error(`Error: Failed to parse info.json — ${e.message}`); process.exit(1); }

    const engineRepo  = (info['engine-repository'] || info['engine_repository'] || info['executable_repository'] || DEFAULT_ENGINE_REPO).trim();
    const pluginRepos = Array.isArray(info['plugin-repositories'] ?? info['plugin_repositories'])
        ? (info['plugin-repositories'] ?? info['plugin_repositories'])
        : [];

    console.log('RenWeb CLI — package');
    console.log(`  build dir : ${buildDir}`);
    console.log(`  engine    : ${engineRepo}`);
    console.log(`  plugins   : ${pluginRepos.length} repo(s)`);
    if (opts.bundleOnly)     console.log('  mode      : bundle-only');
    if (opts.executableOnly) console.log('  mode      : executable-only');
    if (opts.exts.size > 0)  console.log(`  formats   : ${[...opts.exts].join(', ')}`);
    if (opts.oses.size > 0)  console.log(`  os filter : ${[...opts.oses].join(', ')}`);
    if (opts.cache)          console.log('  cache     : enabled (.package/)');

    // ── 2. Set up directories ─────────────────────────────────────────────────
    const projectRoot = path.resolve(buildDir, '..');
    const cacheDir    = path.join(projectRoot, '.package');          // all working files
    const tmpDir      = path.join(cacheDir, 'staging');             // staging (always wiped)
    const pkgDir  = path.join(projectRoot, 'package');
    const enginesDir  = path.join(cacheDir, 'engines');
    const pluginsDir  = path.join(cacheDir, 'plugins');
    const buildSrcDir = path.join(tmpDir, 'build-src');

    // Always clear ./package before starting a fresh build
    if (fs.existsSync(pkgDir)) {
        console.log('Clearing previous package output…');
        fs.rmSync(pkgDir, { recursive: true, force: true });
    }
    fs.mkdirSync(pkgDir, { recursive: true });

    // Without --cache: wipe all of .package (engines + plugins + staging)
    if (!opts.cache && fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
    // Staging is always wiped fresh (even when --cache keeps engines/plugins)
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(buildSrcDir, { recursive: true });
    fs.mkdirSync(enginesDir,  { recursive: true });
    fs.mkdirSync(pluginsDir,  { recursive: true });

    // ── 3. Fetch engine release metadata ─────────────────────────────────────
    console.log('\n── Fetching engine releases ──');
    let engineRelease;
    try { engineRelease = fetchLatestRelease(engineRepo); }
    catch (e) { console.error(`Error: ${e.message}`); process.exit(1); }

    const engineGroups = groupAssets(engineRelease.assets);
    if (engineGroups.size === 0) {
        console.error('Error: No recognisable engine assets found in the latest release.');
        process.exit(1);
    }

    // ── 4. Download engines → .package/engines (with optional cache reuse) ────
    const toProcess = []; // flat list of asset descriptors to build packages for

    for (const [key, group] of engineGroups) {
        const targetOs = key.split('-')[0];
        // OS filter
        if (opts.oses.size > 0 && !opts.oses.has(targetOs)) {
            console.log(`  skip (os filter): ${key}`); continue;
        }

        // Decide which asset type(s) to produce for this key
        const picks = [];
        if (!opts.bundleOnly && group.bare)
            picks.push({ ...group.bare,      isBundle: false, isBootstrap: false });
        if (!opts.executableOnly && group.bundle)
            picks.push({ ...group.bundle,    isBundle: true,  isBootstrap: false });
        if (!opts.executableOnly && group.bootstrap)
            picks.push({ ...group.bootstrap, isBundle: true,  isBootstrap: true  });
        // Graceful fallback: if the requested type doesn't exist in this release
        if (picks.length === 0) {
            const fallback = group.bundle || group.bootstrap || group.bare;
            if (fallback) {
                const fb = { ...fallback, isBundle: !!group.bundle || !!group.bootstrap,
                             isBootstrap: !!group.bootstrap && !group.bundle };
                picks.push(fb);
                const kind = group.bundle ? 'bundle' : group.bootstrap ? 'bundle-bootstrap' : 'bare';
                console.log(`  ℹ  ${key}: requested type unavailable, using ${kind}`);
            }
        }

        for (const pick of picks) {
            const destPath = path.join(enginesDir, pick.filename);
            if (opts.cache && fs.existsSync(destPath)) {
                console.log(`  cached  ${pick.filename}`);
            } else {
                console.log(`  Downloading ${pick.filename}…`);
                if (!download(pick.url, destPath)) {
                    console.warn(`  ⚠ Failed to download ${pick.filename}`); continue;
                }
            }
            if (!pick.isBundle) makeExecutable(destPath);
            toProcess.push({ filename: pick.filename, localPath: destPath,
                             os: pick.os, arch: pick.arch,
                             isBundle: pick.isBundle, isBootstrap: pick.isBootstrap });
        }
    }

    if (toProcess.length === 0) {
        console.error('Error: No engine assets available to package.');
        process.exit(1);
    }

    // ── 5. Copy ./build → ./.package/build-src (skip exe, log, plugins, lib) ──────
    console.log('\n── Copying build files ──');
    for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
        const name = entry.name;
        if (BUILD_EXCLUDES.has(name) || BUILD_EXCLUDE_PREFIXES.some(p => name.startsWith(p)))
            { console.log(`  skip: ${name}`); continue; }
        // Skip any file that parses as an engine binary (any name/os/arch combination).
        // This prevents host-arch binaries from leaking into cross-platform packages.
        if (parseExecAsset(name) || parseBundleAsset(name))
            { console.log(`  skip (exe): ${name}`); continue; }
        const src  = path.join(buildDir, name);
        const dest = path.join(buildSrcDir, name);
        if (entry.isDirectory()) copyDir(src, dest); else fs.copyFileSync(src, dest);
        console.log(`  copy: ${name}`);
    }

    // ── 6. Download plugins → .package/plugins/0, /1, … (with optional cache) ─
    if (pluginRepos.length > 0) console.log('\n── Fetching plugins ──');
    for (let i = 0; i < pluginRepos.length; i++) {
        const repoUrl = pluginRepos[i];
        const pDir    = path.join(pluginsDir, String(i));
        fs.mkdirSync(pDir, { recursive: true });
        console.log(`  Plugin ${i}: ${repoUrl}`);
        let rel;
        try { rel = fetchLatestRelease(repoUrl); }
        catch (e) { console.warn(`  ⚠ Skipping plugin ${i}: ${e.message}`); continue; }
        for (const asset of (rel.assets || [])) {
            const name = (asset.name || '').trim();
            const url  = asset.browser_download_url;
            if (!name || !url) continue;
            const destPath = path.join(pDir, name);
            if (opts.cache && fs.existsSync(destPath)) { console.log(`    cached  ${name}`); continue; }
            console.log(`    Downloading ${name}…`);
            if (!download(url, destPath)) console.warn(`    ⚠ Failed: ${name}`);
        }
    }

    // ── 7. Build packages per asset ───────────────────────────────────────────
    console.log('\n── Building packages ──');
    // Accumulate Homebrew bottle info across all macOS arches so we can write
    // a single unified formula with all sha256 entries after the loop.
    const homebrewBottles = [];
    for (const engineAsset of toProcess) {
        const { os: targetOs, arch: targetArch } = engineAsset;

        // Collect plugin files matching this os+arch
        const matchingPluginDirs = [];
        for (let i = 0; i < pluginRepos.length; i++) {
            const pluginOD = path.join(pluginsDir, String(i));
            if (!fs.existsSync(pluginOD)) continue;
            const matching = fs.readdirSync(pluginOD).filter(f => {
                const fl = f.toLowerCase();
                return fl.includes(targetOs) && fl.includes(targetArch);
            });
            if (matching.length === 0) continue;
            const filteredDir = path.join(tmpDir, `plugin-${i}-${targetOs}-${targetArch}`);
            fs.mkdirSync(filteredDir, { recursive: true });
            for (const f of matching) fs.copyFileSync(path.join(pluginOD, f), path.join(filteredDir, f));
            matchingPluginDirs.push(filteredDir);
        }

        try {
            buildPackageForTarget(opts, buildSrcDir, matchingPluginDirs, engineAsset, info, pkgDir, tmpDir, homebrewBottles);
        } catch (e) {
            console.warn(`⚠ Failed to build package for ${targetOs}-${targetArch}: ${e.message}`);
        }
    }

    // Write the single unified Homebrew formula covering all macOS bottle arches.
    if (homebrewBottles.length > 0) writeHomebrewFormula(homebrewBottles);

    // ── 8. Clean up staging (always); wipe all .package when --cache is off ──
    console.log('\n── Cleaning up ──');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    if (!opts.cache) {
        try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (_) {}
    }

    console.log('\n✓ Packaging complete.');
    console.log(`  Output: ${path.relative(process.cwd(), pkgDir)}/`);
    if (opts.cache) console.log(`  Cache:  ${path.relative(process.cwd(), cacheDir)}/`);
}

module.exports = { run };
