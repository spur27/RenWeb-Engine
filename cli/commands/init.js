'use strict';
// renweb init [--type <vanilla|react|vue|svelte|preact>]
// Adds the RenWeb layer to an existing project in cwd.
// Detects Vite config to infer project type when --type is omitted.

const fs   = require('fs');
const path = require('path');
const {
    download, fetchLatestRelease, detectTarget, detectProjectType,
    makeRl, prompt, toSnake, toKebab,
    GITHUB_RAW,
} = require('./shared');

// ─── Scaffolding helpers ──────────────────────────────────────────────────────

function makeInfoJson(info, pageName) {
    return JSON.stringify({
        title:          info.title,
        description:    info.description,
        author:         info.author,
        version:        info.version,
        license:        info.license,
        categories:     info.categories,
        app_id:         info.app_id,
        repository:     info.repository,
        starting_pages: [pageName],
        permissions: {
            geolocation: false, notifications: true, media_devices: false,
            pointer_lock: false, install_missing_media_plugins: true, device_info: true,
        },
        origins: [],
    }, null, 4);
}

function makeConfigJson(info, pageName) {
    return JSON.stringify({
        __defaults__: {
            title_bar: true, fullscreen: false, keepabove: false,
            maximize: false, minimize: false, opacity: 1,
            position: { x: 0, y: 0 },
            resizable: true, size: { width: 1280, height: 840 },
            taskbar_show: true, initially_shown: true,
        },
        [pageName]: { title: info.title, merge_defaults: true },
    }, null, 4);
}

function makeViteConfig(type, pageName) {
    const pluginBlock = {
        react:  `import react   from '@vitejs/plugin-react';\nconst plugins = [react()];`,
        vue:    `import vue     from '@vitejs/plugin-vue';\nconst plugins = [vue()];`,
        svelte: `import { svelte } from '@sveltejs/vite-plugin-svelte';\nconst plugins = [svelte()];`,
        preact: `import preact  from '@preact/preset-vite';\nconst plugins = [preact()];`,
    }[type] || 'const plugins = [];';
    return `import { defineConfig } from 'vite';
${pluginBlock}

// RenWeb: output into build/content/${pageName}/
// base './' keeps asset paths relative (required for file:// loading).
export default defineConfig({
  plugins,
  base: './',
  build: {
    outDir: './build/content/${pageName}',
    emptyOutDir: true,
  },
});
`;
}

// ─── Engine download ──────────────────────────────────────────────────────────

function fetchEngine(buildDir) {
    const { os: tOs, arch: tArch } = detectTarget();
    console.log(`  Fetching engine for ${tOs}-${tArch}…`);
    const release = fetchLatestRelease();
    if (!release) { console.warn('  ⚠ Could not reach GitHub'); return null; }
    const pattern = new RegExp(`-${tOs}-${tArch}(\\.exe)?$`, 'i');
    const asset   = (release.assets || []).find(a => pattern.test(a.name));
    if (!asset) { console.warn(`  ⚠ No asset found for ${tOs}-${tArch}`); return null; }
    fs.mkdirSync(buildDir, { recursive: true });
    console.log(`  Downloading: ${asset.name}`);
    if (!download(asset.browser_download_url, path.join(buildDir, asset.name))) {
        console.warn('  ⚠ Download failed'); return null;
    }
    try { fs.chmodSync(path.join(buildDir, asset.name), 0o755); } catch (_) {}
    return asset.name;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function run(args) {
    const cwd = process.cwd();

    // Guard: already initialised?
    if (fs.existsSync(path.join(cwd, 'info.json')) || fs.existsSync(path.join(cwd, 'build', 'info.json'))) {
        console.error('This directory already has an info.json — use `rw update` instead.');
        process.exit(1);
    }

    // Parse --type flag
    const typeIdx = args.indexOf('--type');
    let explicitType = typeIdx >= 0 ? args[typeIdx + 1] : null;
    if (!explicitType) explicitType = detectProjectType(cwd);
    const type   = explicitType;
    const isVite = type !== 'vanilla';

    console.log(`\nDetected project type: ${type}`);
    console.log('Initialising RenWeb in the current directory.\n');

    // Interactive prompts
    const rl = makeRl();
    const titleFallback = path.basename(cwd)
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    const title           = await prompt(rl, 'App title',                      titleFallback);
    const description     = await prompt(rl, 'Description',                    '');
    const author          = await prompt(rl, 'Author',                         '');
    const version         = await prompt(rl, 'Version',                        '0.0.1');
    const license         = await prompt(rl, 'License',                        'BSL 1.0');
    const categoriesRaw   = await prompt(rl, 'Categories (comma-separated)',   'Utility');
    const categories      = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const app_id          = await prompt(rl, 'App ID', `io.github.${toKebab(author || 'user')}.${toKebab(title)}`);
    const repository      = await prompt(rl, 'Repository URL',                 '');
    rl.close();

    const info     = { title, description, author, version, license, categories, app_id, repository };
    const pageName = toSnake(title);
    const buildDir = path.join(cwd, 'build');
    const infoText = makeInfoJson(info, pageName);

    // ── info.json — written to root AND build/ ─────────────────────────────────
    fs.mkdirSync(path.join(buildDir, 'content', pageName), { recursive: true });
    if (!fs.existsSync(path.join(cwd, 'info.json')))
        fs.writeFileSync(path.join(cwd, 'info.json'), infoText, 'utf8');
    if (!fs.existsSync(path.join(buildDir, 'info.json')))
        fs.writeFileSync(path.join(buildDir, 'info.json'), infoText, 'utf8');

    // ── config.json ───────────────────────────────────────────────────────────
    const configPath = path.join(buildDir, 'config.json');
    if (!fs.existsSync(configPath))
        fs.writeFileSync(configPath, makeConfigJson(info, pageName), 'utf8');

    // ── vite.config.js ────────────────────────────────────────────────────────
    if (isVite) {
        const cfgPath = path.join(cwd, 'vite.config.js');
        if (fs.existsSync(cfgPath)) {
            fs.renameSync(cfgPath, cfgPath + '.bak');
            console.log(`\n  Backed up existing vite.config.js → vite.config.js.bak`);
        }
        fs.writeFileSync(cfgPath, makeViteConfig(type, pageName), 'utf8');
        console.log('  ✓ vite.config.js written');
    }

    // ── renweb/ JS API ────────────────────────────────────────────────────────
    const renwebDir = path.join(cwd, 'renweb');
    fs.mkdirSync(renwebDir, { recursive: true });
    for (const file of ['index.js', 'index.d.ts']) {
        const ok = download(`${GITHUB_RAW}/web/api/${file}`, path.join(renwebDir, file));
        console.log(ok ? `  ✓ renweb/${file}` : `  ⚠ Failed to fetch renweb/${file}`);
    }

    // ── Engine ────────────────────────────────────────────────────────────────
    fetchEngine(buildDir);

    // ── Merge package.json scripts ────────────────────────────────────────────
    const pkgJsonPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        pkg.scripts = pkg.scripts || {};
        if (isVite) pkg.scripts.build = pkg.scripts.build || 'rw build';
        pkg.scripts.dev   = 'rw run';
        pkg.scripts.start = 'rw run';
        fs.writeFileSync(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        console.log('  ✓ package.json scripts updated');
    }

    // ── .gitignore additions ──────────────────────────────────────────────────
    const giPath = path.join(cwd, '.gitignore');
    const giAdd  = `\n# RenWeb\nbuild/.engine.pid\nbuild/content/${pageName}/\n`;
    if (fs.existsSync(giPath)) {
        fs.appendFileSync(giPath, giAdd, 'utf8');
    } else {
        fs.writeFileSync(giPath, `node_modules/\n${giAdd}`, 'utf8');
    }

    console.log('\n✓ RenWeb initialised.');
    console.log('\nNext steps:');
    if (isVite) console.log('  npm install    # install Vite plugin dep if not already present');
    console.log('  rw run         # launch the engine');
    console.log('');
}

module.exports = { run };
