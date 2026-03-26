#!/usr/bin/env node
'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ENGINE_REPO = 'https://github.com/spur27/RenWeb-Engine';

// Runtime dependencies for bare (non-bundle) builds, keyed by fpm/nfpm format.
// Bundle releases carry their own .so libs and declare no runtime deps.
// Package names differ between formats; each entry uses the canonical name for
// that format's package manager: apt (deb), dnf/zypper (rpm), pacman, apk (nfpm), pkg (freebsd).
const LINUX_DEPS = {
    deb: {
        required:    ['libgtk-3-0', 'libwebkit2gtk-4.1-0', 'libegl1', 'gstreamer1.0-plugins-base', 'gstreamer1.0-plugins-good'],
        recommended: ['gstreamer1.0-plugins-bad', 'gstreamer1.0-plugins-ugly'],
    },
    rpm: {
        // Fedora / RHEL / openSUSE (dnf / zypper) — names differ from apt
        required:    ['gtk3', 'webkit2gtk4.1', 'mesa-libEGL', 'gstreamer1-plugins-base', 'gstreamer1-plugins-good'],
        recommended: [],
    },
    pacman: {
        // Arch Linux (pacman) — no Recommends concept
        required:    ['gtk3', 'webkit2gtk-4.1', 'mesa', 'gst-plugins-base', 'gst-plugins-good'],
        recommended: [],
    },
    apk: {
        // Alpine Linux (apk via nfpm) — musl-based; EGL comes from mesa-egl
        required:    ['gtk+3.0', 'webkit2gtk', 'mesa-egl', 'gst-plugins-base', 'gst-plugins-good'],
        recommended: [],
    },
    freebsd: {
        // FreeBSD (pkg) — webkit2-gtk3 is the port name for WebKit2GTK
        required:    ['gtk3', 'webkit2-gtk3', 'mesa-libs', 'gstreamer1-plugins-base', 'gstreamer1-plugins-good'],
        recommended: [],
    },
};

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

// Maps engine arch names → Alpine APK arch strings (passed verbatim to nfpm).
// Alpine uses its own canonical names; nfpm only transforms standard Go arch
// names (amd64, arm64, 386, arm) so passing Alpine names directly avoids any
// unwanted remapping.
const NFPM_APK_ARCH_MAP = {
    x86_64   : 'x86_64',
    x86_32   : 'x86',
    arm64    : 'aarch64',
    aarch64  : 'aarch64',
    arm32    : 'armhf',
    armhf    : 'armhf',
    mips32   : 'mips',
    mips32el : 'mipsel',
    mips64   : 'mips64',
    mips64el : 'mips64el',
    powerpc32: 'ppc',
    powerpc64: 'ppc64le',
    riscv64  : 'riscv64',
    s390x    : 's390x',
    sparc64  : 'sparc64',
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

function xmlEscapeSimple(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toSnake(str) {
    return str.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/**
 * Stable package identifier for Windows packaging metadata.
 * Prefers info.app_id when present to avoid renaming drift across releases.
 */
function windowsPackageId(info) {
    const raw = (info && typeof info.app_id === 'string' && info.app_id.trim())
        ? info.app_id.trim().toLowerCase()
        : toKebab((info && info.title) || 'app');
    // Keep only characters widely accepted across NSIS/MSI/MSIX IDs.
    return raw.replace(/[^a-z0-9.\-]/g, '-');
}

/** MSI/NSIS registry-safe identifier (no dots for path segments). */
function windowsRegistryId(info) {
    return windowsPackageId(info).replace(/\./g, '-');
}

function wingetArch(arch) {
    if (arch === 'x86_64') return 'x64';
    if (arch === 'x86_32') return 'x86';
    if (arch === 'arm64') return 'arm64';
    if (arch === 'arm32') return 'arm';
    return 'neutral';
}

function inferGitHubReleaseUrl(repoUrl, version, filename) {
    if (!repoUrl || !repoUrl.includes('github.com')) return '';
    const ownerRepo = repoUrl.split('github.com/').pop().replace(/\.git$/, '').replace(/\/$/, '');
    if (!ownerRepo || ownerRepo.split('/').length !== 2) return '';
    return `https://github.com/${ownerRepo}/releases/download/v${version}/${filename}`;
}

function toWingetDate(d) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Derive a stable RFC-4122-like UUID from a string using MD5. */
function hashToUuid(str) {
    const h = crypto.createHash('md5').update(str).digest('hex');
    return [h.slice(0,8), h.slice(8,12), h.slice(12,16), h.slice(16,20), h.slice(20,32)]
        .join('-').toUpperCase();
}

/** Recursively sum file sizes under dirPath; returns total in KB (ceiling). */
function getDirSizeKb(dirPath) {
    let bytes = 0;
    for (const e of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const p = path.join(dirPath, e.name);
        if (e.isDirectory()) bytes += getDirSizeKb(p) * 1024;
        else if (e.isFile()) bytes += fs.statSync(p).size;
    }
    return Math.ceil(bytes / 1024);
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
    const r = spawnSync('tar', ['-xzf', archive, '-C', destDir,
        '--no-same-owner', '--no-same-permissions'], { stdio: 'inherit' });
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

/** Find the credentials/ directory by walking up from cwd (mirrors findBuildDir). */
function findCredentialsDir() {
    let cur = process.env.RENWEB_CWD ? path.resolve(process.env.RENWEB_CWD) : process.cwd();
    while (true) {
        const cand = path.join(cur, 'credentials');
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

/** Normalise arch name aliases to the canonical makefile ARCH value. */
function normalizeArch(raw) {
    switch (raw.toLowerCase()) {
        case 'x86_64':  case 'x64':   case 'amd64':                    return 'x86_64';
        case 'x86_32':  case 'x86':   case 'i686': case 'i386':
        case 'ia32':                                                    return 'x86_32';
        case 'arm64':   case 'aarch64':                                 return 'arm64';
        case 'arm32':   case 'armhf': case 'armv7': case 'armv7l':      return 'arm32';
        case 'mips32':  case 'mips':                                    return 'mips32';
        case 'mips32el': case 'mipsel':                                 return 'mips32el';
        case 'mips64':                                                  return 'mips64';
        case 'mips64el':                                                return 'mips64el';
        case 'powerpc32': case 'ppc': case 'ppc32':                     return 'powerpc32';
        case 'powerpc64': case 'ppc64':                                 return 'powerpc64';
        case 'riscv64':                                                 return 'riscv64';
        case 's390x':                                                   return 's390x';
        case 'sparc64':                                                 return 'sparc64';
        default:                                                        return raw.toLowerCase();
    }
}

/**
 * Parse CLI args passed to run().
 *   --bundle-only        Only process bundle archives (skip bare executables)
 *   --executable-only    Only process bare executables (skip bundles)
 *   -e<ext> / --ext <ext>   Output format filter (repeatable); empty = all
 *   -o<os>  / --os  <os>    Target OS filter (repeatable); empty = all
 *   -a<arch>/ --arch <arch> Target arch filter (repeatable); empty = all. Aliases accepted.
 *   -c / --cache         Reuse cached downloads in ./.package
 */
function parseArgs(args) {
    const opts = {
        bundleOnly     : false,
        executableOnly : false,
        exts           : new Set(),   // empty = all formats
        oses           : new Set(),   // empty = all OS targets
        arches         : new Set(),   // empty = all architectures
        cache          : false,
            noCredentials  : false,
    };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--bundle-only')                    { opts.bundleOnly = true;     continue; }
        if (a === '--executable-only')                { opts.executableOnly = true; continue; }
        if (a === '-c' || a === '--cache')            { opts.cache = true;          continue; }
            if (a === '--no-credentials')                 { opts.noCredentials = true;  continue; }
            if (a.startsWith('-e') && a.length > 2)       { opts.exts.add(normalizeExt(a.slice(2))); continue; }
        if (a === '-e' || a === '--ext')              { const v = args[++i]; if (v) opts.exts.add(normalizeExt(v)); continue; }
        if (a.startsWith('-o') && a.length > 2)       { opts.oses.add(a.slice(2).toLowerCase()); continue; }
        if (a === '-o' || a === '--os')               { const v = args[++i]; if (v) opts.oses.add(v.toLowerCase()); continue; }
        if (a.startsWith('-a') && a.length > 2)       { opts.arches.add(normalizeArch(a.slice(2))); continue; }
        if (a === '-a' || a === '--arch')             { const v = args[++i]; if (v) opts.arches.add(normalizeArch(v)); continue; }
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
        if (!extractTar(engineAsset.localPath, stagingDir)) {
            throw new Error(`Failed to extract bundle archive: ${path.basename(engineAsset.localPath)}`);
        }
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
           else if (targetOs === 'linux') gpgSign(opts, dest);
    }
    if (wantZip) {
        const dest = path.join(outDir, `${stem}.zip`);
        console.log(`  → ${path.relative(process.cwd(), dest)}`);
           if (!makeZip(stagingDir, dest)) console.warn(`  ⚠ zip failed for ${stem}`);
           else if (targetOs === 'linux') gpgSign(opts, dest);
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
        // Windows native installers/packages are generated only from bare executable staging.
        // Bootstrap bundles are archive-only outputs.
        if (!engineAsset.isBundle) {
            // NSIS installer
            const nsisOut = path.join(outDir, `${stem}-setup.exe`);
            buildNsisInstaller(opts, info, stagingDir, targetArch, nsisOut, false);
            // MSI installer via wixl
            buildMsiInstaller(opts, info, stagingDir, targetArch, path.join(outDir, `${stem}.msi`), false);
            // MSIX / Windows Store package via makemsix
            const msixExeFile = engineAsset.filename;
            buildMsixPackage(opts, info, stagingDir, targetArch, path.join(outDir, `${stem}.msix`), false, msixExeFile);
            // Chocolatey nupkg (single file, root of windows output dir)
            buildChocoPackage(opts, info, targetArch, nsisOut, outDir, false);
            // NuGet nupkg (single file, root of windows output dir)
            buildNugetPackage(opts, info, targetArch, outDir, nsisOut, false);
            // winget manifests (for submission to microsoft/winget-pkgs)
            buildWingetManifest(opts, info, targetArch, nsisOut, outDir, false);
        }
    }

    if (targetOs === 'macos' || targetOs === 'darwin') {
        // DMG disk image — proper .app bundle built inside via buildMacAppBundle
        const dmgOut = path.join(outDir, `${stem}.dmg`);
        buildMacDmg(opts, info, stagingDir, targetArch, dmgOut, engineAsset.isBundle, engineAsset.filename);
        // macOS .pkg installer via pkgbuild (macOS-only binary, always at /usr/bin/pkgbuild)
        if (opts.exts.size === 0 || opts.exts.has('osxpkg') || opts.exts.has('pkg')) {
            if (!findBin('pkgbuild')) {
                console.log('  [osxpkg] skipped — pkgbuild not available (macOS only)');
            } else {
                const exeFor   = engineAsset.isBundle ? 'bundle_exec.sh' : engineAsset.filename;
                const pkgOut   = path.join(outDir, `${stem}.pkg`);
                const pkgTmp   = path.join(tmpDir, `${stem}-osxpkg`);
                if (fs.existsSync(pkgTmp)) fs.rmSync(pkgTmp, { recursive: true, force: true });
                fs.mkdirSync(pkgTmp, { recursive: true });
                const appBundle = buildMacAppBundle(stagingDir, exeFor, info, pkgTmp);
                const bundleId  = info.app_id || info.bundle_id
                    || ('com.' + toKebab(info.author || 'app').replace(/-/g, '.') + '.' + toKebab(info.title || 'app'));
                const pkgVersion = (info.version || '0.0.1').trim();

                // Step 1: build flat component pkg
                const componentPkg = pkgOut.replace(/\.pkg$/, '-component.pkg');
                const pkgR = spawnSync('pkgbuild', [
                    '--component',        appBundle,
                    '--install-location', '~/Applications',
                    '--identifier',       bundleId,
                    '--version',          pkgVersion,
                    componentPkg,
                ], { stdio: 'inherit' });

                if (pkgR.status === 0) {
                    // Step 2: wrap with productbuild to add license screen
                    const licSrc = path.join(stagingDir, 'licenses', 'LICENSE');
                    const bgPkgSrc = ['bk_pkg.png', 'bk-pkg.png'].map(n => path.join(stagingDir, 'resource', n)).find(p => fs.existsSync(p)) || null;
                    const distXmlPath = path.join(pkgTmp, 'distribution.xml');
                    const distXml = [
                        '<?xml version="1.0" encoding="utf-8"?>',
                        '<installer-gui-script minSpecVersion="1">',
                        `  <title>${xmlEscapeSimple(info.title || 'App')}</title>`,
                        fs.existsSync(licSrc)
                            ? `  <license file="LICENSE"/>` : '',
                        fs.existsSync(bgPkgSrc)
                            ? `  <background file="bk_pkg.png" mime-type="image/png" alignment="center" scaling="proportional"/>` : '',
                        '  <options customize="never" require-scripts="false"/>',
                        '  <choices-outline>',
                        '    <line choice="default"/>',
                        '  </choices-outline>',
                        '  <choice id="default" visible="false">',
                        `    <pkg-ref id="${xmlEscapeSimple(bundleId)}"/>`,
                        '  </choice>',
                        `  <pkg-ref id="${xmlEscapeSimple(bundleId)}" version="${xmlEscapeSimple(pkgVersion)}" onConclusion="none">${xmlEscapeSimple(path.basename(componentPkg))}</pkg-ref>`,
                        '</installer-gui-script>',
                        '',
                    ].filter(Boolean).join('\n');
                    fs.writeFileSync(distXmlPath, distXml, 'utf8');

                    const prodbuildArgs = [
                        '--distribution', distXmlPath,
                        '--package-path', path.dirname(componentPkg),
                    ];
                    const hasPkgResources = fs.existsSync(licSrc) || fs.existsSync(bgPkgSrc);
                    if (hasPkgResources) {
                        const pkgResDir = path.join(pkgTmp, 'pkg-resources');
                        const pkgLprojDir = path.join(pkgResDir, 'en.lproj');
                        fs.mkdirSync(pkgLprojDir, { recursive: true });
                        if (fs.existsSync(licSrc)) fs.copyFileSync(licSrc, path.join(pkgLprojDir, 'LICENSE'));
                        if (fs.existsSync(bgPkgSrc)) {
                            // Copy to resources root so <background file="bk_pkg.png"/> resolves correctly
                            fs.copyFileSync(bgPkgSrc, path.join(pkgResDir, 'bk_pkg.png'));
                        }
                        prodbuildArgs.push('--resources', pkgResDir);
                    }
                    prodbuildArgs.push(pkgOut);

                    const prodR = spawnSync('productbuild', prodbuildArgs, { stdio: 'inherit' });
                    try { fs.unlinkSync(componentPkg); } catch (_) {}
                    try { fs.rmSync(pkgTmp, { recursive: true, force: true }); } catch (_) {}
                    if (prodR.status === 0) {
                        console.log(`  [osxpkg] \u2192 ${path.relative(process.cwd(), pkgOut)}`);
                        macosProductsign(opts, pkgOut, 'osxpkg');
                    } else {
                        console.warn('  \u26a0 productbuild (distribution) failed');
                    }
                } else {
                    try { fs.rmSync(pkgTmp, { recursive: true, force: true }); } catch (_) {}
                    console.warn('  \u26a0 pkgbuild failed');
                }
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

    // Run fpm (deb/rpm/pacman/freebsd) or nfpm (apk) for each format.
    // nfpm natively produces correct 3-stream APKv2; fpm 1.17 does not.
    for (const fmt of formats) {
        const stem       = `${pkgId}-${version}-${targetOs}-${targetArch}`;
        const outputFile = path.join(outDir, `${stem}${FPM_EXT[fmt]}`);
        // Give each fpm invocation its own isolated copy of the staging tree.
        // Some fpm backend/format combinations delete or rename the source
        // directory after packaging, which would break subsequent format runs.
        const fmtRoot = fpmRoot + '-' + fmt;
        if (fs.existsSync(fmtRoot)) fs.rmSync(fmtRoot, { recursive: true, force: true });
        copyDir(fpmRoot, fmtRoot);

        // APK is handled exclusively by nfpm.
        if (fmt === 'apk') {
            const postInstallScript = path.join(os.tmpdir(), `_renweb-postinstall-${pkgId}-${fmt}.sh`);
            fs.writeFileSync(postInstallScript, isBundle
                ? `#!/bin/sh\nchmod -R a+rwX /opt/${pkgId}/\nmkdir -p /usr/local/libexec\n[ -d /usr/local/libexec/webkit2gtk-4.1 ] && [ ! -L /usr/local/libexec/webkit2gtk-4.1 ] && rm -rf /usr/local/libexec/webkit2gtk-4.1\nln -sf /opt/${pkgId}/lib/webkit2gtk-4.1 /usr/local/libexec/webkit2gtk-4.1\n`
                : `#!/bin/sh\nchmod -R a+rwX /opt/${pkgId}/\n`, 'utf8');
            makeExecutable(postInstallScript);
            const postRemoveScript = path.join(os.tmpdir(), `_renweb-postremove-${pkgId}-${fmt}.sh`);
            fs.writeFileSync(postRemoveScript, isBundle
                ? `#!/bin/sh\nrm -f /usr/local/libexec/webkit2gtk-4.1\nrm -rf /opt/${pkgId}/\n`
                : `#!/bin/sh\nrm -rf /opt/${pkgId}/\n`, 'utf8');
            makeExecutable(postRemoveScript);
            console.log(`  [nfpm apk] → ${path.relative(process.cwd(), outputFile)}`);
            try { fs.unlinkSync(outputFile); } catch (_) {}
            const r = runNfpmApk({ pkgId, version, targetArch, desc, website, license,
                                   fmtRoot, outputFile, postInstallScript, postRemoveScript, isBundle });
            try { fs.unlinkSync(postInstallScript); } catch (_) {}
            try { fs.unlinkSync(postRemoveScript); } catch (_) {}
            try { fs.rmSync(fmtRoot, { recursive: true, force: true }); } catch (_) {}
            if (r.status !== 0) console.warn('  ⚠ nfpm failed for format: apk');
            continue;
        }

        // All other formats use fpm.
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
        // Bundle releases carry their own .so libs — no runtime deps needed.
        // Dep names differ per format; LINUX_DEPS provides the correct name for each.
        if (!isBundle) {
            const fmtDeps = LINUX_DEPS[fmt] || { required: [], recommended: [] };
            for (const dep of fmtDeps.required) fpmArgs.push('--depends', dep);
            if (fmt === 'deb') {
                for (const dep of fmtDeps.recommended) fpmArgs.push('--deb-recommends', dep);
            }
        }
        const postInstallScript = path.join(os.tmpdir(), `_renweb-postinstall-${pkgId}-${fmt}.sh`);
        fs.writeFileSync(postInstallScript, isBundle
            ? `#!/bin/sh\nchmod -R a+rwX /opt/${pkgId}/\nmkdir -p /usr/local/libexec\n[ -d /usr/local/libexec/webkit2gtk-4.1 ] && [ ! -L /usr/local/libexec/webkit2gtk-4.1 ] && rm -rf /usr/local/libexec/webkit2gtk-4.1\nln -sf /opt/${pkgId}/lib/webkit2gtk-4.1 /usr/local/libexec/webkit2gtk-4.1\n`
            : `#!/bin/sh\nchmod -R a+rwX /opt/${pkgId}/\n`, 'utf8');
        makeExecutable(postInstallScript);
        fpmArgs.push('--after-install', postInstallScript);

        const postRemoveScript = path.join(os.tmpdir(), `_renweb-postremove-${pkgId}-${fmt}.sh`);
        fs.writeFileSync(postRemoveScript, isBundle
            ? `#!/bin/sh\nrm -f /usr/local/libexec/webkit2gtk-4.1\nrm -rf /opt/${pkgId}/\n`
            : `#!/bin/sh\nrm -rf /opt/${pkgId}/\n`, 'utf8');
        makeExecutable(postRemoveScript);
        fpmArgs.push('--after-remove', postRemoveScript);

        fpmArgs.push('.');

        console.log(`  [fpm ${fmt}] → ${path.relative(process.cwd(), outputFile)}`);
        try { fs.unlinkSync(outputFile); } catch (_) {}
        const r = spawnSync('fpm', fpmArgs, { stdio: 'inherit' });
        try { fs.unlinkSync(postInstallScript); } catch (_) {}
        try { fs.unlinkSync(postRemoveScript); } catch (_) {}
        try { fs.rmSync(fmtRoot, { recursive: true, force: true }); } catch (_) {}
        if (r.status !== 0) console.warn(`  ⚠ fpm failed for format: ${fmt}`);
    }

    try { fs.rmSync(fpmRoot, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Recursively walk a staging directory and return nfpm YAML content entries.
 * Handles regular files (with executable-bit detection) and relative symlinks.
 */
function walkStagingDir(dir, mountAt) {
    const items = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const src = path.join(dir, ent.name);
        const dst = mountAt + '/' + ent.name;
        if (ent.isDirectory()) {
            items.push(...walkStagingDir(src, dst));
        } else if (ent.isSymbolicLink()) {
            const target = fs.readlinkSync(src);
            items.push(`  - src: "${target}"\n    dst: "${dst}"\n    type: symlink`);
        } else {
            const mode = (fs.statSync(src).mode & 0o111) ? 0o755 : 0o644;
            items.push(`  - src: "${src}"\n    dst: "${dst}"\n    file_info:\n      mode: ${mode}`);
        }
    }
    return items;
}

/**
 * Build an Alpine APK using nfpm, which correctly produces the 3-stream APKv2
 * format that fpm 1.17 gets wrong.  Returns an object with a .status property
 * (0 on success) so call-sites can treat it the same as spawnSync's return.
 */
function runNfpmApk({ pkgId, version, targetArch, desc, website, license,
                      fmtRoot, outputFile, postInstallScript, postRemoveScript, isBundle = false }) {
    const nfpmArch    = NFPM_APK_ARCH_MAP[targetArch] || targetArch;
    const escapedDesc = (desc || pkgId).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
    const cfgLines = [
        `name: "${pkgId}"`,
        `arch: "${nfpmArch}"`,
        `platform: "linux"`,
        `version: "${version}"`,
        `description: "${escapedDesc}"`,
        website ? `homepage: "${website}"` : null,
        license ? `license: "${license}"` : null,
        // Bare APKs declare runtime deps; bundle APKs carry them in lib/.
        ...(!isBundle ? [`depends:`, ...LINUX_DEPS.apk.required.map(d => `  - ${d}`)] : []),
        `scripts:`,
        `  postinstall: "${postInstallScript}"`,
        `  postremove: "${postRemoveScript}"`,
        `contents:`,
        ...walkStagingDir(fmtRoot, ''),
    ].filter(x => x !== null).join('\n') + '\n';

    const cfgPath = path.join(os.tmpdir(), `_renweb-nfpm-${pkgId}-${targetArch}.yaml`);
    fs.writeFileSync(cfgPath, cfgLines, 'utf8');
    const r = spawnSync('nfpm', ['pkg', '--packager', 'apk', '--config', cfgPath, '--target', outputFile],
                        { stdio: 'inherit' });
    try { fs.unlinkSync(cfgPath); } catch (_) {}
    return r;
}

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

    const exeDir = path.dirname(exePath);
    const iconPath = findWindowsIconPath(exeDir, info);
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

/** Resolve the preferred Windows .ico asset from a staged build tree. */
function findUpAssetPath(relPath) {
    let cur = process.env.RENWEB_CWD ? path.resolve(process.env.RENWEB_CWD) : process.cwd();
    while (true) {
        const cand = path.join(cur, relPath);
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand;
        const parent = path.dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}

/** Resolve the preferred Windows .ico asset from a staged build tree. */
function findWindowsIconPath(baseDir, info) {
    const candidates = [
        info.icon ? path.resolve(baseDir, info.icon) : null,
        path.join(baseDir, 'resource',  'app.ico'),
        path.join(baseDir, 'resource',  'icon.ico'),
        path.join(baseDir, 'resources', 'app.ico'),
        path.join(baseDir, 'resources', 'icon.ico'),
        path.join(baseDir, 'app.ico'),
        path.join(baseDir, 'icon.ico'),
        findUpAssetPath(path.join('resource', 'app.ico')),
        findUpAssetPath(path.join('resource', 'icon.ico')),
    ].filter(Boolean);
    return candidates.find(p => fs.existsSync(p)) || null;
}

/** Resolve the preferred PNG asset from a staged build tree. */
function findWindowsPngPath(baseDir, info) {
    const candidates = [
        info.icon_png ? path.resolve(baseDir, info.icon_png) : null,
        path.join(baseDir, 'resource',  'app.png'),
        path.join(baseDir, 'resource',  'icon.png'),
        path.join(baseDir, 'resources', 'app.png'),
        path.join(baseDir, 'resources', 'icon.png'),
        path.join(baseDir, 'app.png'),
        path.join(baseDir, 'icon.png'),
        findUpAssetPath(path.join('resource', 'app.png')),
        findUpAssetPath(path.join('resource', 'icon.png')),
    ].filter(Boolean);
    return candidates.find(p => fs.existsSync(p)) || null;
}

// ─── Signing helpers ─────────────────────────────────────────────────────────

/** Read a passphrase from <credDir>/<prefix>.pass, falling back to envVar. */
function readPass(credDir, prefix, envVar) {
    const passFile = path.join(credDir, prefix + '.pass');
    if (fs.existsSync(passFile)) return fs.readFileSync(passFile, 'utf8').trimEnd();
    return process.env[envVar] || null;
}

/**
 * Sign a file with Authenticode using osslsigncode (cross-platform).
 * Credential: credentials/windows.authenticode.pfx
 * Passphrase:  credentials/windows.authenticode.pass  or  RENWEB_WIN_PFX_PASS
 */
function authenticodeSign(opts, filePath) {
    if (!opts.credDir) return false;
    const pfx = path.join(opts.credDir, 'windows.authenticode.pfx');
    if (!fs.existsSync(pfx)) {
        console.warn(`  \u26a0 Authenticode: windows.authenticode.pfx not found \u2014 ${path.basename(filePath)} will be unsigned`);
        return false;
    }
    if (!findBin('osslsigncode')) {
        console.warn('  \u26a0 osslsigncode not found \u2014 skipping Authenticode signing');
        return false;
    }
    const pass = readPass(opts.credDir, 'windows.authenticode', 'RENWEB_WIN_PFX_PASS') || '';
    const tmp  = filePath + '._signtmp';
    const r = spawnSync('osslsigncode', [
        'sign', '-pkcs12', pfx, '-pass', pass,
        '-h', 'sha256', '-t', 'http://timestamp.digicert.com',
        '-in', filePath, '-out', tmp,
    ], { stdio: 'inherit' });
    if (r.status === 0) {
        fs.renameSync(tmp, filePath);
        console.log(`  \u2713 Authenticode-signed: ${path.basename(filePath)}`);
        return true;
    }
    try { fs.unlinkSync(tmp); } catch (_) {}
    console.warn(`  \u26a0 osslsigncode failed \u2014 ${path.basename(filePath)} unsigned`);
    return false;
}

/**
 * Sign a macOS artifact (DMG / .app) using codesign.  macOS only.
 * Credential: credentials/macos.developer-id-app.p12
 * Passphrase:  credentials/macos.certs.pass  or  RENWEB_MACOS_CERTS_PASS
 */
function macosCodesign(opts, filePath) {
    if (!opts.credDir || process.platform !== 'darwin') return false;
    const p12 = path.join(opts.credDir, 'macos.developer-id-app.p12');
    if (!fs.existsSync(p12)) {
        console.warn(`  \u26a0 macOS codesign: macos.developer-id-app.p12 not found \u2014 ${path.basename(filePath)} will be unsigned`);
        return false;
    }
    const pass = readPass(opts.credDir, 'macos.certs', 'RENWEB_MACOS_CERTS_PASS') || '';
    const kc = path.join(os.tmpdir(), '_renweb-sign-' + process.pid + '.keychain-db');
    const kcPass = '_renweb_tmp';
    try {
        spawnSync('security', ['create-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        spawnSync('security', ['unlock-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        const imp = spawnSync('security', ['import', p12, '-k', kc, '-P', pass, '-T', '/usr/bin/codesign', '-A'], { stdio: 'pipe' });
        if (imp.status !== 0) { console.warn('  \u26a0 Failed to import macOS signing cert'); return false; }
        const listR = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning', kc], { encoding: 'utf8' });
        const match = (listR.stdout || '').match(/"(Developer ID Application[^"]+)"/);
        const identity = match ? match[1] : '-';
        const r = spawnSync('codesign', ['--deep', '--force', '--sign', identity, '--keychain', kc, filePath], { stdio: 'inherit' });
        if (r.status === 0) { console.log(`  \u2713 codesigned: ${path.basename(filePath)}`); return true; }
        console.warn(`  \u26a0 codesign failed \u2014 ${path.basename(filePath)} unsigned`);
        return false;
    } finally {
        try { spawnSync('security', ['delete-keychain', kc], { stdio: 'pipe' }); } catch (_) {}
    }
}

/**
 * Sign a macOS .pkg using productsign.  macOS only.
 * certType 'osxpkg' uses macos.developer-id-installer.p12
 * certType 'mas'    uses macos.app-distribution.p12
 * Passphrase:  credentials/macos.certs.pass  or  RENWEB_MACOS_CERTS_PASS
 */
function macosProductsign(opts, filePath, certType) {
    if (!opts.credDir || process.platform !== 'darwin') return false;
    const p12Name = certType === 'mas' ? 'macos.app-distribution.p12' : 'macos.developer-id-installer.p12';
    const p12 = path.join(opts.credDir, p12Name);
    if (!fs.existsSync(p12)) {
        console.warn(`  \u26a0 macOS productsign: ${p12Name} not found \u2014 ${path.basename(filePath)} will be unsigned`);
        return false;
    }
    const pass = readPass(opts.credDir, 'macos.certs', 'RENWEB_MACOS_CERTS_PASS') || '';
    const kc = path.join(os.tmpdir(), '_renweb-sign-' + process.pid + '.keychain-db');
    const kcPass = '_renweb_tmp';
    try {
        spawnSync('security', ['create-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        spawnSync('security', ['unlock-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        const imp = spawnSync('security', ['import', p12, '-k', kc, '-P', pass, '-T', '/usr/bin/productsign', '-A'], { stdio: 'pipe' });
        if (imp.status !== 0) { console.warn('  \u26a0 Failed to import macOS signing cert'); return false; }
        const searchStr = certType === 'mas' ? 'Mac App Distribution' : 'Developer ID Installer';
        const listR = spawnSync('security', ['find-identity', '-v', kc], { encoding: 'utf8' });
        const match = (listR.stdout || '').match(new RegExp('"(' + searchStr + '[^"]+)"'));
        if (!match) { console.warn(`  \u26a0 ${searchStr} identity not found in cert`); return false; }
        const signed = filePath.replace(/\.pkg$/, '._signtmp.pkg');
        const r = spawnSync('productsign', ['--sign', match[1], '--keychain', kc, filePath, signed], { stdio: 'inherit' });
        if (r.status === 0) {
            fs.renameSync(signed, filePath);
            console.log(`  \u2713 productsigned (${certType}): ${path.basename(filePath)}`);
            return true;
        }
        try { fs.unlinkSync(signed); } catch (_) {}
        console.warn('  \u26a0 productsign failed');
        return false;
    } finally {
        try { spawnSync('security', ['delete-keychain', kc], { stdio: 'pipe' }); } catch (_) {}
    }
}

/**
 * Create a GPG detached ASCII-armoured signature (.asc) alongside a file.
 * Credential: credentials/linux.gpg.asc  (ASCII-armoured private key)
 * Passphrase:  credentials/linux.gpg.pass  or  RENWEB_GPG_PASS
 * Imports the key into a temporary isolated GNUPGHOME to avoid polluting the user's keyring.
 */
function gpgSign(opts, filePath) {
    if (!opts.credDir) return false;
    const keyFile = path.join(opts.credDir, 'linux.gpg.asc');
    if (!fs.existsSync(keyFile)) {
        console.warn(`  \u26a0 GPG: linux.gpg.asc not found \u2014 ${path.basename(filePath)} will not be signed`);
        return false;
    }
    if (!findBin('gpg')) { console.warn('  \u26a0 gpg not found \u2014 skipping GPG signing'); return false; }
    const pass = readPass(opts.credDir, 'linux.gpg', 'RENWEB_GPG_PASS') || '';
    const tmpGnupg = path.join(os.tmpdir(), '_renweb-gpg-' + process.pid);
    fs.mkdirSync(tmpGnupg, { recursive: true, mode: 0o700 });
    try {
        const env = { ...process.env, GNUPGHOME: tmpGnupg };
        const imp = spawnSync('gpg', ['--batch', '--import', keyFile], { env, stdio: 'pipe' });
        if (imp.status !== 0) { console.warn('  \u26a0 GPG key import failed'); return false; }
        const listR = spawnSync('gpg', ['--batch', '--list-secret-keys', '--with-colons'], { env, encoding: 'utf8' });
        const fpLine = (listR.stdout || '').split('\n').find(l => l.startsWith('fpr'));
        const fingerprint = fpLine ? fpLine.split(':')[9] : null;
        const sigArgs = ['--batch', '--yes', '--armor', '--detach-sign',
                         '--passphrase-fd', '0', '--pinentry-mode', 'loopback'];
        if (fingerprint) sigArgs.push('-u', fingerprint);
        sigArgs.push(filePath);
        const r = spawnSync('gpg', sigArgs, { env, input: pass + '\n', stdio: ['pipe', 'inherit', 'inherit'] });
        if (r.status === 0) { console.log(`  \u2713 GPG signed: ${path.basename(filePath)}.asc`); return true; }
        console.warn('  \u26a0 GPG detach-sign failed');
        return false;
    } finally {
        try { fs.rmSync(tmpGnupg, { recursive: true, force: true }); } catch (_) {}
    }
}

// ─── Windows package builders ─────────────────────────────────────────────────

/**
 * Generate a .nsi script and compile it with makensis (native Linux binary — no Wine).
 * Non-bundle packages silently download + install the WebView2 Bootstrapper if absent.
 *
 * Escaping note: string concatenation is used for NSIS lines to avoid any
 * ambiguity between JS template-literal ${} and NSIS $VAR / registry paths.
 */
function buildNsisInstaller(opts, info, stagingDir, arch, outPath, isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('exe') && !opts.exts.has('choco') && !opts.exts.has('nuget') && !opts.exts.has('winget')) return;

    if (spawnSync('which', ['makensis'], { encoding: 'utf8' }).status !== 0) {
        console.warn('  ⚠ makensis not found — skipping NSIS installer'); return;
    }

    const title   = info.title       || 'App';
    const version = (info.version    || '0.0.1').trim();
    const desc    = info.description || title;
    const pkgId   = windowsPackageId(info);
    const regId   = windowsRegistryId(info);
    const exeId   = toKebab(info.title || 'app');
    const author  = info.author      || title;
    const website = info.repository  || '';
    const copyright = info.copyright || ('Copyright (C) ' + author);
    const winVer  = version.replace(/[^\d.]/g,'').split('.').concat(['0','0','0','0']).slice(0,4).join('.');
    const exeName = exeId + '-' + version + '-windows-' + arch + '.exe';
    const ukey    = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + regId;
    const bootstrapperName = 'MicrosoftEdgeWebview2Setup.exe';
    const bootstrapperCandidates = [
        path.join(process.cwd(), 'external', 'webview2_bootstraps', 'lib-' + arch, bootstrapperName),
        path.join(stagingDir, 'lib', bootstrapperName),
    ];
    let bootstrapperPath = bootstrapperCandidates.find(p => fs.existsSync(p));
    if (!isBundle && !bootstrapperPath) {
        const cacheBootstrapper = path.join(os.tmpdir(), `_renweb-${bootstrapperName}`);
        if (!fs.existsSync(cacheBootstrapper)) {
            if (!download(WEBVIEW2_BOOTSTRAPPER_URL, cacheBootstrapper)) {
                console.warn('  ⚠ Failed to fetch WebView2 bootstrapper; installer will not auto-install WebView2.');
            }
        }
        if (fs.existsSync(cacheBootstrapper)) bootstrapperPath = cacheBootstrapper;
    }

    const iconPath = findWindowsIconPath(stagingDir, info);

    let nsisBgBmp = ['bk_setup-exe.bmp', 'bk-setup-exe.bmp'].map(n => path.join(stagingDir, 'resource', n)).find(p => fs.existsSync(p)) || null;
    if (!nsisBgBmp) {
        const nsisBgPng = ['bk_setup-exe.png', 'bk-setup-exe.png'].map(n => path.join(stagingDir, 'resource', n)).find(p => fs.existsSync(p)) || null;
        if (nsisBgPng) {
            const tmpBmp = path.join(os.tmpdir(), `_renweb-nsis-bg-${pkgId}-${arch}.bmp`);
            const sipsR = spawnSync('sips', ['-s', 'format', 'bmp', nsisBgPng, '--out', tmpBmp], { stdio: 'pipe' });
            if (sipsR.status === 0) nsisBgBmp = tmpBmp;
            else {
                const conv = spawnSync('convert', [nsisBgPng, tmpBmp], { stdio: 'pipe' });
                if (conv.status === 0) nsisBgBmp = tmpBmp;
            }
        }
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
    L('InstallDir "$LOCALAPPDATA\\' + title  + '"');
    L('InstallDirRegKey HKCU "Software\\' + regId + '" "InstallDir"');
    L('RequestExecutionLevel user');
    if (iconPath) {
        L('Icon "' + iconPath + '"');
        L('UninstallIcon "' + iconPath + '"');
    }
    L();
    L('VIProductVersion "' + winVer  + '"');
    L('VIAddVersionKey "ProductName"     "' + title   + '"');
    L('VIAddVersionKey "FileDescription" "' + desc    + '"');
    L('VIAddVersionKey "FileVersion"     "' + version + '"');
    L('VIAddVersionKey "ProductVersion"  "' + version + '"');
    L('VIAddVersionKey "LegalCopyright"  "' + copyright + '"');
    if (author !== title) L('VIAddVersionKey "CompanyName"     "' + author + '"');
    L();
    L('!include "MUI2.nsh"');
    L('!include "FileFunc.nsh"');
    L('!include "LogicLib.nsh"');
    if (nsisBgBmp) {
        L('!define MUI_WELCOMEFINISHPAGE_BITMAP "' + nsisBgBmp + '"');
        L('!define MUI_UNWELCOMEFINISHPAGE_BITMAP "' + nsisBgBmp + '"');
    }
    const nsisLicensePath = path.join(stagingDir, 'licenses', 'LICENSE');
    L('!insertmacro MUI_PAGE_WELCOME');
    if (fs.existsSync(nsisLicensePath)) {
        L('!define MUI_LICENSEPAGE_CHECKBOX');
        L('!insertmacro MUI_PAGE_LICENSE "' + nsisLicensePath + '"');
    }
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
    L('  WriteRegStr HKCU "Software\\' + regId + '" "InstallDir" "$INSTDIR"');
    L('  WriteUninstaller "$INSTDIR\\Uninstall.exe"');
    L('  CreateDirectory "$SMPROGRAMS\\' + title + '"');
    L('  CreateShortCut "$SMPROGRAMS\\' + title + '\\' + title + '.lnk" "$INSTDIR\\' + exeName + '" "" "$INSTDIR\\' + exeName + '" 0');
    L('  CreateShortCut "$SMPROGRAMS\\' + title + '\\Uninstall ' + title + '.lnk" "$INSTDIR\\Uninstall.exe"');
    if (iconPath)
        L('  CreateShortCut "$DESKTOP\\' + title + '.lnk" "$INSTDIR\\' + exeName + '" "" "$INSTDIR\\' + exeName + '" 0');
    else
        L('  CreateShortCut "$DESKTOP\\' + title + '.lnk" "$INSTDIR\\' + exeName + '"');
    L('  WriteRegStr HKCU "' + ukey + '" "DisplayName"    "' + title   + '"');
    L('  WriteRegStr HKCU "' + ukey + '" "UninstallString" "$INSTDIR\\Uninstall.exe"');
    L('  WriteRegStr HKCU "' + ukey + '" "DisplayVersion"  "' + version + '"');
    L('  WriteRegStr HKCU "' + ukey + '" "Publisher"       "' + author  + '"');
    L('  WriteRegStr HKCU "' + ukey + '" "DisplayIcon" "$INSTDIR\\' + exeName + '"');
    L('  WriteRegStr HKCU "' + ukey + '" "InstallLocation" "$INSTDIR"');
    L('  WriteRegStr HKCU "' + ukey + '" "Comments" "' + desc + '"');
    L('  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2');
    L('  IntFmt $0 "0x%08X" $0');
    L('  WriteRegDWORD HKCU "' + ukey + '" "EstimatedSize" "$0"');
    if (website) L('  WriteRegStr HKCU "' + ukey + '" "URLInfoAbout"    "' + website + '"');
    if (website) L('  WriteRegStr HKCU "' + ukey + '" "URLUpdateInfo"   "' + website + '"');
    if (!isBundle) {
        L();
        L('  ; Check for WebView2 Runtime and install bundled bootstrapper if missing');
        L('  ReadRegStr $0 HKLM "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"');
        L('  ${If} $0 == ""');
        L('    ReadRegStr $0 HKCU "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"');
        L('  ${EndIf}');
        if (bootstrapperPath) {
            L('  SetOutPath "$PLUGINSDIR"');
            L('  File "' + bootstrapperPath + '"');
            L('  SetOutPath "$INSTDIR"');
            L('  ${If} $0 == ""');
            L('    ExecWait "$\\"$PLUGINSDIR\\' + bootstrapperName + '$\\" /silent /install"');
            L('  ${EndIf}');
        } else {
            L('  ${If} $0 == ""');
            L('    MessageBox MB_ICONEXCLAMATION|MB_OK "Microsoft Edge WebView2 Runtime is required. Install ' + bootstrapperName + ' and re-run setup."');
            L('  ${EndIf}');
        }
    }
    L('SectionEnd');
    L();
    L('Section "Uninstall"');
    L('  RMDir /r "$INSTDIR"');
    L('  DeleteRegKey HKCU "Software\\' + regId + '"');
    L('  DeleteRegKey HKCU "' + ukey + '"');
    L('  Delete "$DESKTOP\\' + title + '.lnk"');
    L('  Delete "$SMPROGRAMS\\' + title + '\\' + title + '.lnk"');
    L('  Delete "$SMPROGRAMS\\' + title + '\\Uninstall ' + title + '.lnk"');
    L('  RMDir "$SMPROGRAMS\\' + title + '"');
    L('SectionEnd');
    L();

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const nsiPath = path.join(os.tmpdir(), '_renweb-nsis-' + pkgId + '-' + arch + '.nsi');
    fs.writeFileSync(nsiPath, 'Unicode true\n' + lines.join('\n'), 'utf8');
    console.log('  [nsis] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync('makensis', [nsiPath], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 makensis failed');
        else authenticodeSign(opts, outPath);
    try { fs.unlinkSync(nsiPath); } catch (_) {}
    if (nsisBgBmp) { try { fs.unlinkSync(nsisBgBmp); } catch (_) {} }
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
    const pkgId       = windowsPackageId(info);
    const regId       = windowsRegistryId(info);
    const exeId       = toKebab(info.title || 'app');
    const author      = info.author   || title;
    const website     = info.repository || '';
    const exeName     = exeId + '-' + version + '-windows-' + arch + '.exe';
    const productCode = hashToUuid(pkgId + '-product-' + version);
    const upgradeCode = hashToUuid(pkgId + '-upgrade');
    const tmpBase     = path.join(path.dirname(outPath), '_msi-' + pkgId + '-' + arch);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });

    // MSI version must be strictly numeric (max four dotted parts)
    const msiVersion   = version.replace(/[^\d.]/g, '').split('.').slice(0, 4)
                         .concat(['0','0','0','0']).slice(0, 4).join('.');
    const installRootDir = 'LocalAppDataFolder';
    const iconPath    = findWindowsIconPath(stagingDir, info);
    const sizeKb      = getDirSizeKb(stagingDir);

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
    const shortcutsGuid = hashToUuid(pkgId + '-msi-shortcuts').toUpperCase();
    const filesContent = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Wix xmlns="http://schemas.microsoft.com/wix/2006/wi">',
        '  <Fragment>',
        '    <DirectoryRef Id="APPDIR">',
        ...dirBody,
        '      <Component Id="AppShortcuts" Guid="{' + shortcutsGuid + '}">',
        '        <Shortcut Id="StartMenuShortcut"',
        '                  Directory="ProgramMenuDir"',
        '                  Name="' + xmlEscape(title) + '"',
        '                  Description="' + xmlEscape(desc) + '"',
        '                  Target="[APPDIR]' + xmlEscape(exeName) + '"',
        ...(iconPath ? ['                  Icon="AppIcon" IconIndex="0"'] : []),
        '                  WorkingDirectory="APPDIR"/>',
        '        <Shortcut Id="DesktopShortcut"',
        '                  Directory="DesktopFolder"',
        '                  Name="' + xmlEscape(title) + '"',
        '                  Description="' + xmlEscape(desc) + '"',
        '                  Target="[APPDIR]' + xmlEscape(exeName) + '"',
        ...(iconPath ? ['                  Icon="AppIcon" IconIndex="0"'] : []),
        '                  WorkingDirectory="APPDIR"/>',
        '        <RemoveFolder Id="ProgramMenuDir" On="uninstall"/>',
        '        <RegistryValue Root="HKCU" Key="Software\\' + xmlEscape(regId) + '" Name="InstallDir" Type="string" Value="[APPDIR]"/>',
        '        <RegistryValue Root="HKCU" Key="Software\\' + xmlEscape(regId) + '" Name="HasMsiShortcuts" Type="integer" Value="1" KeyPath="yes"/>',
        '      </Component>',
        '    </DirectoryRef>',
        '  </Fragment>',
        '  <Fragment>',
        '    <ComponentGroup Id="AppFiles">',
        ...compIds.map(id => '      <ComponentRef Id="' + id + '"/>'),
        '      <ComponentRef Id="AppShortcuts"/>',
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
        ...(iconPath ? ['    <Icon Id="AppIcon" SourceFile="' + xmlEscape(iconPath) + '"/>'] : []),
        '    <Property Id="ALLUSERS" Value="2"/>',
        '    <Property Id="MSIINSTALLPERUSER" Value="1"/>',
        '    <MajorUpgrade DowngradeErrorMessage="A newer version is already installed."/>',
        '    <Property Id="ARPNOMODIFY" Value="1"/>',
        '    <Property Id="ARPNOREPAIR" Value="1"/>',
        '    <Property Id="ARPINSTALLLOCATION" Value="[APPDIR]"/>',
        '    <Property Id="ARPSIZE" Value="' + sizeKb + '"/>',
        '    <Property Id="ARPCOMMENTS" Value="' + xmlEscape(desc) + '"/>',
        ...(iconPath ? ['    <Property Id="ARPPRODUCTICON" Value="AppIcon"/>'] : []),
        website ? '    <Property Id="ARPHELPLINK" Value="' + xmlEscape(website) + '"/>' : '',
        website ? '    <Property Id="ARPURLINFOABOUT" Value="' + xmlEscape(website) + '"/>' : '',
        website ? '    <Property Id="ARPURLUPDATEINFO" Value="' + xmlEscape(website) + '"/>' : '',
        '    <Media Id="1" Cabinet="app.cab" EmbedCab="yes"/>',
        // WiX/wixl does not support a native license-agreement dialog via the
        // minimal WiX3 UI (WixUI_Minimal uses UIRef which wixl ignores). The
        // LicenseAgreement text is surfaced via the ARPREADME property so the
        // user can open it from Programs & Features, and the license file is
        // installed alongside the app so it is always present on-disk.
        ...(fs.existsSync(path.join(stagingDir, 'licenses', 'LICENSE'))
            ? ['    <Property Id="ARPREADME" Value="[APPDIR]licenses\\LICENSE"/>'] : []),
        '    <Directory Id="TARGETDIR" Name="SourceDir">',
        '      <Directory Id="' + installRootDir + '">',
        '        <Directory Id="APPDIR" Name="' + xmlEscape(title) + '"/>',
        '      </Directory>',
        '      <Directory Id="ProgramMenuFolder">',
        '        <Directory Id="ProgramMenuDir" Name="' + xmlEscape(title) + '"/>',
        '      </Directory>',
        '      <Directory Id="DesktopFolder"/>',
        '    </Directory>',
        '    <Feature Id="Main" Level="1">',
        '      <ComponentGroupRef Id="AppFiles"/>',
        '    </Feature>',
        // WebView2 prerequisite: require runtime for bare installers.
        ...(isBundle ? [] : [
            '    <Property Id="WV2_VERSION">',
            '      <RegistrySearch Id="WV2SearchHklm" Root="HKLM"',
            '        Key="SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"',
            '        Name="pv" Type="raw"/>',
            '    </Property>',
            '    <Property Id="WV2_VERSION_USER">',
            '      <RegistrySearch Id="WV2SearchHkcu" Root="HKCU"',
            '        Key="Software\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"',
            '        Name="pv" Type="raw"/>',
            '    </Property>',
            '    <Condition Message="Microsoft Edge WebView2 Runtime is required. Install MicrosoftEdgeWebview2Setup.exe and run setup again.">Installed OR REMOVE=&quot;ALL&quot; OR WV2_VERSION OR WV2_VERSION_USER</Condition>',
        ]),
        '  </Product>',
        '</Wix>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(productWxs, wxsContent, 'utf8');

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    console.log('  [msi] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync('wixl', ['-o', outPath, productWxs, filesWxs], { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 wixl failed');
        else authenticodeSign(opts, outPath);
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
    const pkgId    = windowsPackageId(info);
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

    // Minimal 1×1 transparent PNG fallback for required logo assets
    const minPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQ' +
        'AABjkB6QAAAABJRU5ErkJggg==', 'base64'
    );
    const pngIconPath = findWindowsPngPath(stagingDir, info);

    const tmpBase   = path.join(path.dirname(outPath), '_msix-' + pkgId + '-' + arch);
    const assetsDir = path.join(tmpBase, 'Assets');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    // Use cp -r for the staging copy: more reliable than copyDir on Docker volume mounts
    // (avoids ENOENT due to Windows NTFS↔Linux volume caching inconsistencies).
    const cpR = spawnSync('cp', ['-rL', '--no-preserve=ownership',
        path.join(stagingDir, '.'), tmpBase], { stdio: 'inherit' });
    if (cpR.status !== 0) {
        // Fallback to Node.js recursive copy
        copyDir(stagingDir, tmpBase);
    }
    const msixLogo = pngIconPath ? fs.readFileSync(pngIconPath) : minPng;
    fs.writeFileSync(path.join(assetsDir, 'StoreLogo.png'),         msixLogo);
    fs.writeFileSync(path.join(assetsDir, 'Square44x44Logo.png'),   msixLogo);
    fs.writeFileSync(path.join(assetsDir, 'Square150x150Logo.png'), msixLogo);

    // For bundles, the caller already provides the correct .exe filename (renweb-*.exe).
    const msixExe = exeFilename;

    const msixIgnorableNamespaces = isBundle ? 'rescap' : 'rescap win32dependencies';
    const msixExternalDeps = isBundle ? [] : [
        '    <win32dependencies:ExternalDependency',
        '      Name="Microsoft.WebView2"',
        '      Publisher="CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US"',
        '      MinVersion="1.0.0.0"',
        '      Optional="true"/>',
    ];

    const manifest = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"',
        '         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"',
        '         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"',
        '         xmlns:win32dependencies="http://schemas.microsoft.com/appx/manifest/externaldependencies"',
        '         IgnorableNamespaces="' + msixIgnorableNamespaces + '">',
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
        ...msixExternalDeps,
        '  </Dependencies>',
        '  <Resources>',
        '    <Resource Language="en-us"/>',
        '  </Resources>',
        '  <Applications>',
        '    <Application Id="App" Executable="' + msixExe + '"',
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
        else if (!authenticodeSign(opts, outPath))
            console.log('  \u2139 MSIX is unsigned \u2014 sign with signtool before Store submission, or install with Add-AppxPackage -AllowUnsigned');
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
    const regId   = windowsRegistryId(info);

    const tmpBase  = path.join(os.tmpdir(), '_renweb-choco-' + pkgId + '-' + arch);
    const toolsDir = path.join(tmpBase, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });

    if (!nsisExePath || !fs.existsSync(nsisExePath)) {
        console.warn('  ⚠ Chocolatey skipped — NSIS setup exe is missing (build with exe/choco formats together).');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }
    fs.copyFileSync(nsisExePath, path.join(toolsDir, exeFile));

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
        "$uninst = $null",
        "$hkcuPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + regId + "'",
        "$hklmPath = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + regId + "'",
        "if (Test-Path $hkcuPath) { $uninst = Get-ItemPropertyValue $hkcuPath UninstallString }",
        "elseif (Test-Path $hklmPath) { $uninst = Get-ItemPropertyValue $hklmPath UninstallString }",
        "if (-not $uninst) { throw 'Unable to find uninstall command in registry.' }",
        "Uninstall-ChocolateyPackage '" + pkgId + "' 'exe' '/S' \"$uninst\"",
        '',
    ].join('\n');
    fs.writeFileSync(path.join(toolsDir, 'chocolateyUninstall.ps1'), uninstallPs1, 'utf8');

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
        '  </metadata>',
        '</package>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(path.join(tmpBase, pkgId + '.nuspec'), nuspec, 'utf8');

    const outFile = path.join(outDir, pkgId + '.' + version + '-' + arch + '.choco.nupkg');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('  [choco] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('zip', ['-r', outFile, '.'], { cwd: tmpBase, stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 Chocolatey nupkg failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Build a NuGet .nupkg for Windows distribution.
 * Includes metadata and, when available, the NSIS setup executable under tools/.
 * WebView2 is handled by the bundled setup.exe at install time.
 */
function buildNugetPackage(opts, info, arch, outDir, nsisExePath = '', isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('nuget')) return;

    const title   = info.title    || 'App';
    const version = (info.version || '0.0.1').trim();
    const desc    = info.description || title;
    const pkgId   = toKebab(info.title || 'app');
    const author  = info.author   || title;
    const website = info.repository || '';
    const license = info.license  || 'BSL-1.0';

    const tmpBase = path.join(path.dirname(outDir), '_nuget-' + pkgId + '-' + arch);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });
    const toolsDir = path.join(tmpBase, 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });

    const setupName = path.basename(nsisExePath || (toKebab(info.title || 'app') + '-' + version + '-windows-' + arch + '-setup.exe'));
    if (nsisExePath && fs.existsSync(nsisExePath)) {
        fs.copyFileSync(nsisExePath, path.join(toolsDir, setupName));
    } else {
        console.warn('  ⚠ NuGet package is metadata-only because NSIS setup exe was not found.');
    }

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
        '  </metadata>',
        '</package>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(path.join(tmpBase, pkgId + '.nuspec'), nuspec, 'utf8');

    const outFile = path.join(outDir, pkgId + '.' + version + '-' + arch + '.nuget.nupkg');
    fs.mkdirSync(outDir, { recursive: true });
    console.log('  [nuget] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('zip', ['-r', outFile, '.'], { cwd: tmpBase, stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 NuGet nupkg failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Generate winget YAML manifests for microsoft/winget-pkgs submission.
 * This creates metadata only; publishing still requires pushing those manifests.
 */
function buildWingetManifest(opts, info, arch, nsisExePath, outDir, isBundle = false) {
    if (opts.exts.size > 0 && !opts.exts.has('winget')) return;
    if (isBundle) return;
    if (!nsisExePath || !fs.existsSync(nsisExePath)) {
        console.warn('  ⚠ winget manifest skipped — NSIS setup exe is missing.');
        return;
    }

    const id = windowsPackageId(info);
    const version = (info.version || '0.0.1').trim();
    const title = info.title || 'App';
    const author = info.author || title;
    const description = info.description || title;
    const website = info.repository || '';
    const license = info.license || 'Proprietary';

    const setupName = path.basename(nsisExePath);
    const autoUrl = inferGitHubReleaseUrl(website, version, setupName);
    const installerUrl = process.env.RENWEB_WINGET_INSTALLER_URL || autoUrl || `https://example.com/releases/${setupName}`;
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(nsisExePath)).digest('hex').toUpperCase();
    const date = toWingetDate(new Date());
    const manifestRoot = path.join(outDir, 'winget', id, version);
    fs.mkdirSync(manifestRoot, { recursive: true });

    const installerManifest = [
        '# yaml-language-server: $schema=https://aka.ms/winget-manifest.installer.1.9.0.schema.json',
        `PackageIdentifier: ${id}`,
        `PackageVersion: ${version}`,
        'InstallerType: exe',
        'Installers:',
        `  - Architecture: ${wingetArch(arch)}`,
        `    InstallerUrl: ${installerUrl}`,
        `    InstallerSha256: ${sha256}`,
        '    InstallerSwitches:',
        '      Silent: /S',
        '      SilentWithProgress: /S',
        '    Scope: user',
        'ManifestType: installer',
        'ManifestVersion: 1.9.0',
        '',
    ].join('\n');

    const localeManifest = [
        '# yaml-language-server: $schema=https://aka.ms/winget-manifest.defaultLocale.1.9.0.schema.json',
        `PackageIdentifier: ${id}`,
        `PackageVersion: ${version}`,
        'PackageLocale: en-US',
        `Publisher: ${author}`,
        `PackageName: ${title}`,
        `ShortDescription: ${description}`,
        `License: ${license}`,
        website ? `PackageUrl: ${website}` : '',
        `ReleaseDate: ${date}`,
        'ManifestType: defaultLocale',
        'ManifestVersion: 1.9.0',
        '',
    ].filter(Boolean).join('\n');

    const versionManifest = [
        '# yaml-language-server: $schema=https://aka.ms/winget-manifest.version.1.9.0.schema.json',
        `PackageIdentifier: ${id}`,
        `PackageVersion: ${version}`,
        'DefaultLocale: en-US',
        'ManifestType: version',
        'ManifestVersion: 1.9.0',
        '',
    ].join('\n');

    const baseName = `${id}`;
    const installerPath = path.join(manifestRoot, `${baseName}.installer.yaml`);
    const localePath = path.join(manifestRoot, `${baseName}.locale.en-US.yaml`);
    const versionPath = path.join(manifestRoot, `${baseName}.yaml`);
    fs.writeFileSync(installerPath, installerManifest, 'utf8');
    fs.writeFileSync(localePath, localeManifest, 'utf8');
    fs.writeFileSync(versionPath, versionManifest, 'utf8');
    console.log('  [winget] → ' + path.relative(process.cwd(), manifestRoot));
    if (!process.env.RENWEB_WINGET_INSTALLER_URL && !autoUrl) {
        console.log('  ℹ Set RENWEB_WINGET_INSTALLER_URL to your public setup.exe URL before submitting to winget.');
    }
}

// ─── macOS packaging ──────────────────────────────────────────────────────────

/**
 * Build a proper macOS .app bundle inside destDir.
 *
 * Layout (required by RenWeb — Locate::currentDirectory() = executable().parent_path()):
 *   <Title>.app/
 *     Contents/
 *       MacOS/         ← ALL staging files go here as siblings of the binary
 *         <exe>        ← primary executable (CFBundleExecutable)
 *         content/     ← web content
 *         config.json
 *         info.json
 *         plugins/
 *         ...
 *       Info.plist     ← generated from info.json (including permissions)
 *
 * @param {string} stagingDir  Populated staging tree.
 * @param {string} exeFilename Binary filename inside stagingDir (CFBundleExecutable).
 *                             Pass 'bundle_exec.sh' for bundle builds.
 * @param {object} info        Parsed info.json.
 * @param {string} destDir     Directory in which <Title>.app is created.
 * @returns {string}           Absolute path to the created .app bundle.
 */
function buildMacAppBundle(stagingDir, exeFilename, info, destDir) {
    const title        = info.title    || 'App';
    // Launcher script name: strip non-identifier chars (macOS convention, no spaces)
    const launcherName = title.replace(/[^A-Za-z0-9_-]/g, '') || 'App';
    const version      = (info.version || '0.0.1').trim();
    // Prefer app_id (RenWeb convention) then bundle_id, then derive from author+title
    const bundleId     = info.app_id || info.bundle_id
        || ('com.' + toKebab(info.author || 'app').replace(/-/g, '.') + '.' + toKebab(title));
    const copyright    = info.copyright
        || ('Copyright \u00a9 ' + new Date().getFullYear() + ' ' + (info.author || title));

    const appBundle    = path.join(destDir, title + '.app');
    const contentsDir  = path.join(appBundle, 'Contents');
    const macosDir     = path.join(contentsDir, 'MacOS');
    const resourcesDir = path.join(contentsDir, 'Resources');
    // All app data lives in Resources/data/ so the mutable working copy can be
    // bootstrapped to ~/Library/Application Support/<title>/ on first launch.
    const dataDir      = path.join(resourcesDir, 'data');

    if (fs.existsSync(appBundle)) fs.rmSync(appBundle, { recursive: true, force: true });
    fs.mkdirSync(macosDir,  { recursive: true });
    fs.mkdirSync(dataDir,   { recursive: true });

    // Copy ALL stage files into Resources/data/ (real binary + content + config + plugins …)
    copyDir(stagingDir, dataDir);

    // Ensure the real binary (and bundle launcher if applicable) are +x
    const realExe = path.join(dataDir, exeFilename);
    if (fs.existsSync(realExe)) {
        try { fs.chmodSync(realExe, 0o755); } catch (_) {}
    }

    // Use a pre-built app.icns provided by the user in resource/ (same convention
    // as app.rc / app.manifest / app.ico on Windows).  Icon generation is the
    // developer's responsibility; if no file is present the bundle ships without
    // a CFBundleIconFile entry and macOS shows the default placeholder.
    let iconFile = null;
    const icnsSrc = path.join(dataDir, 'resource', 'app.icns');
    if (fs.existsSync(icnsSrc)) {
        try {
            fs.copyFileSync(icnsSrc, path.join(resourcesDir, 'AppIcon.icns'));
            iconFile = 'AppIcon';
        } catch (_) {}
    }

    // Launcher script placed in Contents/MacOS/ (what macOS actually executes).
    // On first run it bootstraps ~/Library/Application Support/<title>/ from the
    // frozen defaults in Resources/data/, then exec-replaces itself with the real
    // binary running from that fully-writable directory — matching the behaviour of
    // Linux's /opt/ install and Windows's %APPDATA%/Local install.
    const launcher = [
        '#!/bin/sh',
        `APP_NAME="${title}"`,
        `EXE_NAME="${exeFilename}"`,
        'DATA_DIR="$HOME/Library/Application Support/$APP_NAME"',
        'BUNDLE_DATA="$(cd "$(dirname "$0")/../Resources/data" && pwd)"',
        '# Bootstrap mutable data directory on first launch',
        'if [ ! -f "$DATA_DIR/$EXE_NAME" ]; then',
        '    mkdir -p "$DATA_DIR"',
        '    cp -a "$BUNDLE_DATA/." "$DATA_DIR/"',
        '    chmod +x "$DATA_DIR/$EXE_NAME" 2>/dev/null || true',
        'fi',
        'exec "$DATA_DIR/$EXE_NAME" "$@"',
    ].join('\n') + '\n';

    const launcherPath = path.join(macosDir, launcherName);
    fs.writeFileSync(launcherPath, launcher, 'utf8');
    try { fs.chmodSync(launcherPath, 0o755); } catch (_) {}

    // Build permission-aware Info.plist from info.json
    const perms = (info.permissions && typeof info.permissions === 'object')
        ? info.permissions : {};
    const nsKeys = [];
    if (perms.geolocation)   nsKeys.push(
        '  <key>NSLocationWhenInUseUsageDescription</key>',
        '  <string>This app uses your location.</string>');
    if (perms.media_devices) nsKeys.push(
        '  <key>NSCameraUsageDescription</key>',
        '  <string>This app uses the camera.</string>',
        '  <key>NSMicrophoneUsageDescription</key>',
        '  <string>This app uses the microphone.</string>');
    if (perms.notifications) nsKeys.push(
        '  <key>NSUserNotificationUsageDescription</key>',
        '  <string>This app sends notifications.</string>');
    if (iconFile) nsKeys.push(
        '  <key>CFBundleIconFile</key>',
        '  <string>' + iconFile + '</string>');

    const plist = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
        '  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
        '<plist version="1.0"><dict>',
        '  <key>CFBundleIdentifier</key>        <string>' + bundleId     + '</string>',
        '  <key>CFBundleName</key>              <string>' + title        + '</string>',
        '  <key>CFBundleDisplayName</key>       <string>' + title        + '</string>',
        '  <key>CFBundleVersion</key>           <string>' + version      + '</string>',
        '  <key>CFBundleShortVersionString</key><string>' + version      + '</string>',
        '  <key>CFBundleExecutable</key>        <string>' + launcherName + '</string>',
        '  <key>CFBundlePackageType</key>       <string>APPL</string>',
        '  <key>NSPrincipalClass</key>          <string>NSApplication</string>',
        '  <key>NSHighResolutionCapable</key>   <true/>',
        '  <key>LSMinimumSystemVersion</key>    <string>10.15</string>',
        '  <key>NSHumanReadableCopyright</key>  <string>' + copyright    + '</string>',
        ...nsKeys,
        '</dict></plist>',
    ].join('\n');
    fs.writeFileSync(path.join(contentsDir, 'Info.plist'), plist, 'utf8');

    return appBundle;
}

/**
 * Build a macOS DMG distributable.
 *
 * On macOS: uses hdiutil (native, produces a proper HFS+ UDZO image).
 * On Linux/Docker: uses xorrisofs or genisoimage (ISO-9660 image, mounts on
 *   macOS but is not a true HFS+ DMG — suitable for CI artifact storage).
 *
 * In both cases the DMG contains a proper .app bundle built via buildMacAppBundle().
 */
function buildMacDmg(opts, info, stagingDir, arch, outPath, isBundle = false, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('dmg')) return;

    const title  = info.title || 'App';
    const exeFor = isBundle ? 'bundle_exec.sh' : exeFilename;

    // tmpBase holds only <Title>.app/ so hdiutil/-srcfolder sees a clean folder
    const tmpBase = path.join(path.dirname(outPath), `_dmg-${arch}`);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });
    buildMacAppBundle(stagingDir, exeFor, info, tmpBase);

    console.log(`  [dmg] \u2192 ${path.relative(process.cwd(), outPath)}`);

    // Prefer native hdiutil on macOS — produces a proper HFS+ UDZO DMG.
    const volname       = title.slice(0, 27);
    const appName       = title + '.app';
    const hasCreateDmg  = spawnSync('which', ['create-dmg'], { encoding: 'utf8' }).status === 0;
    const hasHdiutil    = spawnSync('which', ['hdiutil'],    { encoding: 'utf8' }).status === 0;

    // ── Primary: create-dmg ────────────────────────────────────────────────
    // Produces the classic drag-to-install look: small window, app icon on the
    // left, an arrow, and the Applications shortcut on the right.
    // Install via: brew install create-dmg
    if (hasCreateDmg) {
        try { fs.unlinkSync(outPath); } catch (_) {}

        const cdArgs = [
            '--volname',      volname,
            '--window-pos',   '200', '140',
            '--window-size',  '600', '400',
            '--icon-size',    '128',
            '--icon',         appName, '175', '185',
            '--hide-extension', appName,
            '--app-drop-link', '425', '185',   // draws the arrow + Applications shortcut
        ];

        // Optional developer-supplied background (1200×800 for Retina @2x, 600×400 for non-Retina).
        // Place resource/bk_dmg.png (or bk-dmg.png) alongside app.icns to use it.
        const bgSrc = ['bk_dmg.png', 'bk-dmg.png'].map(n => path.join(stagingDir, 'resource', n)).find(p => fs.existsSync(p));
        if (bgSrc) cdArgs.push('--background', bgSrc);

        cdArgs.push(outPath, tmpBase);
        const r = spawnSync('create-dmg', cdArgs, { stdio: 'inherit' });
        // create-dmg exits 2 when the DMG was created but ad-hoc signing was skipped;
        // treat that as success when the output file actually exists.
        if ((r.status === 0 || r.status === 2) && fs.existsSync(outPath)) {
            macosCodesign(opts, outPath);
            try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
            return;
        }
        console.warn('  \u26a0 create-dmg failed — falling back to hdiutil');
    } else {
        console.warn('  \u26a0 create-dmg not found; install via `brew install create-dmg` for the classic drag-to-install DMG look. Falling back to plain hdiutil.');
    }

    // ── Fallback: hdiutil 3-step UDRW → AppleScript → UDZO ────────────────
    if (hasHdiutil) {
        // create-dmg adds its own Applications symlink; for the plain hdiutil
        // path we add it ourselves so Finder shows the drag-to-install target.
        try { fs.symlinkSync('/Applications', path.join(tmpBase, 'Applications')); } catch (_) {}

        try { fs.unlinkSync(outPath); } catch (_) {}

        const rwPath = outPath.replace(/\.dmg$/, '-rw.dmg');
        try { fs.unlinkSync(rwPath); } catch (_) {}
        const rw = spawnSync('hdiutil', [
            'create', '-volname', volname, '-srcfolder', tmpBase,
            '-ov', '-format', 'UDRW', rwPath,
        ], { stdio: 'pipe' });
        if (rw.status !== 0) {
            console.warn('  \u26a0 DMG creation failed (hdiutil UDRW)');
            try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
            try { fs.unlinkSync(rwPath); } catch (_) {}
            return;
        }

        const attachResult = spawnSync('hdiutil', [
            'attach', '-readwrite', '-noverify', '-noautoopen', rwPath,
        ], { encoding: 'utf8', stdio: 'pipe' });

        let mountPoint = null;
        if (attachResult.status === 0) {
            for (const line of (attachResult.stdout || '').split('\n')) {
                const m = line.match(/\t(\/Volumes\/.+)$/);
                if (m) { mountPoint = m[1].trim(); break; }
            }

            if (mountPoint) {
                const applescript = [
                    `tell application "Finder"`,
                    `  tell disk "${volname}"`,
                    `    open`,
                    `    set current view of container window to icon view`,
                    `    set toolbar visible of container window to false`,
                    `    set statusbar visible of container window to false`,
                    `    set the bounds of container window to {400, 200, 1000, 600}`,
                    `    set theViewOptions to icon view options of container window`,
                    `    set arrangement of theViewOptions to not arranged`,
                    `    set icon size of theViewOptions to 100`,
                    `    set position of item "${appName}" of container window to {175, 185}`,
                    `    set position of item "Applications" of container window to {425, 185}`,
                    `    update without registering applications`,
                    `    close`,
                    `  end tell`,
                    `end tell`,
                ].join('\n');
                spawnSync('osascript', ['-e', applescript], { stdio: 'pipe', timeout: 20000 });
                spawnSync('sync', [], { stdio: 'pipe' });
            }

            const detach = spawnSync('hdiutil', ['detach', mountPoint || rwPath, '-force'],
                { stdio: 'pipe' });
            if (detach.status !== 0 && mountPoint) {
                spawnSync('diskutil', ['unmount', 'force', mountPoint], { stdio: 'pipe' });
                spawnSync('hdiutil', ['detach', mountPoint, '-force'], { stdio: 'pipe' });
            }
            spawnSync('sleep', ['1'], { stdio: 'pipe' });
        }

        const conv = spawnSync('hdiutil', [
            'convert', rwPath, '-format', 'UDZO', '-imagekey', 'zlib-level=9', '-o', outPath,
        ], { stdio: 'inherit' });
        try { fs.unlinkSync(rwPath); } catch (_) {}

        if (conv.status !== 0) console.warn('  \u26a0 DMG conversion to UDZO failed');
        else macosCodesign(opts, outPath);
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    // Linux/Docker fallback: xorrisofs (newer) or genisoimage
    let isoCmd = null;
    for (const cmd of ['xorrisofs', 'genisoimage']) {
        if (spawnSync('which', [cmd], { encoding: 'utf8' }).status === 0) { isoCmd = cmd; break; }
    }
    if (!isoCmd) {
        console.warn('  \u26a0 hdiutil/xorrisofs/genisoimage not found — skipping DMG');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }
    // Note: '-apple' HFS extensions are not supported by xorriso on Linux.
    const r = spawnSync(isoCmd,
        ['-V', title.slice(0, 32), '-D', '-R', '-o', outPath, tmpBase],
        { stdio: 'inherit' });
    if (r.status !== 0) console.warn('  \u26a0 DMG creation failed');
    else macosCodesign(opts, outPath);
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

    const pkgId  = toKebab(info.title || 'app');
    const version = (info.version || '0.0.1').trim();
    const stem   = pkgId + '-' + version + '-macos-' + arch + '-mas';
    // For bundle builds the entry point is bundle_exec.sh, not the archive filename
    const exeFor = isBundle ? 'bundle_exec.sh' : exeFilename;

    const tmpBase = path.join(os.tmpdir(), '_renweb-mas-' + pkgId + '-' + arch);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });

    const appBundle = buildMacAppBundle(stagingDir, exeFor, info, tmpBase);

    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, stem + '.pkg');
    console.log('  [mas] \u2192 ' + path.relative(process.cwd(), outFile));

    // Wrap with a distribution XML so productbuild shows a license agreement screen.
    const masLicSrc   = path.join(stagingDir, 'licenses', 'LICENSE');
    const masBgPkgSrc = ['bk_pkg.png', 'bk-pkg.png'].map(n => path.join(stagingDir, 'resource', n)).find(p => fs.existsSync(p)) || null;
    const masDistPath = path.join(tmpBase, 'mas-distribution.xml');
    const masBundleId = info.app_id || info.bundle_id
        || ('com.' + toKebab(info.author || 'app').replace(/-/g, '.') + '.' + toKebab(info.title || 'app'));
    const masVersion  = (info.version || '0.0.1').trim();

    // Step 1: flat component pkg
    const masComponentPkg = outFile.replace(/\.pkg$/, '-component.pkg');
    const masCompR = spawnSync('pkgbuild', [
        '--component',        appBundle,
        '--install-location', '~/Applications',
        '--identifier',       masBundleId,
        '--version',          masVersion,
        masComponentPkg,
    ], { stdio: 'inherit' });

    if (masCompR.status === 0) {
        const masDistXml = [
            '<?xml version="1.0" encoding="utf-8"?>',
            '<installer-gui-script minSpecVersion="1">',
            `  <title>${xmlEscapeSimple(info.title || 'App')}</title>`,
            fs.existsSync(masLicSrc) ? `  <license file="LICENSE"/>` : '',
            fs.existsSync(masBgPkgSrc) ? `  <background file="bk_pkg.png" mime-type="image/png" alignment="center" scaling="proportional"/>` : '',
            '  <options customize="never" require-scripts="false"/>',
            '  <choices-outline>',
            '    <line choice="default"/>',
            '  </choices-outline>',
            '  <choice id="default" visible="false">',
            `    <pkg-ref id="${xmlEscapeSimple(masBundleId)}"/>`,
            '  </choice>',
            `  <pkg-ref id="${xmlEscapeSimple(masBundleId)}" version="${xmlEscapeSimple(masVersion)}" onConclusion="none">${xmlEscapeSimple(path.basename(masComponentPkg))}</pkg-ref>`,
            '</installer-gui-script>',
            '',
        ].filter(Boolean).join('\n');
        fs.writeFileSync(masDistPath, masDistXml, 'utf8');

        const masHasResources = fs.existsSync(masLicSrc) || fs.existsSync(masBgPkgSrc);
        const masArgs = ['--distribution', masDistPath, '--package-path', path.dirname(masComponentPkg)];
        if (masHasResources) {
            const masResDir = path.join(tmpBase, 'mas-resources');
            const masLprojDir = path.join(masResDir, 'en.lproj');
            fs.mkdirSync(masLprojDir, { recursive: true });
            if (fs.existsSync(masLicSrc)) fs.copyFileSync(masLicSrc, path.join(masLprojDir, 'LICENSE'));
            if (fs.existsSync(masBgPkgSrc)) {
                // Copy to resources root so <background file="bk_pkg.png"/> resolves correctly
                fs.copyFileSync(masBgPkgSrc, path.join(masResDir, 'bk_pkg.png'));
            }
            masArgs.push('--resources', masResDir);
        }
        masArgs.push(outFile);

        const r = spawnSync('productbuild', masArgs, { stdio: 'inherit' });
        try { fs.unlinkSync(masComponentPkg); } catch (_) {}
        if (r.status === 0) macosProductsign(opts, outFile, 'mas');
        else console.warn('  \u26a0 productbuild (mas distribution) failed');
    } else {
        console.warn('  \u26a0 pkgbuild (mas component) failed');
    }
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
    );
    // Bundle: bundle_exec.sh already sets GDK_BACKEND=wayland (strict, overridable).
    // Bare: prefer Wayland but allow X11 fallback since system libs support both.
    if (!isBundle) {
        wrapperLines.push(
            '# Prefer Wayland; fall back to X11 if Wayland is unavailable.',
            '[ -z "$GDK_BACKEND" ] && export GDK_BACKEND=wayland,x11',
            '',
        );
    }
    wrapperLines.push(
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
    // bin/<pkgId> wrapper: copy app to $XDG_DATA_HOME once per version so the
    // engine can write log.txt and other runtime files next to its executable.
    // Inside the Flatpak sandbox $XDG_DATA_HOME resolves to
    // ~/.var/app/<appId>/data/ — a per-app writable directory that is cleaned
    // up automatically on `flatpak uninstall --delete-data`.
    const wrapperSh = [
        '#!/bin/sh',
        'SRC="/app/opt/' + pkgId + '"',
        'DEST="${XDG_DATA_HOME:-$HOME/.local/share}/' + pkgId + '"',
        'STAMP="$DEST/.version"',
        '# Copy app tree once per version into writable XDG_DATA_HOME.',
        'if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "' + version + '" ]; then',
        '    rm -rf "$DEST" && mkdir -p "$DEST"',
        '    cp -a "$SRC/." "$DEST/" || { echo "flatpak: copy failed" >&2; exit 1; }',
        '    echo "' + version + '" > "$STAMP"',
        'fi',
        '# Prefer Wayland; fall back to X11 if Wayland is unavailable.',
        '[ -z "$GDK_BACKEND" ] && export GDK_BACKEND=wayland,x11',
        'exec "$DEST/' + binTarget + '" "$@"',
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
        '--filesystem=xdg-data:create',
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
# Prefer Wayland; fall back to X11 if Wayland is unavailable.
[ -z "\$GDK_BACKEND" ] && export GDK_BACKEND=wayland,x11
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
    if (opts.bundleOnly)      console.log('  mode      : bundle-only');
    if (opts.executableOnly)  console.log('  mode      : executable-only');
    if (opts.exts.size > 0)   console.log(`  formats   : ${[...opts.exts].join(', ')}`);
    if (opts.oses.size > 0)   console.log(`  os filter : ${[...opts.oses].join(', ')}`);
    if (opts.arches.size > 0) console.log(`  arch filter: ${[...opts.arches].join(', ')}`);
    if (opts.cache)           console.log('  cache     : enabled (.rw/package/)');

        opts.credDir = opts.noCredentials ? null : findCredentialsDir();
        if (opts.noCredentials)       console.log('  signing   : disabled (--no-credentials)');
        else if (opts.credDir)        console.log(`  signing   : ${opts.credDir}`);
        else                          console.log('  signing   : credentials/ not found — outputs will be unsigned');
    if (process.env.IN_DOCKER !== '1')
        console.log('\n  Tip: run `rw build` first to ensure build/ is up to date before packaging.');

    // ── 2. Set up directories ─────────────────────────────────────────────────
    const projectRoot = path.resolve(buildDir, '..');
    const cacheDir    = path.join(projectRoot, '.rw', 'package');    // all working files
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
        const targetOs   = key.split('-')[0];
        const targetArch = key.slice(targetOs.length + 1);
        const isWindowsTarget = targetOs === 'windows' || targetOs === 'win';
        // OS filter
        if (opts.oses.size > 0 && !opts.oses.has(targetOs)) {
            console.log(`  skip (os filter): ${key}`); continue;
        }
        // Arch filter
        if (opts.arches.size > 0 && !opts.arches.has(targetArch)) {
            console.log(`  skip (arch filter): ${key}`); continue;
        }

        // Decide which asset type(s) to produce for this key
        const picks = [];
        if (!opts.bundleOnly && group.bare)
            picks.push({ ...group.bare,      isBundle: false, isBootstrap: false });
        if (!opts.executableOnly && group.bundle && !isWindowsTarget)
            picks.push({ ...group.bundle,    isBundle: true,  isBootstrap: false });
        if (!opts.executableOnly && group.bootstrap)
            picks.push({ ...group.bootstrap, isBundle: true,  isBootstrap: true  });
        if (!opts.executableOnly && group.bundle && isWindowsTarget) {
            console.log(`  ℹ  ${key}: skipping fixed-runtime bundle asset (bootstrap bundles only)`);
        }
        // Graceful fallback: if the requested type doesn't exist in this release
        if (picks.length === 0) {
            const fallback = (!opts.executableOnly && group.bootstrap)
                ? group.bootstrap
                : (!opts.bundleOnly && group.bare)
                    ? group.bare
                    : (!isWindowsTarget ? group.bundle : null);
            if (fallback) {
                const fb = {
                    ...fallback,
                    isBundle: !!fallback.bootstrap || fallback === group.bundle || fallback === group.bootstrap,
                    isBootstrap: fallback === group.bootstrap,
                };
                picks.push(fb);
                const kind = fallback === group.bootstrap ? 'bundle-bootstrap'
                    : fallback === group.bundle ? 'bundle'
                    : 'bare';
                console.log(`  ℹ  ${key}: requested type unavailable, using ${kind}`);
            } else if (isWindowsTarget && group.bundle && !group.bootstrap && !opts.executableOnly) {
                console.log(`  ℹ  ${key}: only fixed-runtime bundle available; skipped by policy`);
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

    // Warn when build/plugins/ has plugin files but no plugin-repositories are configured,
    // since those files will be excluded from all packages.
    if (pluginRepos.length === 0) {
        const buildPluginsDir = path.join(buildDir, 'plugins');
        if (fs.existsSync(buildPluginsDir)) {
            const pluginFiles = fs.readdirSync(buildPluginsDir).filter(f => /\.(so|dll)$/.test(f));
            if (pluginFiles.length > 0)
                console.warn(`\n  ⚠ build/plugins/ has ${pluginFiles.length} plugin file(s) but no "plugin-repositories" in info.json — plugins will be excluded from packages.`);
        }
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

// ─── Docker / native dispatch ─────────────────────────────────────────────────
// Owns the decision of whether to run natively (macOS-only targets) or via
// Docker (Linux / Windows targets), or both.  Called by the CLI entry point.
function dispatch(args) {
    function normalizePathForDocker(p) {
        if (process.platform !== 'win32') return p;
        const m = p.match(/^([A-Za-z]):\\?(.*)$/);
        if (!m) return p.replace(/\\/g, '/');
        const drive = m[1].toLowerCase();
        const rest  = m[2].replace(/\\/g, '/');
        return `/${drive}/${rest}`;
    }

    // If already executing inside the container, skip dispatch entirely.
    if (process.env.IN_DOCKER === '1') {
        run(args);
        return;
    }

    const MACOS_OSES    = new Set(['macos', 'darwin']);
    const requestedOses = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--os' || a === '-o') {
            if (args[i + 1]) requestedOses.push(args[i + 1].toLowerCase());
        } else if (a.startsWith('--os=')) {
            requestedOses.push(a.slice(5).toLowerCase());
        } else if (a.startsWith('-o') && a.length > 2) {
            requestedOses.push(a.slice(2).toLowerCase());
        }
    }

    const allMacos = requestedOses.length > 0 && requestedOses.every(o => MACOS_OSES.has(o));
    const anyMacos = requestedOses.length === 0 || requestedOses.some(o => MACOS_OSES.has(o));

    function argsWithOs(osValues) {
        const stripped = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a === '--os' || a === '-o') { i++; continue; }
            if (a.startsWith('--os=') || (a.startsWith('-o') && a.length > 2)) continue;
            stripped.push(a);
        }
        return [...stripped, ...osValues.flatMap(o => ['--os', o])];
    }

    function runNative(nativeArgs) {
        console.log('\n── Running natively for macOS packages (hdiutil / pkgbuild / productbuild) ──');
        run(nativeArgs);
    }

    function runInDocker(dockerArgs, onExit) {
        let dockerOk = false;
        try { dockerOk = spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0; } catch (e) {}
        if (!dockerOk) {
            console.error('docker is required to build Linux / Windows packages. Please install Docker and try again.');
            process.exit(2);
        }

        // __dirname is cli/commands/ — go one level up to reach the cli/ folder (where the Dockerfile lives)
        const cliDir  = path.resolve(__dirname, '..');
        const hostDir = normalizePathForDocker(cliDir);
        const hostCwd = normalizePathForDocker(path.resolve(process.cwd()));
        const image   = process.env.RENWEB_IMAGE || 'renweb-cli';

        let imageExists = false;
        try {
            const inspect = spawnSync('docker', ['images', '-q', image], { encoding: 'utf8' });
            imageExists   = Boolean(inspect.stdout && inspect.stdout.trim().length > 0);
        } catch (e) {}

        if (!imageExists) {
            console.log(`Docker image '${image}' not found locally — building it now.`);
            const buildRes = spawnSync('docker', ['build', '-t', image, cliDir], { stdio: 'inherit' });
            if (buildRes.status !== 0) {
                console.error('Failed to build docker image; cannot continue.');
                process.exit(buildRes.status || 3);
            }
        }

        if (process.platform !== 'win32') {
            const pkgCache = path.join(process.cwd(), '.rw', 'package');
            try {
                fs.mkdirSync(pkgCache, { recursive: true });
            } catch (e) {
                if (e.code === 'EACCES') {
                    console.error(
                        `Error: ${pkgCache} is owned by root from a previous run.\n` +
                        `Fix with: sudo chown -R $USER "${pkgCache}"`
                    );
                    process.exit(4);
                }
            }
        }

        const userFlag      = process.platform !== 'win32'
            ? ['--user', `${process.getuid()}:${process.getgid()}`]
            : [];
        const containerName = `renweb-pkg-${Date.now()}`;
        const dockerRunArgs = [
            'run', '--rm',
            '--name', containerName,
            '-e', 'IN_DOCKER=1',
            '-e', 'RENWEB_CWD=/project',
            ...userFlag,
            '-v', `${hostCwd}:/project`,
            '-v', `${hostDir}:/work`,
            '-w', '/project',
            image,
            'package', ...dockerArgs,
        ];

        function killContainer() {
            try { spawnSync('docker', ['kill', containerName], { stdio: 'ignore' }); } catch (_) {}
        }
        process.on('SIGINT',  killContainer);
        process.on('SIGTERM', killContainer);

        const child = spawn('docker', dockerRunArgs, { stdio: 'inherit' });
        child.on('exit', (code, signal) => {
            process.off('SIGINT',  killContainer);
            process.off('SIGTERM', killContainer);
            onExit(code ?? (signal ? 1 : 0));
        });
    }

    if (allMacos) {
        runNative(args);
    } else if (!anyMacos) {
        runInDocker(args, (code) => process.exit(code));
    } else {
        const macosOses    = requestedOses.filter(o => MACOS_OSES.has(o));
        const nonMacosOses = requestedOses.filter(o => !MACOS_OSES.has(o));

        const dockerArgs = requestedOses.length === 0
            ? argsWithOs(['linux', 'windows'])
            : argsWithOs(nonMacosOses);
        const nativeArgs = requestedOses.length === 0
            ? argsWithOs(['macos'])
            : argsWithOs(macosOses.length > 0 ? macosOses : ['macos']);

        if (process.platform !== 'darwin') {
            console.log('── Packaging: running Docker (linux/windows) — macOS packages require a macOS host ──');
            runInDocker(args, (code) => process.exit(code));
            return;
        }
        console.log('── Packaging: running Docker (linux/windows) then native (macos) ──');
        runInDocker(dockerArgs, (dockerCode) => {
            if (dockerCode !== 0) console.warn(`⚠ Docker packaging exited with code ${dockerCode}`);
            runNative(nativeArgs);
        });
    }
}

module.exports = { run, dispatch };
