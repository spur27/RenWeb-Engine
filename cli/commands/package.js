'use strict';

const fs     = require('fs');
const path   = require('path');
const os     = require('os');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');
const ui = require('../shared/ui');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_ENGINE_REPO = 'https://github.com/spur27/RenWeb-Engine';

// Runtime dependencies for bare executables, keyed by fpm/nfpm format.
// Package names differ between formats; each entry uses the canonical name for
// that format's package manager: apt (deb), dnf/zypper (rpm), pacman, apk (nfpm), pkg (freebsd).
const LINUX_DEPS = {
    deb: {
        required:    ['libgtk-3-0', 'libwebkit2gtk-4.1-0', 'libegl1', 'gstreamer1.0-plugins-base', 'gstreamer1.0-plugins-good'],
        recommended: ['gstreamer1.0-plugins-bad', 'gstreamer1.0-plugins-ugly'],
    },
    rpm: {
        // Fedora/RHEL and openSUSE use different package names; RPM boolean deps
        // (RPM 4.13+, Fedora 24+, openSUSE Leap 15+) let one .rpm satisfy both.
        // WebKit2GTK 4.1 API packages by distro:
        //   webkit2gtk4.1       = Fedora ≤41 / RHEL (dnf name for 4.1 API)
        //   webkitgtk           = Fedora 42+ (package renamed upstream in F42)
        //   webkit2gtk4         = openSUSE Tumbleweed (4.x series = 4.1 API)
        //   webkit2gtk-4_1      = openSUSE (virtual provide by libwebkit2gtk-4_1-0)
        //   libwebkit2gtk-4_1-0 = openSUSE Leap (actual runtime package name)
        // NOTE: webkit2gtk3 (RHEL/CentOS) is the 4.0 API — intentionally excluded.
        //   mesa-libEGL     = Fedora/RHEL    Mesa-libEGL1   = openSUSE
        //   gstreamer1-*    = Fedora/RHEL    gstreamer-*    = openSUSE (no "1")
        required: [
            'gtk3',
            '(webkit2gtk4.1 or webkitgtk or webkit2gtk4 or webkit2gtk-4_1 or libwebkit2gtk-4_1-0)',
            '(mesa-libEGL or Mesa-libEGL1)',
            '(gstreamer1-plugins-base or gstreamer-plugins-base)',
            '(gstreamer1-plugins-good or gstreamer-plugins-good)',
        ],
        recommended: [],
    },
    pacman: {
        // Arch Linux (pacman) — no Recommends concept
        required:    ['gtk3', 'webkit2gtk-4.1', 'mesa', 'gst-plugins-base', 'gst-plugins-good'],
        recommended: [],
    },
    apk: {
        // Alpine Linux (apk via nfpm) — musl-based; EGL comes from mesa-egl
        required:    ['gtk+3.0', 'webkit2gtk-4.1', 'mesa-egl', 'gst-plugins-base', 'gst-plugins-good'],
        recommended: [],
    },
    freebsd: {
        // FreeBSD (pkg) — webkit2-gtk3 is the port name for WebKit2GTK
        required:    ['gtk3', 'webkit2-gtk3', 'mesa-libs', 'gstreamer1-plugins-base', 'gstreamer1-plugins-good'],
        recommended: [],
    },
    void: {
        // Void Linux (xbps-create) — libwebkit2gtk41 is the Void package for WebKit2GTK 4.1 (GTK3) API.
        // gst-plugins-base1 / gst-plugins-good1 are the correct Void package names.
        // Version constraints (>=0_1) are required: without an explicit ><!=
        // operator, xbps-install cannot reliably extract the pkgname from
        // strings containing '+', causing "can't guess pkgname" errors.
        required:    ['gtk+3>=0_1', 'libwebkit2gtk41>=0_1', 'mesa>=0_1', 'gst-plugins-base1>=0_1', 'gst-plugins-good1>=0_1'],
        recommended: [],
    },
};

const RE_EXEC   = /^(.+)-(\d+[\w.]*)-(\w+)-([\w]+?)(?:\.exe)?$/;

const BUILD_EXCLUDES         = new Set(['log.txt', 'plugins', 'lib']);
const BUILD_EXCLUDE_PREFIXES = ['lib-'];

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

// Maps engine arch names → Alpine APK arch strings (passed verbatim; nfpm remaps standard Go names so we use Alpine names directly).
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

// Maps engine arch names → Void Linux XBPS architecture strings.
// Void officially supports: x86_64, i686, aarch64, armv7l, armv6l, ppc64le, ppc64, riscv64.
const XBPS_ARCH_MAP = {
    x86_64   : 'x86_64',
    x86_32   : 'i686',
    arm64    : 'aarch64',
    aarch64  : 'aarch64',
    arm32    : 'armv7l',
    armhf    : 'armv7l',
    powerpc32: 'ppc',
    powerpc64: 'ppc64le',
    riscv64  : 'riscv64',
    mips32   : 'mips',
    mips32el : 'mipsel',
    mips64   : 'mips64',
    mips64el : 'mips64el',
    s390x    : 's390x',
    sparc64  : 'sparc64',
};

// FreeBSD port origins for packages listed in LINUX_DEPS.freebsd.
// fpm silently drops deps from its FreeBSD backend (open bug since 2016), so
// we post-process the .txz ourselves.  The version field is a placeholder;
// pkg records it for display but does not enforce exact version matching.
const FREEBSD_PKG_ORIGINS = {
    'gtk3':                        { origin: 'x11-toolkits/gtk30',                 version: '0' },
    'webkit2-gtk3':                { origin: 'www/webkit2-gtk3',                   version: '0' },
    'mesa-libs':                   { origin: 'graphics/mesa-libs',                 version: '0' },
    'gstreamer1-plugins-base':     { origin: 'multimedia/gstreamer1-plugins-base', version: '0' },
    'gstreamer1-plugins-good':     { origin: 'multimedia/gstreamer1-plugins-good', version: '0' },
};

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

const ELF_MACHINE_FOR_APPIMAGE_ARCH = { x86_64: 0x3E, i686: 0x03, aarch64: 0xB7, armhf: 0x28 };

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

/** Stable Windows package ID; prefers info.app_id to avoid renaming drift. */
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
    const recurse = (dir) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) recurse(p);
            else if (e.isFile()) bytes += fs.statSync(p).size;
        }
    };
    recurse(dirPath);
    return Math.ceil(bytes / 1024);
}

/** Parse info.json `categories` into a valid freedesktop.org `Categories=` value (falls back to 'Utility;'). */
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
 * Download a URL to a local file using curl or wget. Returns true on success.
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

/** Find the first available binary in the PATH from a candidate list. */
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
    ui.step(`Fetching release metadata: ${apiUrl}`);
    const tmpFile = path.join(os.tmpdir(), `renweb-rel-${Date.now()}.json`);
    if (!download(apiUrl, tmpFile)) {
        throw new Error(`Failed to fetch release metadata from ${apiUrl}`);
    }
    const rel = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    try { fs.unlinkSync(tmpFile); } catch (_) {}
    return rel;
}

/** Walk up from cwd returning the path of the first ancestor directory named `name`, or null. */
function findAncestorDir(name) {
    let cur = process.env.RENWEB_CWD ? path.resolve(process.env.RENWEB_CWD) : process.cwd();
    while (true) {
        const cand = path.join(cur, name);
        if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) return cand;
        const parent = path.dirname(cur);
        if (parent === cur) return null;
        cur = parent;
    }
}

const findBuildDir       = () => findAncestorDir('build');
const findCredentialsDir = () => findAncestorDir('credentials');

/** Find the first app icon under resource/ or resources/ in stagingDir. Returns { src, ext } or null. */
function findAppIcon(stagingDir) {
    for (const ext of ['png', 'svg', 'jpg']) {
        for (const cand of [
            path.join(stagingDir, 'resource',  `icon.${ext}`),
            path.join(stagingDir, 'resource',  `app.${ext}`),
            path.join(stagingDir, 'resources', `icon.${ext}`),
            path.join(stagingDir, 'resources', `app.${ext}`),
        ]) {
            if (fs.existsSync(cand)) return { src: cand, ext };
        }
    }
    return null;
}

/** Write no-op post-install and seed-removing post-remove scripts to temp files. Returns { postInstall, postRemove }. */
function makeLinuxPostScripts(pkgId, tmpOutDir, suffix) {
    const postInstall = path.join(tmpOutDir, `_renweb-postinstall-${suffix}.sh`);
    const postRemove  = path.join(tmpOutDir, `_renweb-postremove-${suffix}.sh`);
    fs.writeFileSync(postInstall, `#!/bin/sh\n# Seed is installed read-only into /usr/share/${pkgId}/.\n# User data will be bootstrapped to ~/.local/share/${pkgId}/ on first launch.\n`, 'utf8');
    makeExecutable(postInstall);
    fs.writeFileSync(postRemove,  `#!/bin/sh\nrm -rf /usr/share/${pkgId}/\n`, 'utf8');
    makeExecutable(postRemove);
    return { postInstall, postRemove };
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
    if (s === 'xbps' || s === 'void')              return 'xbps';
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

function parseArgs(args) {
    const opts = {
        exts           : new Set(),   // empty = all formats
        oses           : new Set(),   // empty = all OS targets
        arches         : new Set(),   // empty = all architectures
        cache          : false,
        noCredentials  : false,
    };
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
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

function parseExecAsset(filename) {
    const m = RE_EXEC.exec(filename);
    if (!m) return null;
    return { name: m[1], version: m[2], os: m[3], arch: m[4] };
}

/** Group release assets by {os}-{arch}; each group has a `bare` executable. */
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
        }
    }
    return groups;
}

// ─── Staging / package builder ────────────────────────────────────────────────

/** Generate /usr/bin/<pkgId> bootstrap wrapper: seeds ~/.local/share/<pkgId>/ from /usr/share/<pkgId>/ on first launch, handles sudo/pkexec, and refreshes on version change. */
function generateLinuxWrapperScript(pkgId, version) {
    return [
        '#!/bin/sh',
        '# RenWeb bootstrap wrapper — generated by rw package',
        '# DO NOT EDIT: this file is replaced on every package upgrade.',
        '',
        '_RW_SEED="/usr/share/' + pkgId + '"',
        '_RW_VERSION="' + version + '"',
        '',
        '# ── Resolve the real user even when invoked via sudo / pkexec / su ──',
        'if [ -n "${SUDO_USER:-}" ]; then',
        '    _RW_USER="$SUDO_USER"',
        '    _RW_HOME="$(getent passwd "$SUDO_USER" 2>/dev/null | cut -d: -f6)"',
        'elif [ -n "${PKEXEC_UID:-}" ]; then',
        '    _RW_USER="$(id -un "$PKEXEC_UID" 2>/dev/null || echo root)"',
        '    _RW_HOME="$(getent passwd "$_RW_USER" 2>/dev/null | cut -d: -f6)"',
        'else',
        '    _RW_USER="${USER:-$(id -un)}"',
        '    _RW_HOME="${HOME:-$(getent passwd "$_RW_USER" 2>/dev/null | cut -d: -f6)}"',
        'fi',
        '',
        '# ── Sanity checks ────────────────────────────────────────────────────',
        'if [ -z "$_RW_HOME" ]; then',
        '    printf "error: %s: cannot determine home directory for user %s\\n" "' + pkgId + '" "$_RW_USER" >&2',
        '    exit 1',
        'fi',
        'if [ ! -d "$_RW_SEED" ]; then',
        '    printf "error: %s: seed directory %s is missing (re-install the package)\\n" "' + pkgId + '" "$_RW_SEED" >&2',
        '    exit 1',
        'fi',
        '',
        '# ── Data directory (mutable, user-owned) ─────────────────────────────',
        '# Honour XDG_DATA_HOME when set by the *real* user (not by sudo).',
        '# Under sudo XDG_DATA_HOME may point to the root home, so we recompute it.',
        'if [ "$(id -u)" -eq 0 ]; then',
        '    _RW_DATA="$_RW_HOME/.local/share/' + pkgId + '"',
        'else',
        '    _RW_DATA="${XDG_DATA_HOME:-$_RW_HOME/.local/share}/' + pkgId + '"',
        'fi',
        '_RW_STAMP="$_RW_DATA/.renweb-version"',
        '',
        '# ── Bootstrap / upgrade: copy seed to data dir ───────────────────────',
        '_rw_needs_copy=0',
        '[ ! -d "$_RW_DATA" ] && _rw_needs_copy=1',
        '[ "$_rw_needs_copy" -eq 0 ] && { _rw_v=$(cat "$_RW_STAMP" 2>/dev/null); [ "$_rw_v" != "$_RW_VERSION" ] && _rw_needs_copy=1; }',
        '',
        'if [ "$_rw_needs_copy" -eq 1 ]; then',
        '    printf "%s: installing application data to %s\\n" "' + pkgId + '" "$_RW_DATA"',
        '    _rw_copy() {',
        '        rm -rf "$_RW_DATA" 2>/dev/null || true',
        '        mkdir -p "$_RW_DATA" || { printf "error: %s: cannot create %s\\n" "' + pkgId + '" "$_RW_DATA" >&2; exit 1; }',
        '        cp -a "$_RW_SEED/." "$_RW_DATA/" || { printf "error: %s: copy from %s failed\\n" "' + pkgId + '" "$_RW_SEED" >&2; exit 1; }',
        '        printf "%s" "$_RW_VERSION" > "$_RW_STAMP"',
        '    }',
        '    if [ "$(id -u)" -eq 0 ]; then',
        '        # Running as root (e.g. sudo/pkexec): drop privileges for the copy so',
        '        # the data dir ends up owned by the real user, not root.',
        '        # Export vars so they are visible inside the su child shell.',
        '        export _RW_DATA _RW_STAMP _RW_SEED _RW_VERSION',
        '        su -s /bin/sh "$_RW_USER" -c \'',
        '            rm -rf "$_RW_DATA" 2>/dev/null || true',
        '            mkdir -p "$_RW_DATA" || { printf "error: cannot create %s\\n" "$_RW_DATA" >&2; exit 1; }',
        '            cp -a "$_RW_SEED/." "$_RW_DATA/"',
        '            printf "%s" "$_RW_VERSION" > "$_RW_STAMP"',
        '        \' || { printf "error: %s: failed to install as user %s\\n" "' + pkgId + '" "$_RW_USER" >&2; exit 1; }',
        '    else',
        '        _rw_copy',
        '    fi',
        'fi',
        '',
        '# ── Resolve the launch target (version-agnostic, rename-safe) ────────',
        '# We do NOT hardcode the executable name so the wrapper survives engine',
        '# upgrades and user-renamed executables.',
        '_RW_TARGET=""',
        'for _rw_f in "$_RW_DATA"/*; do',
        '    [ -f "$_rw_f" ] || continue',
        '    [ -x "$_rw_f" ] || continue',
        '    case "$_rw_f" in *.sh) continue ;; esac',
        '    _RW_TARGET="$_rw_f"',
        '    break',
        'done',
        '',
        'if [ -z "$_RW_TARGET" ]; then',
        '    printf "error: %s: no executable found in %s (try re-installing the package)\\n" "' + pkgId + '" "$_RW_DATA" >&2',
        '    exit 1',
        'fi',
        '',
        '# ── Launch ───────────────────────────────────────────────────────────',
        '# Set RENWEB_EXECUTABLE_PATH so the engine locates its data directory correctly.',
        'export RENWEB_EXECUTABLE_PATH="$_RW_TARGET"',
        '',
        'if [ "$(id -u)" -eq 0 ]; then',
        '    # Still root after bootstrap: exec as the real user via su.',
        '    # We write a tiny helper script to a tmpfile to avoid quoting nightmares',
        '    # when passing arbitrary user arguments through su -c.',
        '    _rw_tmp="$(mktemp /tmp/.renweb-launch-XXXXXX.sh 2>/dev/null)" || {',
        '        printf "error: %s: mktemp failed\\n" "' + pkgId + '" >&2; exit 1',
        '    }',
        '    chmod 700 "$_rw_tmp"',
        '    # Bake the display/session env vars into the tmpfile so they reach',
        '    # the process after su drops privileges (su does not propagate env).',
        '    printf \'#!/bin/sh\\nexport RENWEB_EXECUTABLE_PATH="%s"\\nexport DISPLAY="%s"\\nexport WAYLAND_DISPLAY="%s"\\nexport XDG_RUNTIME_DIR="%s"\\nexec "%s" "$@"\\n\' \\',
        '        "$_RW_TARGET" "${DISPLAY:-}" "${WAYLAND_DISPLAY:-}" "${XDG_RUNTIME_DIR:-}" "$_RW_TARGET" > "$_rw_tmp"',
        '    # su -s <shell> <user> -- <script> [args…]',
        '    su -s /bin/sh "$_RW_USER" -- "$_rw_tmp" "$@"',
        '    rm -f "$_rw_tmp"',
        'else',
        '    exec "$_RW_TARGET" "$@"',
        'fi',
        '',
    ].join('\n');
}

/** Build system-layout staging tree under destRoot: seed at /usr/share/<pkgId>/, wrapper at /usr/bin/<pkgId>, .desktop file, and icon. Shared by buildFpmPackages and buildXbpsPackage. */
function buildSystemLayoutStaging(stagingDir, pkgId, version, exeFilename, info, destRoot) {
    const seedDir  = path.join(destRoot, 'usr', 'share', pkgId);
    const appsDir  = path.join(destRoot, 'usr', 'share', 'applications');
    const iconsDir = path.join(destRoot, 'usr', 'share', 'icons', 'hicolor', '256x256', 'apps');
    const binDir   = path.join(destRoot, 'usr', 'bin');
    for (const d of [seedDir, appsDir, iconsDir, binDir]) fs.mkdirSync(d, { recursive: true });

    // Seed: read-only copy of all app files (bootstrapped to user's home on first launch).
    copyDir(stagingDir, seedDir);

    // Wrapper script at /usr/bin/<pkgId>
    const wrapperContent = generateLinuxWrapperScript(pkgId, version);
    const binPath = path.join(binDir, pkgId);
    fs.writeFileSync(binPath, wrapperContent, 'utf8');
    makeExecutable(binPath);

    const cats    = parseCats(info.categories || info.category);
    const appId   = info.app_id  || pkgId;
    const desc    = info.description || '';
    const website = info.repository  || '';

    // Icon and .desktop file are named after appId so the Wayland compositor can
    // match the xdg_toplevel app-id (set via g_set_prgname) to the correct icon.
    // freedesktop spec: desktop file name == icon name == xdg app-id.
    let iconSystemPath = appId; // fallback: icon name (freedesktop theme lookup)
    const icon = findAppIcon(stagingDir);
    if (icon) {
        fs.copyFileSync(icon.src, path.join(iconsDir, `${appId}.${icon.ext}`));
        iconSystemPath = `/usr/share/icons/hicolor/256x256/apps/${appId}.${icon.ext}`;
    }

    // Exec points to /usr/bin/<pkgId> (the wrapper) — not directly to the seed or
    // the user data dir, both of which are inaccessible to the .desktop resolver.
    const desktopLines = [
        '[Desktop Entry]',
        'Version=1.0',
        'Type=Application',
        `Name=${info.title || pkgId}`,
        `Comment=${desc}`,
        `Exec=/usr/bin/${pkgId} %u`,
        `TryExec=/usr/bin/${pkgId}`,
        `Icon=${iconSystemPath}`,
        'Terminal=false',
        `Categories=${cats}`,
        `StartupWMClass=${appId}`,
        'StartupNotify=true',
        `X-RenWeb-PackageId=${pkgId}`,
        `X-RenWeb-Seed=/usr/share/${pkgId}`,
    ];
    if (website) desktopLines.push(`URL=${website}`);
    desktopLines.push('');
    fs.writeFileSync(path.join(appsDir, `${appId}.desktop`), desktopLines.join('\n'), 'utf8');
}

/** Build packaging outputs (tar.gz, zip, native packages) for one (os, arch) target. */
function buildPackageForTarget(opts, buildSrc, pluginDirs, engineAsset, info, pkgDir, tmpDir, homebrewBottles) {
    const { os: targetOs, arch: targetArch } = engineAsset;
    const pkgId      = toKebab(info.title || 'app');
    const version    = (info.version || '0.0.1').trim();
    const stem       = `${pkgId}-${version}-${targetOs}-${targetArch}`;
    const outDir     = path.join(pkgDir, targetOs);
    const stagingDir = path.join(tmpDir, stem);

    ui.section(`Building ${stem}`);

    if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
    fs.mkdirSync(stagingDir, { recursive: true });

    ui.step('Copying build files…');
    copyDir(buildSrc, stagingDir);

    if (pluginDirs.length > 0) {
        ui.step(`Copying ${pluginDirs.length} plugin bundle(s)…`);
        const stagingPlugins = path.join(stagingDir, 'plugins');
        fs.mkdirSync(stagingPlugins, { recursive: true });
        for (const pDir of pluginDirs) copyDir(pDir, stagingPlugins);
    }

    const exeDest = path.join(stagingDir, engineAsset.filename);
    fs.copyFileSync(engineAsset.localPath, exeDest);
    makeExecutable(exeDest);

    // Patch Windows PE resources before archiving so all outputs include the patched binary.
    if (targetOs === 'windows' || targetOs === 'win') {
        const winExe = path.join(stagingDir, engineAsset.filename);
        if (fs.existsSync(winExe)) patchWindowsExe(winExe, info);
    }

    // Archive outputs
    fs.mkdirSync(outDir, { recursive: true });
    const wantTarGz = opts.exts.size === 0 || opts.exts.has('tar.gz');
    const wantZip   = opts.exts.size === 0 || opts.exts.has('zip');

    if (wantTarGz) {
        const dest = path.join(outDir, `${stem}.tar.gz`);
        ui.ok(`→ ${path.relative(process.cwd(), dest)}`);
           if (!makeTarGz(stagingDir, dest)) ui.warn(`tar failed for ${stem}`);
           else if (targetOs === 'linux') gpgSign(opts, dest);
    }
    if (wantZip) {
        const dest = path.join(outDir, `${stem}.zip`);
        ui.ok(`→ ${path.relative(process.cwd(), dest)}`);
           if (!makeZip(stagingDir, dest)) ui.warn(`zip failed for ${stem}`);
           else if (targetOs === 'linux') gpgSign(opts, dest);
    }

    if (targetOs === 'linux') {
        buildFpmPackages(opts, info, stagingDir, targetOs, targetArch, outDir, tmpDir, engineAsset.filename);
        buildXbpsPackage(opts, info, stagingDir, targetOs, targetArch, outDir, tmpDir, engineAsset.filename);
        buildAppImage(opts, info, stagingDir, targetArch, outDir, engineAsset.filename);
        buildSnapPackage(opts, info, stagingDir, targetArch, outDir, engineAsset.filename);
        buildFlatpakBundle(opts, info, stagingDir, targetArch, outDir, engineAsset.filename);
    }

    if (targetOs === 'windows' || targetOs === 'win') {
        const nsisOut = path.join(outDir, `${stem}-setup.exe`);
        buildNsisInstaller(opts, info, stagingDir, targetArch, nsisOut);
        buildMsiInstaller(opts, info, stagingDir, targetArch, path.join(outDir, `${stem}.msi`));
        const msixExeFile = engineAsset.filename;
        buildMsixPackage(opts, info, stagingDir, targetArch, path.join(outDir, `${stem}.msix`), msixExeFile);
        buildChocoPackage(opts, info, targetArch, nsisOut, outDir);
        buildNugetPackage(opts, info, targetArch, outDir, nsisOut);
        buildWingetManifest(opts, info, targetArch, nsisOut, outDir);
    }

    if (targetOs === 'macos' || targetOs === 'darwin') {
        const dmgOut = path.join(outDir, `${stem}.dmg`);
        buildMacDmg(opts, info, stagingDir, targetArch, dmgOut, engineAsset.filename);
        // macOS .pkg via pkgbuild (macOS-only)
        if (opts.exts.size === 0 || opts.exts.has('osxpkg') || opts.exts.has('pkg')) {
            if (!findBin('pkgbuild')) {
                ui.dim('[osxpkg] skipped — pkgbuild not available (macOS only)');
            } else {
                const exeFor   = engineAsset.filename;
                const pkgOut   = path.join(outDir, `${stem}.pkg`);
                const pkgTmp   = path.join(tmpDir, `${stem}-osxpkg`);
                if (fs.existsSync(pkgTmp)) fs.rmSync(pkgTmp, { recursive: true, force: true });
                fs.mkdirSync(pkgTmp, { recursive: true });
                const appBundle = buildMacAppBundle(stagingDir, exeFor, info, pkgTmp);
                const bundleId  = info.app_id || info.bundle_id
                    || ('com.' + toKebab(info.author || 'app').replace(/-/g, '.') + '.' + toKebab(info.title || 'app'));
                const pkgVersion = (info.version || '0.0.1').trim();

                // Build flat component pkg, then wrap with productbuild
                const componentPkg = pkgOut.replace(/\.pkg$/, '-component.pkg');
                const pkgR = spawnSync('pkgbuild', [
                    '--component',        appBundle,
                    '--install-location', '~/Applications',
                    '--identifier',       bundleId,
                    '--version',          pkgVersion,
                    componentPkg,
                ], { stdio: 'inherit' });

                if (pkgR.status === 0) {
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
                        ui.ok(`[osxpkg] \u2192 ${path.relative(process.cwd(), pkgOut)}`);
                        macosProductsign(opts, pkgOut, 'osxpkg');
                    } else {
                        ui.warn('productbuild (distribution) failed');
                    }
                } else {
                    try { fs.rmSync(pkgTmp, { recursive: true, force: true }); } catch (_) {}
                    ui.warn('pkgbuild failed');
                }
            }
        }
        // Homebrew formula — collect bottle info; formula written once after all archs
        generateHomebrewFormula(opts, info, targetArch, outDir, stagingDir, engineAsset.filename, homebrewBottles);
        // macOS App Store .pkg via productbuild (macOS-only; skipped in Docker/Linux)
        buildMacAppStorePackage(opts, info, stagingDir, targetArch, outDir, engineAsset.filename);
    }

    ui.ok(`${stem} done`);

    // Free the staging tree immediately to avoid accumulating gigabytes of
    // bundle libs across the many targets (would exhaust disk in Docker).
    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (_) {}
}

/** Post-process a FreeBSD .txz to inject deps into +MANIFEST (fpm silently omits them, open bug since 2016). */
function injectFreebsdDeps(txzPath, depNames) {
    if (!depNames || depNames.length === 0 || !fs.existsSync(txzPath)) return;
    const depsObj = {};
    for (const name of depNames) {
        depsObj[name] = FREEBSD_PKG_ORIGINS[name] || { origin: `misc/${name}`, version: '0' };
    }
    const tmpDir = path.join(os.tmpdir(), `_renweb-fbsd-${process.pid}`);
    try {
        fs.mkdirSync(tmpDir, { recursive: true });
        const ex = spawnSync('tar', ['-xJf', txzPath, '-C', tmpDir], { stdio: 'inherit' });
        if (ex.status !== 0) { ui.warn('FreeBSD dep-inject: extract failed'); return; }
        for (const fname of ['+MANIFEST', '+COMPACT_MANIFEST']) {
            const fpath = path.join(tmpDir, fname);
            if (!fs.existsSync(fpath)) continue;
            const data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
            data.deps = depsObj;
            fs.writeFileSync(fpath, JSON.stringify(data, null, 2) + '\n');
        }
        fs.unlinkSync(txzPath);
        const re = spawnSync('tar', ['-Jcf', txzPath, '-C', tmpDir, '.'], { stdio: 'inherit' });
        if (re.status === 0) ui.ok('FreeBSD deps injected into +MANIFEST');
        else ui.warn('FreeBSD dep-inject: re-archive failed');
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    }
}

/** Build Linux native packages (deb, rpm, pacman, apk, freebsd) via fpm/nfpm. */
function buildFpmPackages(opts, info, stagingDir, targetOs, targetArch, outDir, tmpDir, exeFilename = '') {
    const pkgId   = toKebab(info.title || 'app');
    const version = (info.version || '0.0.1').trim();
    const desc    = info.description || '';
    const license = info.license     || 'BSL-1.0';
    const website = info.repository  || '';

    const formats = FPM_FORMATS.filter(fmt => opts.exts.size === 0 || opts.exts.has(fmt));
    if (formats.length === 0) return;

    const fpmCheck = spawnSync('fpm', ['--version'], { encoding: 'utf8' });
    if (fpmCheck.status !== 0) {
        ui.warn('fpm not found — skipping native Linux packages');
        return;
    }

    const fpmRoot = path.join(tmpDir, 'fpm-staging', `${pkgId}-${version}-${targetOs}-${targetArch}`);
    if (fs.existsSync(fpmRoot)) fs.rmSync(fpmRoot, { recursive: true, force: true });
    buildSystemLayoutStaging(stagingDir, pkgId, version, exeFilename, info, fpmRoot);

    for (const fmt of formats) {
        const stem       = `${pkgId}-${version}-${targetOs}-${targetArch}`;
        const outputFile = path.join(outDir, `${stem}${FPM_EXT[fmt]}`);
        // Some fpm backends delete/rename the source dir after packaging; give each format its own copy.
        const fmtRoot = fpmRoot + '-' + fmt;
        if (fs.existsSync(fmtRoot)) fs.rmSync(fmtRoot, { recursive: true, force: true });
        copyDir(fpmRoot, fmtRoot);

        // APK is handled exclusively by nfpm.
        if (fmt === 'apk') {
            const { postInstall, postRemove } = makeLinuxPostScripts(pkgId, os.tmpdir(), `${pkgId}-apk`);
            ui.ok(`[nfpm apk] → ${path.relative(process.cwd(), outputFile)}`);
            try { fs.unlinkSync(outputFile); } catch (_) {}
            const r = runNfpmApk({ pkgId, version, targetArch, desc, website, license,
                                   fmtRoot, outputFile,
                                   postInstallScript: postInstall, postRemoveScript: postRemove });
            try { fs.unlinkSync(postInstall); } catch (_) {}
            try { fs.unlinkSync(postRemove); } catch (_) {}
            try { fs.rmSync(fmtRoot, { recursive: true, force: true }); } catch (_) {}
            if (r.status !== 0) ui.warn('nfpm failed for format: apk');
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
        // Dep names differ per format; LINUX_DEPS provides the correct name for each.
        const fmtDeps = LINUX_DEPS[fmt] || { required: [], recommended: [] };
        for (const dep of fmtDeps.required) fpmArgs.push('--depends', dep);
        if (fmt === 'deb') {
            for (const dep of fmtDeps.recommended) fpmArgs.push('--deb-recommends', dep);
        }
        const { postInstall, postRemove } = makeLinuxPostScripts(pkgId, os.tmpdir(), `${pkgId}-${fmt}`);
        fpmArgs.push('--after-install', postInstall, '--after-remove', postRemove, '.');

        ui.ok(`[fpm ${fmt}] → ${path.relative(process.cwd(), outputFile)}`);
        try { fs.unlinkSync(outputFile); } catch (_) {}
        const r = spawnSync('fpm', fpmArgs, { stdio: 'inherit' });
        try { fs.unlinkSync(postInstall); } catch (_) {}
        try { fs.unlinkSync(postRemove); } catch (_) {}
        try { fs.rmSync(fmtRoot, { recursive: true, force: true }); } catch (_) {}
        if (r.status !== 0) {
            ui.warn(`fpm failed for format: ${fmt}`);
        } else if (fmt === 'freebsd') {
            // fpm's FreeBSD backend silently omits deps (jordansissel/fpm#1156); post-process to inject them.
            injectFreebsdDeps(outputFile, LINUX_DEPS.freebsd.required);
        }
    }

    try { fs.rmSync(fpmRoot, { recursive: true, force: true }); } catch (_) {}
}

/** Recursively walk a staging directory and return nfpm YAML content entries. */
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

/** Build an Alpine APK using nfpm (correct 3-stream APKv2 format; fpm 1.17 produces a broken APK). Returns spawnSync-compatible { status }. */
function runNfpmApk({ pkgId, version, targetArch, desc, website, license,
                      fmtRoot, outputFile, postInstallScript, postRemoveScript }) {
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
        `depends:`,
        ...LINUX_DEPS.apk.required.map(d => `  - ${d}`),
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

/** Patch version info and icon into a Windows .exe via rcedit/wine64. No-op if rcedit or wine64 is absent. */
function patchWindowsExe(exePath, info) {
    // Accept wine64 or wine64-stable (Debian bullseye installs the latter).
    const wineBin  = findBin('wine64', 'wine64-stable');
    const rceditOk = fs.existsSync(RCEDIT_EXE);
    if (!wineBin || !rceditOk) {
        ui.dim('(rcedit/wine64 not available — skipping PE version patch)');
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
        ui.info(`Using icon: ${path.relative(process.cwd(), iconPath)}`);
    } else {
        ui.warn('No .ico found — executable icon will not be changed');
    }

    // Wine refuses to use a prefix owned by another user; copy to a user-owned tmpdir when Docker runs as --user.
    ui.step('Patching Windows PE resources (rcedit via wine64)…');
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
            ui.step('Copying Wine prefix to user-owned tmpdir…');
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
    if (r.status !== 0) ui.warn('rcedit returned non-zero — PE patch may have failed');
    else ui.ok('PE resources patched: ProductName, FileDescription, CompanyName, version ' + winVer);
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

/** Sign a file with Authenticode via osslsigncode. Uses credentials/windows.authenticode.pfx and .pass (or RENWEB_WIN_PFX_PASS). */
function authenticodeSign(opts, filePath) {
    if (!opts.credDir) return false;
    const pfx = path.join(opts.credDir, 'windows.authenticode.pfx');
    if (!fs.existsSync(pfx)) {
        ui.warn(`Authenticode: windows.authenticode.pfx not found \u2014 ${path.basename(filePath)} will be unsigned`);
        return false;
    }
    if (!findBin('osslsigncode')) {
        ui.warn('osslsigncode not found \u2014 skipping Authenticode signing');
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
        ui.ok(`Authenticode-signed: ${path.basename(filePath)}`);
        return true;
    }
    try { fs.unlinkSync(tmp); } catch (_) {}
    ui.warn(`osslsigncode failed \u2014 ${path.basename(filePath)} unsigned`);
    return false;
}

/** Sign a macOS artifact (DMG/.app) via codesign. Uses credentials/macos.developer-id-app.p12 and .pass (or RENWEB_MACOS_CERTS_PASS). macOS only. */
function macosCodesign(opts, filePath) {
    if (!opts.credDir || process.platform !== 'darwin') return false;
    const p12 = path.join(opts.credDir, 'macos.developer-id-app.p12');
    if (!fs.existsSync(p12)) {
        ui.warn(`macOS codesign: macos.developer-id-app.p12 not found \u2014 ${path.basename(filePath)} will be unsigned`);
        return false;
    }
    const pass = readPass(opts.credDir, 'macos.certs', 'RENWEB_MACOS_CERTS_PASS') || '';
    const kc = path.join(os.tmpdir(), '_renweb-sign-' + process.pid + '.keychain-db');
    const kcPass = '_renweb_tmp';
    try {
        spawnSync('security', ['create-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        spawnSync('security', ['unlock-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        const imp = spawnSync('security', ['import', p12, '-k', kc, '-P', pass, '-T', '/usr/bin/codesign', '-A'], { stdio: 'pipe' });
        if (imp.status !== 0) { ui.warn('Failed to import macOS signing cert'); return false; }
        const listR = spawnSync('security', ['find-identity', '-v', '-p', 'codesigning', kc], { encoding: 'utf8' });
        const match = (listR.stdout || '').match(/"(Developer ID Application[^"]+)"/);
        const identity = match ? match[1] : '-';
        const r = spawnSync('codesign', ['--deep', '--force', '--sign', identity, '--keychain', kc, filePath], { stdio: 'inherit' });
        if (r.status === 0) { ui.ok(`codesigned: ${path.basename(filePath)}`); return true; }
        ui.warn(`codesign failed \u2014 ${path.basename(filePath)} unsigned`);
        return false;
    } finally {
        try { spawnSync('security', ['delete-keychain', kc], { stdio: 'pipe' }); } catch (_) {}
    }
}

/** Sign a macOS .pkg via productsign. certType 'osxpkg' → developer-id-installer.p12; 'mas' → app-distribution.p12. macOS only. */
function macosProductsign(opts, filePath, certType) {
    if (!opts.credDir || process.platform !== 'darwin') return false;
    const p12Name = certType === 'mas' ? 'macos.app-distribution.p12' : 'macos.developer-id-installer.p12';
    const p12 = path.join(opts.credDir, p12Name);
    if (!fs.existsSync(p12)) {
        ui.warn(`macOS productsign: ${p12Name} not found \u2014 ${path.basename(filePath)} will be unsigned`);
        return false;
    }
    const pass = readPass(opts.credDir, 'macos.certs', 'RENWEB_MACOS_CERTS_PASS') || '';
    const kc = path.join(os.tmpdir(), '_renweb-sign-' + process.pid + '.keychain-db');
    const kcPass = '_renweb_tmp';
    try {
        spawnSync('security', ['create-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        spawnSync('security', ['unlock-keychain', '-p', kcPass, kc], { stdio: 'pipe' });
        const imp = spawnSync('security', ['import', p12, '-k', kc, '-P', pass, '-T', '/usr/bin/productsign', '-A'], { stdio: 'pipe' });
        if (imp.status !== 0) { ui.warn('Failed to import macOS signing cert'); return false; }
        const searchStr = certType === 'mas' ? 'Mac App Distribution' : 'Developer ID Installer';
        const listR = spawnSync('security', ['find-identity', '-v', kc], { encoding: 'utf8' });
        const match = (listR.stdout || '').match(new RegExp('"(' + searchStr + '[^"]+)"'));
        if (!match) { ui.warn(`${searchStr} identity not found in cert`); return false; }
        const signed = filePath.replace(/\.pkg$/, '._signtmp.pkg');
        const r = spawnSync('productsign', ['--sign', match[1], '--keychain', kc, filePath, signed], { stdio: 'inherit' });
        if (r.status === 0) {
            fs.renameSync(signed, filePath);
            ui.ok(`productsigned (${certType}): ${path.basename(filePath)}`);
            return true;
        }
        try { fs.unlinkSync(signed); } catch (_) {}
        ui.warn('productsign failed');
        return false;
    } finally {
        try { spawnSync('security', ['delete-keychain', kc], { stdio: 'pipe' }); } catch (_) {}
    }
}

/** Create a GPG detached .asc signature. Uses credentials/linux.gpg.asc and .pass (or RENWEB_GPG_PASS). Key is imported into a temp GNUPGHOME. */
function gpgSign(opts, filePath) {
    if (!opts.credDir) return false;
    const keyFile = path.join(opts.credDir, 'linux.gpg.asc');
    if (!fs.existsSync(keyFile)) {
        ui.warn(`GPG: linux.gpg.asc not found \u2014 ${path.basename(filePath)} will not be signed`);
        return false;
    }
    if (!findBin('gpg')) { ui.warn('gpg not found \u2014 skipping GPG signing'); return false; }
    const pass = readPass(opts.credDir, 'linux.gpg', 'RENWEB_GPG_PASS') || '';
    const tmpGnupg = path.join(os.tmpdir(), '_renweb-gpg-' + process.pid);
    fs.mkdirSync(tmpGnupg, { recursive: true, mode: 0o700 });
    try {
        const env = { ...process.env, GNUPGHOME: tmpGnupg };
        const imp = spawnSync('gpg', ['--batch', '--import', keyFile], { env, stdio: 'pipe' });
        if (imp.status !== 0) { ui.warn('GPG key import failed'); return false; }
        const listR = spawnSync('gpg', ['--batch', '--list-secret-keys', '--with-colons'], { env, encoding: 'utf8' });
        const fpLine = (listR.stdout || '').split('\n').find(l => l.startsWith('fpr'));
        const fingerprint = fpLine ? fpLine.split(':')[9] : null;
        const sigArgs = ['--batch', '--yes', '--armor', '--detach-sign',
                         '--passphrase-fd', '0', '--pinentry-mode', 'loopback'];
        if (fingerprint) sigArgs.push('-u', fingerprint);
        sigArgs.push(filePath);
        const r = spawnSync('gpg', sigArgs, { env, input: pass + '\n', stdio: ['pipe', 'inherit', 'inherit'] });
        if (r.status === 0) { ui.ok(`GPG signed: ${path.basename(filePath)}.asc`); return true; }
        ui.warn('GPG detach-sign failed');
        return false;
    } finally {
        try { fs.rmSync(tmpGnupg, { recursive: true, force: true }); } catch (_) {}
    }
}

function xbpsSign(opts, filePath) {
    if (!opts.credDir) return;
    const keyPath = path.join(opts.credDir, 'linux.xbps.pem');
    if (!fs.existsSync(keyPath)) {
        ui.warn(`XBPS signing: linux.xbps.pem not found — ${path.basename(filePath)} will not be signed`);
        return;
    }
    if (!findBin('xbps-rindex')) { ui.warn('xbps-rindex not found — skipping XBPS signing'); return; }
    const r = spawnSync('xbps-rindex', ['--sign-pkg', '--privkey', keyPath, filePath], { stdio: 'inherit' });
    if (r.status === 0) ui.ok(`XBPS signed: ${path.basename(filePath)}`);
    else ui.warn('xbps-rindex --sign-pkg failed');
}

// ─── Windows package builders ─────────────────────────────────────────────────

/**
 * Build a .nsi NSIS installer via makensis. String concatenation is used for NSIS lines to avoid
 * ambiguity between JS template-literal ${} and NSIS $VAR syntax.
 */
function buildNsisInstaller(opts, info, stagingDir, arch, outPath) {
    if (opts.exts.size > 0 && !opts.exts.has('exe') && !opts.exts.has('choco') && !opts.exts.has('nuget') && !opts.exts.has('winget')) return;

    if (spawnSync('which', ['makensis'], { encoding: 'utf8' }).status !== 0) {
        ui.warn('makensis not found — skipping NSIS installer'); return;
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
    if (!bootstrapperPath) {
        const cacheBootstrapper = path.join(os.tmpdir(), `_renweb-${bootstrapperName}`);
        if (!fs.existsSync(cacheBootstrapper)) {
            if (!download(WEBVIEW2_BOOTSTRAPPER_URL, cacheBootstrapper)) {
                ui.warn('Failed to fetch WebView2 bootstrapper; installer will not auto-install WebView2.');
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
    ui.ok('[nsis] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync('makensis', [nsiPath], { stdio: 'inherit' });
    if (r.status !== 0) ui.warn('makensis failed');
        else authenticodeSign(opts, outPath);
    try { fs.unlinkSync(nsiPath); } catch (_) {}
    if (nsisBgBmp) { try { fs.unlinkSync(nsisBgBmp); } catch (_) {} }
}

/** Build a .msi installer via wixl (msitools). No Wine needed. */
function buildMsiInstaller(opts, info, stagingDir, arch, outPath) {
    if (opts.exts.size > 0 && !opts.exts.has('msi')) return;
    if (!findBin('wixl')) {
        ui.warn('wixl not found \u2014 skipping MSI'); return;
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

    // wixl-heat v0.101 produces empty ComponentGroup output and lacks Directory attr on <Component>;
    // generate the WXS fragment manually instead.
    function xmlEscape(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    let idCounter   = 0;
    const compIds   = [];  // collected component IDs for ComponentGroup

    function buildDirBody(dirPath, indent) {
        const lines   = [];
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
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
        // wixl ignores WixUI_Minimal's UIRef; surface the license via ARPREADME instead.
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
        // WebView2 prerequisite: require runtime on install.
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
        '  </Product>',
        '</Wix>',
        '',
    ].filter(l => l !== '').join('\n');
    fs.writeFileSync(productWxs, wxsContent, 'utf8');

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    ui.ok('[msi] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync('wixl', ['-o', outPath, productWxs, filesWxs], { stdio: 'inherit' });
    if (r.status !== 0) ui.warn('wixl failed');
        else authenticodeSign(opts, outPath);
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/** Build an MSIX package via makemsix. Output is unsigned — sign before Store submission or install with Add-AppxPackage -AllowUnsigned. */
function buildMsixPackage(opts, info, stagingDir, arch, outPath, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('msix')) return;

    const makemsix = fs.existsSync('/opt/makemsix') ? '/opt/makemsix'
                   : (spawnSync('which', ['makemsix'], { encoding: 'utf8' }).stdout || '').trim();
    if (!makemsix) { ui.warn('makemsix not found \u2014 skipping MSIX'); return; }

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

    // cp -r avoids ENOENT from NTFS↔Linux volume caching inconsistencies on Docker mounts.
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

    const msixIgnorableNamespaces = 'rescap win32dependencies';
    const msixExternalDeps = [
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
    ui.ok('[msix] \u2192 ' + path.relative(process.cwd(), outPath));
    const r = spawnSync(makemsix, ['pack', '-d', tmpBase, '-p', outPath], { stdio: 'inherit' });
    if (r.status !== 0) ui.warn('makemsix failed');
        else if (!authenticodeSign(opts, outPath))
            ui.info('MSIX is unsigned \u2014 sign with signtool before Store submission, or install with Add-AppxPackage -AllowUnsigned');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/** Build a Chocolatey .nupkg embedding the NSIS setup EXE and PowerShell install/uninstall scripts. */
function buildChocoPackage(opts, info, arch, nsisExePath, outDir) {
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
        ui.warn('Chocolatey skipped — NSIS setup exe is missing (build with exe/choco formats together).');
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
    ui.ok('[choco] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('zip', ['-r', outFile, '.'], { cwd: tmpBase, stdio: 'inherit' });
    if (r.status !== 0) ui.warn('Chocolatey nupkg failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/** Build a NuGet .nupkg with package metadata and optionally the NSIS setup.exe under tools/. */
function buildNugetPackage(opts, info, arch, outDir, nsisExePath = '') {
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
        ui.warn('NuGet package is metadata-only because NSIS setup exe was not found.');
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
    ui.ok('[nuget] \u2192 ' + path.relative(process.cwd(), outFile));
    const r = spawnSync('zip', ['-r', outFile, '.'], { cwd: tmpBase, stdio: 'inherit' });
    if (r.status !== 0) ui.warn('NuGet nupkg failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/** Generate winget YAML manifests for microsoft/winget-pkgs submission. Publishing requires pushing to the winget-pkgs repo. */
function buildWingetManifest(opts, info, arch, nsisExePath, outDir) {
    if (opts.exts.size > 0 && !opts.exts.has('winget')) return;
    if (!nsisExePath || !fs.existsSync(nsisExePath)) {
        ui.warn('winget manifest skipped — NSIS setup exe is missing.');
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
    ui.ok('[winget] → ' + path.relative(process.cwd(), manifestRoot));
    if (!process.env.RENWEB_WINGET_INSTALLER_URL && !autoUrl) {
        ui.info('Set RENWEB_WINGET_INSTALLER_URL to your public setup.exe URL before submitting to winget.');
    }
}

// ─── macOS packaging ──────────────────────────────────────────────────────────

/**
 * Build a macOS .app bundle. Launcher in Contents/MacOS/ bootstraps
 * ~/Library/Application Support/<AppName>/ from Contents/Resources/data/ on first launch,
 * then execs the real binary there (matching Locate::currentDirectory() = executable().parent_path()).
 * Returns the absolute path to the created .app bundle.
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

/** Build a macOS DMG via create-dmg/hdiutil on macOS, or xorrisofs/genisoimage on Linux/Docker (ISO-9660, not true HFS+). */
function buildMacDmg(opts, info, stagingDir, arch, outPath, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('dmg')) return;

    const title  = info.title || 'App';
    const exeFor = exeFilename;

    // tmpBase holds only <Title>.app/ so hdiutil/-srcfolder sees a clean folder
    const tmpBase = path.join(path.dirname(outPath), `_dmg-${arch}`);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });
    buildMacAppBundle(stagingDir, exeFor, info, tmpBase);

    ui.ok(`[dmg] \u2192 ${path.relative(process.cwd(), outPath)}`);

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
        ui.warn('create-dmg failed — falling back to hdiutil');
    } else {
        ui.warn('create-dmg not found; install via `brew install create-dmg` for the classic drag-to-install DMG look. Falling back to plain hdiutil.');
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
            ui.warn('DMG creation failed (hdiutil UDRW)');
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

        if (conv.status !== 0) ui.warn('DMG conversion to UDZO failed');
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
        ui.warn('hdiutil/xorrisofs/genisoimage not found — skipping DMG');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }
    // Note: '-apple' HFS extensions are not supported by xorriso on Linux.
    const r = spawnSync(isoCmd,
        ['-V', title.slice(0, 32), '-D', '-R', '-o', outPath, tmpBase],
        { stdio: 'inherit' });
    if (r.status !== 0) ui.warn('DMG creation failed');
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

/** Build a Homebrew bottle (.tar.gz in Cellar layout) and accumulate metadata into homebrewBottles. Call writeHomebrewFormula() once after all arches. */
function generateHomebrewFormula(opts, info, arch, outDir, stagingDir, exeFilename = '', homebrewBottles = null) {
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
    const binTarget = exeFilename;
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

    fs.mkdirSync(outDir, { recursive: true });
    const bottleName = pkgId + '--' + version + '.' + bottleTag + '.bottle.tar.gz';
    const bottlePath = path.join(outDir, bottleName);
    try { fs.unlinkSync(bottlePath); } catch (_) {}
    // tar from inside tmpBase so archive root is "<pkgId>/<version>/..."
    const tarR = spawnSync('tar', ['-czf', bottlePath, pkgId], { cwd: tmpBase, stdio: 'inherit' });
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
    if (tarR.status !== 0) {
        ui.warn('homebrew bottle tar failed');
        return;
    }
    ui.ok('[homebrew bottle] \u2192 ' + path.relative(process.cwd(), bottlePath));

    const sha256 = require('crypto')
        .createHash('sha256')
        .update(fs.readFileSync(bottlePath))
        .digest('hex');

    if (homebrewBottles) {
        homebrewBottles.push({ bottleTag, bottleName, sha256, binTarget, outDir, pkgId, klass, version, desc, website, license });
    }
}

/** Write a unified Homebrew formula .rb for all collected bottle entries. Call once after all macOS arches. */
function writeHomebrewFormula(bottles) {
    if (!bottles || bottles.length === 0) return;

    const { outDir, pkgId, klass, version, desc, website, license } = bottles[0];

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
    ui.ok('[homebrew formula] \u2192 ' + path.relative(process.cwd(), formulaPath));
    fs.writeFileSync(formulaPath, rb.join('\n'), 'utf8');
}

/** Build a macOS App Store .pkg via productbuild (macOS only). Needs Mac App Distribution codesigning before submission. */
function buildMacAppStorePackage(opts, info, stagingDir, arch, outDir, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('mas')) return;

    if (!findBin('productbuild')) {
        ui.dim('[mas] skipped \u2014 productbuild not available (macOS only)');
        return;
    }

    const pkgId  = toKebab(info.title || 'app');
    const version = (info.version || '0.0.1').trim();
    const stem   = pkgId + '-' + version + '-macos-' + arch + '-mas';
    const exeFor = exeFilename;

    const tmpBase = path.join(os.tmpdir(), '_renweb-mas-' + pkgId + '-' + arch);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });

    const appBundle = buildMacAppBundle(stagingDir, exeFor, info, tmpBase);

    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, stem + '.pkg');
    ui.ok('[mas] \u2192 ' + path.relative(process.cwd(), outFile));

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
        else ui.warn('productbuild (mas distribution) failed');
    } else {
        ui.warn('pkgbuild (mas component) failed');
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

/** Build an AppImage via appimagetool. APPIMAGE_EXTRACT_AND_RUN=1 is used for FUSE-free builds in Docker. */
function buildAppImage(opts, info, stagingDir, arch, outDir, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('AppImage') && !opts.exts.has('appimage')) return;

    const archFlag = APPIMAGE_ARCH_MAP[arch];
    if (!archFlag) {
        ui.dim(`[AppImage] skipped — ${arch} is not a supported AppImage architecture`);
        return;
    }

    if (!fs.existsSync(APPIMAGETOOL)) {
        ui.warn(APPIMAGETOOL + ' not found — skipping AppImage'); return;
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
    const appTarget  = exeFilename;
    const appRunPath = path.join(appDir, 'AppRun');
    fs.writeFileSync(appRunPath, [
        '#!/bin/sh',
        'APPDIR="$(dirname "$(readlink -f "$0")")"',
        '',
        '# Always install to the user data directory so the engine has a stable,',
        '# writable home and FS.getApplicationDirPath() reports the correct path.',
        '# A version stamp triggers a refresh on upgrade.',
        'DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/' + pkgId + '"',
        'STAMP="$DATA_DIR/.renweb-version"',
        'if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "' + version + '" ]; then',
        '    printf "%s: installing to %s\\n" "' + pkgId + '" "$DATA_DIR"',
        '    rm -rf "$DATA_DIR" && mkdir -p "$DATA_DIR" || { printf "error: %s: cannot create %s\\n" "' + pkgId + '" "$DATA_DIR" >&2; exit 1; }',
        '    cp -a "$APPDIR/opt/' + pkgId + '/." "$DATA_DIR/" || { printf "error: %s: copy failed\\n" "' + pkgId + '" >&2; exit 1; }',
        '    printf "%s" "' + version + '" > "$STAMP"',
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
    const appIcon = findAppIcon(stagingDir);
    if (appIcon && (appIcon.ext === 'png' || appIcon.ext === 'svg')) {
        fs.copyFileSync(appIcon.src, path.join(appDir, pkgId + '.' + appIcon.ext));
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

    ui.ok('[AppImage] \u2192 ' + path.relative(process.cwd(), outFile));
    const appimageArgs = [appDir, outFile];
    const runtimeFile = path.join(APPIMAGE_RUNTIME_DIR, APPIMAGE_RUNTIME_FOR_ARCH[archFlag] || '');
    if (APPIMAGE_RUNTIME_FOR_ARCH[archFlag] && fs.existsSync(runtimeFile)) {
        appimageArgs.unshift('--runtime-file', runtimeFile);
    } else {
        ui.warn('No runtime file for ' + archFlag + ' — AppImage may not run on target arch');
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
        ui.warn('appimagetool failed');
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
                ui.warn(`AppImage runtime arch mismatch: embedded=${archName}, expected=${wantMachineName}`);
                ui.warn('This AppImage will fail with "Exec format error" on the target.');
                ui.warn('Rebuild the Docker image so the per-arch runtime stubs are present.');
            } else {
                ui.ok(`AppImage runtime arch verified: ${archName}`);
            }
        } catch (_) {}
    }
    try { fs.rmSync(appDir, { recursive: true, force: true }); } catch (_) {}
}

/** Build a .snap (squashfs archive) via mksquashfs. Output named per Snap Store convention: <name>_<version>_<arch>.snap. */
function buildSnapPackage(opts, info, stagingDir, arch, outDir, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('snap')) return;
    if (spawnSync('which', ['mksquashfs'], { encoding: 'utf8' }).status !== 0) {
        ui.warn('mksquashfs not found \u2014 skipping snap'); return;
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

    // $SNAP is read-only; the launcher copies to $SNAP_USER_DATA once per version so the engine can write log.txt.
    const confinement = 'classic';
    const appTarget   = exeFilename;
    const wrapperName = 'snap-launch.sh';
    const wrapperPath = path.join(appShare, wrapperName);

    const wrapperLines = [
        '#!/bin/sh',
        '# $SNAP         — read-only squashfs mount',
        '# $SNAP_USER_DATA — writable, per-user, per-version ($HOME/snap/<name>/current)',
        'SRC="$SNAP/opt/' + pkgId + '"',
        'DEST="${SNAP_USER_DATA:-$HOME/.local/share/' + pkgId + '}"',
        'STAMP="$DEST/.renweb-version"',
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
    wrapperLines.push(
        '# Prefer Wayland; fall back to X11 if Wayland is unavailable.',
        '[ -z "$GDK_BACKEND" ] && export GDK_BACKEND=wayland,x11',
        '',
    );
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

    // Plugs only apply to strict confinement; classic has full host access.
    yamlLines.push('');

    fs.writeFileSync(path.join(metaDir, 'snap.yaml'),
        yamlLines.filter(l => l !== null).join('\n'), 'utf8');

    // meta/gui/<name>.desktop: snapd registers it so the app appears in system search.
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
    const snapIcon = findAppIcon(stagingDir);
    if (snapIcon && (snapIcon.ext === 'png' || snapIcon.ext === 'svg')) {
        fs.copyFileSync(snapIcon.src, path.join(guiDir, pkgId + '.' + snapIcon.ext));
    }

    const outFile = path.join(outDir, pkgId + '_' + version + '_' + snapArch + '.snap');
    fs.mkdirSync(outDir, { recursive: true });
    ui.ok('[snap] \u2192 ' + path.relative(process.cwd(), outFile));
    try { fs.unlinkSync(outFile); } catch (_) {}
    const r = spawnSync('mksquashfs', [
        tmpBase, outFile,
        '-noappend', '-comp', 'xz', '-no-progress',
    ], { stdio: 'inherit' });
    if (r.status !== 0) ui.warn('snap build failed');
    else ui.info('To install: sudo snap install --dangerous --classic ' + path.relative(process.cwd(), outFile));
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/** Build a .flatpak bundle via flatpak build-init/finish/export/bundle. Uses org.gnome.Platform//47 (WebKitGTK 2.44+). No bwrap needed in Docker. */
function buildFlatpakBundle(opts, info, stagingDir, arch, outDir, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('flatpak')) return;
    if (spawnSync('which', ['flatpak'], { encoding: 'utf8' }).status !== 0) {
        ui.warn('flatpak not found \u2014 skipping flatpak'); return;
    }

    const pkgId   = toKebab(info.title || 'app');
    const appId   = info.app_id  || pkgId;
    const version = (info.version || '0.0.1').trim();

    const tmpBase  = path.join(os.tmpdir(), '_renweb-flatpak-' + pkgId + '-' + arch);
    const buildDir = path.join(tmpBase, 'build');
    const repoDir  = path.join(tmpBase, 'repo');
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true, force: true });
    fs.mkdirSync(tmpBase, { recursive: true });

    const initR = spawnSync('flatpak', [
        'build-init', buildDir, appId,
        'org.gnome.Sdk//47', 'org.gnome.Platform//47',
    ], { stdio: 'inherit' });
    if (initR.status !== 0) {
        ui.warn('flatpak build-init failed');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    const appFiles = path.join(buildDir, 'files', 'opt', pkgId);
    const binDir   = path.join(buildDir, 'files', 'bin');
    fs.mkdirSync(appFiles, { recursive: true });
    fs.mkdirSync(binDir,   { recursive: true });
    copyDir(stagingDir, appFiles);
    try { fs.chmodSync(path.join(appFiles, exeFilename), 0o755); } catch (_) {}
    // Launcher: copies app to $XDG_DATA_HOME (~/.var/app/<appId>/data/) once per version for engine write access.
    const wrapperSh = [
        '#!/bin/sh',
        'SRC="/app/opt/' + pkgId + '"',
        'DEST="${XDG_DATA_HOME:-$HOME/.local/share}/' + pkgId + '"',
        'STAMP="$DEST/.renweb-version"',
        '# Copy app tree once per version into writable XDG_DATA_HOME.',
        'if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP" 2>/dev/null)" != "' + version + '" ]; then',
        '    rm -rf "$DEST" && mkdir -p "$DEST"',
        '    cp -a "$SRC/." "$DEST/" || { echo "flatpak: copy failed" >&2; exit 1; }',
        '    echo "' + version + '" > "$STAMP"',
        'fi',
        '# Prefer Wayland; fall back to X11 if Wayland is unavailable.',
        '[ -z "$GDK_BACKEND" ] && export GDK_BACKEND=wayland,x11',
        'exec "$DEST/' + exeFilename + '" "$@"',
        '',
    ].join('\n');
    const binWrapper = path.join(binDir, pkgId);
    fs.writeFileSync(binWrapper, wrapperSh, 'utf8');
    makeExecutable(binWrapper);

    const outFile = path.join(outDir, pkgId + '-' + version + '-' + arch + '.flatpak');
    fs.mkdirSync(outDir, { recursive: true });
    ui.ok('[flatpak] \u2192 ' + path.relative(process.cwd(), outFile));

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
        ui.warn('flatpak build-finish failed');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    const exportR = spawnSync('flatpak', [
        'build-export', repoDir, buildDir,
    ], { stdio: 'inherit' });
    if (exportR.status !== 0) {
        ui.warn('flatpak build-export failed');
        try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    const bundleR = spawnSync('flatpak', [
        'build-bundle',
        '--runtime-repo=https://dl.flathub.org/repo/flathub.flatpakrepo',
        repoDir, outFile, appId,
    ], { stdio: 'inherit' });
    if (bundleR.status !== 0) ui.warn('flatpak build-bundle failed');
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch (_) {}
}

/** Build a Void Linux XBPS package via xbps-create. Optionally signed. Output renamed from xbps-create's <pkgver>.<arch>.xbps convention. */
function buildXbpsPackage(opts, info, stagingDir, targetOs, targetArch, outDir, tmpDir, exeFilename = '') {
    if (opts.exts.size > 0 && !opts.exts.has('xbps')) return;
    if (!findBin('xbps-create')) {
        ui.warn('xbps-create not found \u2014 skipping Void Linux package');
        return;
    }

    const pkgId    = toKebab(info.title || 'app');
    const version  = (info.version || '0.0.1').trim();
    // XBPS pkgver format: <pkgname>-<version>_<revision>
    const pkgver   = `${pkgId}-${version}_1`;
    const desc     = (info.description || info.title || pkgId).replace(/\n/g, ' ').slice(0, 79);
    const license  = info.license    || 'BSL-1.0';
    const website  = info.repository || '';
    const author   = info.author    || '';
    const xbpsArch = XBPS_ARCH_MAP[targetArch] || targetArch;
    const stem     = `${pkgId}-${version}-${targetOs}-${targetArch}`;
    const outputFile = path.join(outDir, `${pkgver}.${xbpsArch}.xbps`);

    const xbpsRoot   = path.join(tmpDir, 'xbps-staging', stem);
    const xbpsOutDir = path.join(tmpDir, 'xbps-out', stem);
    if (fs.existsSync(xbpsRoot)) fs.rmSync(xbpsRoot, { recursive: true, force: true });
    fs.mkdirSync(xbpsRoot,   { recursive: true });
    fs.mkdirSync(xbpsOutDir, { recursive: true });

    // Populate system-layout staging tree (/opt, /usr/bin, /usr/share/…)
    buildSystemLayoutStaging(stagingDir, pkgId, version, exeFilename, info, xbpsRoot);

    // XBPS INSTALL script: $1 = post-install|post-update|pre-remove, $2 = pkgver.
    // pre-remove deletes /usr/share/<pkgId>/; user data in ~/.local/share/ is left in place.
    const installLines = [
        '#!/bin/sh',
        '# $1=post-install|post-update|pre-remove  $2=pkgver',
        'case "$1" in',
        '    post-install|post-update)',
        `        # Seed installed read-only into /usr/share/${pkgId}/.`,
        `        # User data bootstrapped to ~/.local/share/${pkgId}/ on first launch.`,
        '        ;;',
        '    pre-remove)',
        `        rm -rf /usr/share/${pkgId}/`,
        '        ;;',
        'esac',
        '',
    ].join('\n');
    const installPath = path.join(xbpsRoot, 'INSTALL');
    fs.writeFileSync(installPath, installLines, 'utf8');
    makeExecutable(installPath);

    const xbpsArgs = [
        '-A', xbpsArch,
        '-n', pkgver,
        '-s', desc,
        '--compression', 'zstd',
    ];
    if (website) xbpsArgs.push('-H', website);
    if (license) xbpsArgs.push('-l', license);
    if (author)  xbpsArgs.push('-m', author);
    if (LINUX_DEPS.void.required.length > 0)
        xbpsArgs.push('-D', LINUX_DEPS.void.required.join(' '));
    xbpsArgs.push(xbpsRoot);

    ui.ok(`[xbps] \u2192 ${path.relative(process.cwd(), outputFile)}`);
    try { fs.unlinkSync(outputFile); } catch (_) {}

    // xbps-create writes <pkgver>.<arch>.xbps in the current working directory.
    const r = spawnSync('xbps-create', xbpsArgs, { cwd: xbpsOutDir, stdio: 'inherit' });
    try { fs.rmSync(xbpsRoot, { recursive: true, force: true }); } catch (_) {}
    if (r.status !== 0) {
        ui.warn('xbps-create failed');
        try { fs.rmSync(xbpsOutDir, { recursive: true, force: true }); } catch (_) {}
        return;
    }

    fs.mkdirSync(outDir, { recursive: true });
    const xbpsCreated = path.join(xbpsOutDir, `${pkgver}.${xbpsArch}.xbps`);
    if (fs.existsSync(xbpsCreated)) {
        fs.copyFileSync(xbpsCreated, outputFile);
    } else {
        const found = fs.readdirSync(xbpsOutDir).find(f => f.endsWith('.xbps'));
        if (found) fs.copyFileSync(path.join(xbpsOutDir, found), outputFile);
        else ui.warn('xbps-create output not found');
    }
    try { fs.rmSync(xbpsOutDir, { recursive: true, force: true }); } catch (_) {}

    // Sign the .xbps package with the Void Linux private key (xbps-rindex) and GPG.
    xbpsSign(opts, outputFile);
    gpgSign(opts, outputFile);

    if (findBin('xbps-rindex') && fs.existsSync(outputFile)) {
        const ri = spawnSync('xbps-rindex', ['-a', outputFile], { stdio: 'inherit' });
        if (ri.status === 0) ui.ok(`[xbps] repodata updated: ${xbpsArch}-repodata`);
        else ui.warn('xbps-rindex -a failed \u2014 repository index not created');
    }
}


// ─── Main entry point ─────────────────────────────────────────────────────────

/** Register SIGINT/SIGTERM/SIGHUP handlers to kill all child processes on exit (fpm, wine, tar, zip, …). */
function setupSignalHandlers() {
    let exiting = false;
    const onSignal = (sig) => {
        if (exiting) return;
        exiting = true;
        process.stderr.write('\n  Interrupted — terminating child processes…\n');
        process.off('SIGINT',  onSignal);
        process.off('SIGTERM', onSignal);
        process.off('SIGHUP',  onSignal);
        // Send SIGTERM to the whole process group; wine may spawn sub-daemons that ignore SIGINT.
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
    // RENWEB_PROJECT_ROOT is set by dispatch() for Docker runs; mounts the host project root at /renweb-project.
    const buildDir = process.env.RENWEB_PROJECT_ROOT
        ? path.join(process.env.RENWEB_PROJECT_ROOT, 'build')
        : findBuildDir();
    if (!buildDir) { ui.error('Could not find a build/ directory.'); process.exit(1); }
    const infoPath = path.join(buildDir, 'info.json');
    if (!fs.existsSync(infoPath)) { ui.error(`${infoPath} not found.`); process.exit(1); }
    let info;
    try { info = JSON.parse(fs.readFileSync(infoPath, 'utf8')); }
    catch (e) { ui.error(`Failed to parse info.json — ${e.message}`); process.exit(1); }

    const engineRepo  = (info['engine-repository'] || info['engine_repository'] || info['executable_repository'] || DEFAULT_ENGINE_REPO).trim();
    const pluginRepos = Array.isArray(info['plugin-repositories'] ?? info['plugin_repositories'])
        ? (info['plugin-repositories'] ?? info['plugin_repositories'])
        : [];

    ui.section('RenWeb CLI — package');
    ui.info(`build dir : ${buildDir}`);
    ui.info(`engine    : ${engineRepo}`);
    ui.info(`plugins   : ${pluginRepos.length} repo(s)`);
    if (opts.exts.size > 0)   ui.info(`formats   : ${[...opts.exts].join(', ')}`);
    if (opts.oses.size > 0)   ui.info(`os filter : ${[...opts.oses].join(', ')}`);
    if (opts.arches.size > 0) ui.info(`arch filter: ${[...opts.arches].join(', ')}`);
    if (opts.cache)           ui.info('cache     : enabled (.rw/package/)');

        opts.credDir = opts.noCredentials ? null : findCredentialsDir();
        if (opts.noCredentials)       ui.info('signing   : disabled (--no-credentials)');
        else if (opts.credDir)        ui.info(`signing   : ${opts.credDir}`);
        else                          ui.info('signing   : credentials/ not found — outputs will be unsigned');
    if (process.platform === 'darwin')
        ui.dim('note      : macOS-only formats (dmg, pkg/osxpkg, app) are available on this host');
    if (process.env.IN_DOCKER !== '1')
        ui.info('Tip: run `rw build` first to ensure build/ is up to date before packaging.');

    // ── 2. Set up directories ─────────────────────────────────────────────────
    const projectRoot = path.resolve(buildDir, '..');
    const writableRoot = process.env.RENWEB_PROJECT_ROOT
        ? (process.env.RENWEB_CWD ? path.resolve(process.env.RENWEB_CWD) : process.cwd())
        : projectRoot;
    const cacheDir    = path.join(writableRoot, '.rw', 'package');   // all working files
    const tmpDir      = path.join(cacheDir, 'staging');              // staging (always wiped)
    const pkgDir      = path.join(writableRoot, 'package');
    const enginesDir  = path.join(cacheDir, 'engines');
    const pluginsDir  = path.join(cacheDir, 'plugins');
    const buildSrcDir = path.join(tmpDir, 'build-src');

    if (fs.existsSync(pkgDir)) {
        ui.step('Clearing previous package output…');
        fs.rmSync(pkgDir, { recursive: true, force: true });
    }
    fs.mkdirSync(pkgDir, { recursive: true });

    if (!opts.cache && fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(buildSrcDir, { recursive: true });
    fs.mkdirSync(enginesDir,  { recursive: true });
    fs.mkdirSync(pluginsDir,  { recursive: true });

    // ── 3. Fetch engine release metadata ─────────────────────────────────────
    ui.section('Fetching engine releases');
    let engineRelease;
    try { engineRelease = fetchLatestRelease(engineRepo); }
    catch (e) { ui.error(e.message); process.exit(1); }

    const engineGroups = groupAssets(engineRelease.assets);
    if (engineGroups.size === 0) {
        ui.error('No recognisable engine assets found in the latest release.');
        process.exit(1);
    }

    // ── 4. Download engines → .package/engines (with optional cache reuse) ────
    const toProcess = []; // flat list of asset descriptors to build packages for

    for (const [key, group] of engineGroups) {
        const targetOs   = key.split('-')[0];
        const targetArch = key.slice(targetOs.length + 1);
        if (opts.oses.size > 0 && !opts.oses.has(targetOs)) {
            ui.dim(`skip (os filter): ${key}`); continue;
        }
        if (opts.arches.size > 0 && !opts.arches.has(targetArch)) {
            ui.dim(`skip (arch filter): ${key}`); continue;
        }

        // Only bare executables are produced (bundle support has been removed)
        const picks = [];
        if (group.bare)
            picks.push({ ...group.bare, isBootstrap: false });
        if (picks.length === 0) {
            ui.info(`${key}: no bare executable found in release`);
        }

        for (const pick of picks) {
            const destPath = path.join(enginesDir, pick.filename);
            if (opts.cache && fs.existsSync(destPath)) {
                ui.info(`cached  ${pick.filename}`);
            } else {
                ui.step(`Downloading ${pick.filename}…`);
                if (!download(pick.url, destPath)) {
                    ui.warn(`Failed to download ${pick.filename}`); continue;
                }
            }
            makeExecutable(destPath);
            toProcess.push({ filename: pick.filename, localPath: destPath,
                             os: pick.os, arch: pick.arch });
        }
    }

    if (toProcess.length === 0) {
        ui.error('No engine assets available to package.');
        process.exit(1);
    }

    // ── 5. Copy ./build → ./.package/build-src (skip exe, log, plugins, lib) ──────
    ui.section('Copying build files');
    for (const entry of fs.readdirSync(buildDir, { withFileTypes: true })) {
        const name = entry.name;
        if (BUILD_EXCLUDES.has(name) || BUILD_EXCLUDE_PREFIXES.some(p => name.startsWith(p)))
            { ui.dim(`skip: ${name}`); continue; }
        // Skip any file that parses as an engine binary (any name/os/arch combination).
        // This prevents host-arch binaries from leaking into cross-platform packages.
        if (parseExecAsset(name))
            { ui.dim(`skip (exe): ${name}`); continue; }
        const src  = path.join(buildDir, name);
        const dest = path.join(buildSrcDir, name);
        if (entry.isDirectory()) copyDir(src, dest); else fs.copyFileSync(src, dest);
        ui.step(`copy: ${name}`);
    }

    // Warn when build/plugins/ has plugin files but no plugin-repositories are configured,
    // since those files will be excluded from all packages.
    if (pluginRepos.length === 0) {
        const buildPluginsDir = path.join(buildDir, 'plugins');
        if (fs.existsSync(buildPluginsDir)) {
            const pluginFiles = fs.readdirSync(buildPluginsDir).filter(f => /\.(so|dll)$/.test(f));
            if (pluginFiles.length > 0)
                ui.warn(`build/plugins/ has ${pluginFiles.length} plugin file(s) but no "plugin-repositories" in info.json — plugins will be excluded from packages.`);
        }
    }

    // ── 6. Download plugins → .package/plugins/0, /1, … (with optional cache) ─
    const targetCombos = toProcess.map(a => ({ os: a.os, arch: a.arch }));
    if (pluginRepos.length > 0) ui.section('Fetching plugins');
    for (let i = 0; i < pluginRepos.length; i++) {
        const repoUrl = pluginRepos[i];
        const pDir    = path.join(pluginsDir, String(i));
        fs.mkdirSync(pDir, { recursive: true });
        ui.step(`Plugin ${i}: ${repoUrl}`);
        let rel;
        try { rel = fetchLatestRelease(repoUrl); }
        catch (e) { ui.warn(`Skipping plugin ${i}: ${e.message}`); continue; }
        for (const asset of (rel.assets || [])) {
            const name = (asset.name || '').trim();
            const url  = asset.browser_download_url;
            if (!name || !url) continue;
            // Only fetch assets that match at least one target (os, arch) combo
            const fl = name.toLowerCase();
            const matchesTarget = targetCombos.some(({ os: tOs, arch: tArch }) =>
                fl.includes(tOs) && new RegExp(tArch + '(?![a-z0-9])').test(fl));
            if (!matchesTarget) { ui.dim(`skip (arch filter): ${name}`); continue; }
            const destPath = path.join(pDir, name);
            if (opts.cache && fs.existsSync(destPath)) { ui.info(`cached  ${name}`); continue; }
            ui.step(`Downloading ${name}…`);
            if (!download(url, destPath)) ui.warn(`Failed: ${name}`);
        }
    }

    // ── 7. Build packages per asset ───────────────────────────────────────────
    ui.section('Building packages');
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
                return fl.includes(targetOs) && new RegExp(targetArch + '(?![a-z0-9])').test(fl);
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
            ui.warn(`Failed to build package for ${targetOs}-${targetArch}: ${e.message}`);
        }
    }

    // Write the single unified Homebrew formula covering all macOS bottle arches.
    if (homebrewBottles.length > 0) writeHomebrewFormula(homebrewBottles);

    // ── 8. Clean up staging (always); wipe all .package when --cache is off ──
    ui.section('Cleaning up');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
    if (!opts.cache) {
        try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (_) {}
    }

    ui.ok('Packaging complete.');
    ui.info(`Output: ${path.relative(process.cwd(), pkgDir)}/`);
    if (opts.cache) ui.info(`Cache:  ${path.relative(process.cwd(), cacheDir)}/`);
}

// ─── Docker / native dispatch ─────────────────────────────────────────────────
function dispatch(args) {
    function normalizePathForDocker(p) {
        // Resolve symlinks so Docker receives the canonical path (e.g. /tmp →
        // /private/tmp on macOS, or a real path Docker is configured to share).
        let resolved = p;
        try { resolved = fs.realpathSync(p); } catch (_) {}
        if (process.platform !== 'win32') return resolved;
        const m = resolved.match(/^([A-Za-z]):\\?(.*)$/);
        if (!m) return resolved.replace(/\\/g, '/');
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
        ui.section('Running natively for macOS packages (hdiutil / pkgbuild / productbuild)');
        run(nativeArgs);
    }

    function runInDocker(dockerArgs, onExit) {
        let dockerOk = false;
        try { dockerOk = spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0; } catch (e) {}
        if (!dockerOk) {
            ui.error('docker is required to build Linux / Windows packages. Please install Docker and try again.');
            process.exit(2);
        }

        // __dirname is cli/commands/ — go one level up to reach the cli/ folder (where the Dockerfile lives)
        const cliDir  = path.resolve(__dirname, '..');
        const hostDir = normalizePathForDocker(cliDir);
        const hostCwd = normalizePathForDocker(path.resolve(process.cwd()));
        const image   = process.env.RENWEB_IMAGE || 'renweb-cli';

        // Pre-flight: catch the common "path not shared" error before investing time building an image.
        const mountTest = spawnSync(
            'docker', ['run', '--rm', '-v', `${hostCwd}:/test-mount`, 'busybox', 'true'],
            { stdio: 'pipe', encoding: 'utf8' }
        );
        if (mountTest.status !== 0) {
            const stderr = (mountTest.stderr || '').toLowerCase();
            if (stderr.includes('mounts denied') || stderr.includes('not shared') || stderr.includes('file sharing')) {
                ui.error(
                    `Docker cannot mount your working directory:\n  ${hostCwd}\n\n` +
                    `This usually happens when your project is inside /tmp or another\n` +
                    `directory that Docker Desktop does not share by default.\n\n` +
                    `Solutions:\n` +
                    `  1. Move your project to your home directory and re-run.\n` +
                    `  2. Add '${hostCwd}' to Docker Desktop → Preferences → Resources → File Sharing.`
                );
            } else {
                ui.error(`Docker volume mount test failed:\n${mountTest.stderr || mountTest.stdout}`);
            }
            process.exit(125);
        }

        // Pass the host project root as a second read-only volume at /renweb-project (bounded by /project inside Docker).
        const hostBuildDir   = findBuildDir();
        const hostProjectDir = hostBuildDir ? normalizePathForDocker(path.resolve(hostBuildDir, '..')) : null;

        let imageExists = false;
        try {
            const inspect = spawnSync('docker', ['images', '-q', image], { encoding: 'utf8' });
            imageExists   = Boolean(inspect.stdout && inspect.stdout.trim().length > 0);
        } catch (e) {}

        if (!imageExists) {
            ui.step(`Docker image '${image}' not found locally — building it now.`);
            const buildRes = spawnSync('docker', ['build', '-t', image, cliDir], { stdio: 'inherit' });
            if (buildRes.status !== 0) {
                ui.error('Failed to build docker image; cannot continue.');
                process.exit(buildRes.status || 3);
            }
        }

        if (process.platform !== 'win32') {
            const pkgCache = path.join(process.cwd(), '.rw', 'package');
            try {
                fs.mkdirSync(pkgCache, { recursive: true });
            } catch (e) {
                if (e.code === 'EACCES') {
                    ui.error(
                        `${pkgCache} is owned by root from a previous run.\n` +
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
        const projectVolumeArgs = hostProjectDir && hostProjectDir !== hostCwd
            ? ['-v', `${hostProjectDir}:/renweb-project:ro`, '-e', 'RENWEB_PROJECT_ROOT=/renweb-project']
            : [];
        const dockerRunArgs = [
            'run', '--rm',
            '--name', containerName,
            '-e', 'IN_DOCKER=1',
            '-e', 'RENWEB_CWD=/project',
            '-e', 'FORCE_COLOR=3',
            '-e', `COLUMNS=${process.stdout.columns || 80}`,
            ...userFlag,
            '-v', `${hostCwd}:/project`,
            '-v', `${hostDir}:/work`,
            ...projectVolumeArgs,
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
            ui.section('Packaging: running Docker (linux/windows');

            runInDocker(args, (code) => process.exit(code));
            return;
        }
        ui.section('Packaging: running Docker (linux/windows) then native (macos)');
        runInDocker(dockerArgs, (dockerCode) => {
            if (dockerCode !== 0) ui.warn(`Docker packaging exited with code ${dockerCode}`);
            runNative(nativeArgs);
        });
    }
}

module.exports = { run, dispatch };
