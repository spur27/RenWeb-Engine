#!/usr/bin/env node
'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const ui            = require('../shared/ui');
const { toKebab, makeRl } = require('../shared/utils');
const { prompt } = ui;
const { FRAMEWORK_TYPES }         = require('../shared/constants');
const { makeConfigJson, makeInfoJson } = require('../shared/templates/project');
const { fetchWebApi, fetchEngineExecutable, fetchGitHubDirectory } = require('../shared/fetchers');

// ─── Framework → npm dep name ────────────────────────────────────────────────

const FRAMEWORK_DEP = {
    react:  'react',
    vue:    'vue',
    svelte: 'svelte',
    preact: 'preact',
    solid:  'solid-js',
    lit:    'lit',
};

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Infer the project type from files present in projectDir.
 * Returns one of: 'angular' | framework type | 'vite' | 'deno' | 'node-vanilla' | 'vanilla'
 */
function detectType(projectDir) {
    if (fs.existsSync(path.join(projectDir, 'angular.json'))) return 'angular';

    const viteFile = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']
        .find(f => fs.existsSync(path.join(projectDir, f)));
    if (viteFile) {
        let pkg = null;
        try { pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')); } catch (_) {}
        if (pkg) {
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            for (const [type, dep] of Object.entries(FRAMEWORK_DEP)) {
                if (deps[dep]) return type;
            }
        }
        return 'vite'; // generic Vite project, unknown framework
    }

    if (fs.existsSync(path.join(projectDir, 'deno.json')) ||
        fs.existsSync(path.join(projectDir, 'deno.jsonc'))) return 'deno';

    if (fs.existsSync(path.join(projectDir, 'package.json'))) return 'node-vanilla';

    return 'vanilla';
}

function typeLabel(type) {
    return {
        angular:       'Angular',
        react:         'React',
        vue:           'Vue 3',
        svelte:        'Svelte',
        preact:        'Preact',
        solid:         'SolidJS',
        lit:           'Lit',
        vite:          'Vite (unknown framework)',
        deno:          'Deno',
        'node-vanilla': 'Node (no bundler)',
        vanilla:       'Vanilla (no bundler)',
    }[type] || type;
}

// ─── Patchers ────────────────────────────────────────────────────────────────

/**
 * Add renweb-api dependency and prebuild hook to package.json.
 * Returns true if any changes were made.
 */
function patchPackageJson(projectDir) {
    const pkgPath = path.join(projectDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    let changed = false;
    if (!pkg.dependencies?.['renweb-api']) {
        pkg.dependencies = { ...(pkg.dependencies || {}), 'renweb-api': 'latest' };
        changed = true;
    }
    if (!pkg.scripts?.prebuild?.includes('--meta-only')) {
        pkg.scripts = { ...(pkg.scripts || {}), prebuild: 'rw build --meta-only' };
        changed = true;
    }
    if (!pkg.scripts?.start?.includes('rw')) {
        pkg.scripts = { ...(pkg.scripts || {}), start: 'rw build && rw run' };
        changed = true;
    }
    if (!pkg.scripts?.test?.includes('rw')) {
        pkg.scripts = { ...(pkg.scripts || {}), test: 'rw run' };
        changed = true;
    }
    if (changed) fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    return changed;
}

/**
 * Patch vite.config.* to output to build/content/<pageName>/.
 * Returns { patched: boolean, note?: string }.
 */
function patchViteConfig(projectDir, pageName) {
    const viteFile = ['vite.config.js', 'vite.config.ts', 'vite.config.mjs']
        .find(f => fs.existsSync(path.join(projectDir, f)));
    if (!viteFile) return { patched: false };

    const configPath = path.join(projectDir, viteFile);
    let src = fs.readFileSync(configPath, 'utf8');
    const outDirTarget = `build/content/${pageName}`;

    // Already configured correctly
    if (src.includes(outDirTarget)) return { patched: true, note: 'Already configured' };

    // Replace existing outDir value
    if (/outDir\s*:\s*['"`][^'"`]*['"`]/.test(src)) {
        src = src.replace(/outDir\s*:\s*['"`][^'"`]*['"`]/, `outDir: '${outDirTarget}'`);
        fs.writeFileSync(configPath, src, 'utf8');
        return { patched: true };
    }

    // Existing build block without outDir — insert at start of block
    if (/\bbuild\s*:\s*\{/.test(src)) {
        src = src.replace(/(\bbuild\s*:\s*\{)/, `$1\n    outDir: '${outDirTarget}',`);
        fs.writeFileSync(configPath, src, 'utf8');
        return { patched: true };
    }

    // No build block — insert before the last \n} (closing brace of defineConfig arg)
    const lastIdx = src.lastIndexOf('\n}');
    if (lastIdx !== -1) {
        const buildBlock = `\n  build: {\n    outDir: '${outDirTarget}',\n    emptyOutDir: true,\n  },`;
        src = src.slice(0, lastIdx) + buildBlock + src.slice(lastIdx);
        fs.writeFileSync(configPath, src, 'utf8');
        return { patched: true };
    }

    return {
        patched: false,
        note: `Set outDir: '${outDirTarget}' in your ${viteFile} manually`,
    };
}

/**
 * Patch angular.json outputPath to always use the object form expected by
 * the Angular 17+ application builder: { base, browser: '' }.
 * Returns true if successful.
 */
function patchAngularJson(projectDir, pageName) {
    const angPath = path.join(projectDir, 'angular.json');
    if (!fs.existsSync(angPath)) return false;
    const angJson   = JSON.parse(fs.readFileSync(angPath, 'utf8'));
    const name      = path.basename(projectDir);
    const buildOpts = angJson.projects?.[name]?.architect?.build?.options;
    if (!buildOpts) return false;
    const target = { base: `build/content/${pageName}`, browser: '' };
    if (typeof buildOpts.outputPath === 'object' && buildOpts.outputPath?.base === target.base)
        return true; // already set
    buildOpts.outputPath = target;
    fs.writeFileSync(angPath, JSON.stringify(angJson, null, 2) + '\n', 'utf8');
    return true;
}

/**
 * Patch deno.json to prefix the build task with `rw build --meta-only &&`.
 * If no build task exists, adds one that only runs the meta step.
 */
function patchDenoJson(projectDir) {
    const denoPath = ['deno.json', 'deno.jsonc']
        .map(f => path.join(projectDir, f))
        .find(p => fs.existsSync(p));
    if (!denoPath) return false;
    const deno    = JSON.parse(fs.readFileSync(denoPath, 'utf8'));
    const tasks   = deno.tasks || {};
    const metaCmd = 'rw build --meta-only';
    if (tasks.build) {
        if (!tasks.build.includes('--meta-only')) tasks.build = `${metaCmd} && ${tasks.build}`;
    } else {
        tasks.build = metaCmd;
    }
    deno.tasks = tasks;
    fs.writeFileSync(denoPath, JSON.stringify(deno, null, 2) + '\n', 'utf8');
    return true;
}

/**
 * Append any missing RenWeb-relevant entries to .gitignore.
 */
function updateGitignore(projectDir) {
    const giPath = path.join(projectDir, '.gitignore');
    const needed = ['build/', 'credentials/', '.env', '*.log', '.rw/'];
    let existing = '';
    try { existing = fs.readFileSync(giPath, 'utf8'); } catch (_) {}
    const toAdd = needed.filter(e => !existing.includes(e));
    if (toAdd.length === 0) return;
    fs.appendFileSync(giPath, '\n# RenWeb\n' + toAdd.join('\n') + '\n', 'utf8');
}

// ─── Plan display ─────────────────────────────────────────────────────────────

function describePlan(type) {
    const isViteBased = [...FRAMEWORK_TYPES, 'vite'].includes(type);
    const lines = [];

    if (type === 'angular') {
        lines.push('  • Patch angular.json outputPath → build/content/main/');
        lines.push('  • Add renweb-api + prebuild to package.json → npm install');
    } else if (isViteBased) {
        lines.push('  • Patch vite.config outDir → build/content/main/');
        lines.push('  • Add renweb-api + prebuild to package.json → npm install');
    } else if (type === 'deno') {
        lines.push('  • Patch deno.json build task (prefix: rw build --meta-only)');
        lines.push('  • Copy RenWeb JS API to src/modules/renweb/');
        lines.push('  • Run deno install');
    } else if (type === 'node-vanilla') {
        lines.push('  • Copy RenWeb JS API to src/modules/renweb/');
        lines.push('  • Add renweb-api to package.json → npm install');
    } else {
        lines.push('  • Copy RenWeb JS API to src/modules/renweb/');
    }

    lines.push('  • Write info.json, config.json');
    lines.push('  • Fetch licenses/, resource/, credentials/');
    lines.push('  • Download engine executable to build/');
    lines.push('  • Update .gitignore');
    return lines;
}

// ─── App info prompt ──────────────────────────────────────────────────────────

/**
 * Prompt for app metadata. Uses existing info.json values as defaults.
 */
async function promptInitInfo(rl, yes, projectDir) {
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(path.join(projectDir, 'info.json'), 'utf8')); } catch (_) {}

    const def = (key, fallback) => existing[key] ?? fallback;

    if (yes) {
        const title = def('title', path.basename(projectDir));
        return {
            title,
            description: def('description', ''),
            author:      def('author', ''),
            version:     def('version', '0.0.1'),
            license:     def('license', 'MIT'),
            categories:  def('categories', ['Utility']),
            app_id:      def('app_id', `io.github.user.${toKebab(title)}`),
            repository:  def('repository', ''),
        };
    }

    ui.spacer();
    ui.section('App info');
    ui.spacer();
    const title       = await prompt(rl, 'App title',   def('title', path.basename(projectDir)));
    const description = await prompt(rl, 'Description', def('description', ''));
    const author      = await prompt(rl, 'Author',      def('author', ''));
    const version     = await prompt(rl, 'Version',     def('version', '0.0.1'));
    const license     = await prompt(rl, 'License',     def('license', 'MIT'));
    const catRaw      = await prompt(rl, 'Categories (comma-separated)', (def('categories', ['Utility'])).join(', '));
    const categories  = catRaw.split(',').map(s => s.trim()).filter(Boolean);
    const app_id      = await prompt(rl, 'App ID (reverse domain)', def('app_id', `io.github.${toKebab(author || 'user')}.${toKebab(title)}`));
    const repository  = await prompt(rl, 'Repository URL', def('repository', ''));
    ui.spacer();
    return { title, description, author, version, license, categories, app_id, repository };
}

// ─── Entry ────────────────────────────────────────────────────────────────────

function parseArgs(args) {
    const positional = args.filter(a => !a.startsWith('-'));
    const flags      = args.filter(a => a.startsWith('-'));
    const yes        = flags.includes('-y') || flags.includes('--yes');
    const dir        = positional[0] || null;
    return { dir, yes };
}

async function run(args) {
    const { dir, yes } = parseArgs(args);
    const projectDir   = path.resolve(dir || process.cwd());

    if (!fs.existsSync(projectDir)) {
        ui.error(`Directory does not exist: ${projectDir}`);
        ui.dim('To create a new project, use rw create');
        process.exit(1);
    }

    const type = detectType(projectDir);
    const isViteBased = [...FRAMEWORK_TYPES, 'vite'].includes(type);

    ui.spacer();
    ui.info(`Detected: ${typeLabel(type)}`);
    ui.dim(`in ${projectDir}`);
    ui.spacer();
    ui.section('Will do');
    for (const line of describePlan(type)) ui.plain(line);
    ui.spacer();

    const rl = yes ? null : makeRl();

    // ── Confirm ────────────────────────────────────────────────────────────────
    if (!yes) {
        const answer = await prompt(rl, 'Integrate RenWeb?', 'Y');
        if (!['y', 'yes', ''].includes(answer.trim().toLowerCase())) {
            if (rl) rl.close();
            ui.warn('Aborted.');
            return;
        }
    }

    // ── App metadata ──────────────────────────────────────────────────────────
    const info = await promptInitInfo(rl, yes, projectDir);
    if (rl) rl.close();

    const pageName = 'main';
    const buildDir = path.join(projectDir, 'build');
    fs.mkdirSync(path.join(buildDir, 'content', pageName), { recursive: true });

    // ── Type-specific patching ────────────────────────────────────────────────
    if (type === 'angular') {
        ui.step('Patching angular.json…');
        const ok = patchAngularJson(projectDir, pageName);
        if (!ok) ui.warn('Could not patch angular.json — set outputPath manually');
        ui.step('Patching package.json…');
        patchPackageJson(projectDir);

    } else if (isViteBased) {
        ui.step('Patching vite.config…');
        const r = patchViteConfig(projectDir, pageName);
        if (r.note) ui.warn(r.note);
        ui.step('Patching package.json…');
        patchPackageJson(projectDir);

    } else if (type === 'deno') {
        ui.step('Patching deno.json…');
        patchDenoJson(projectDir);
        ui.step('Fetching RenWeb JS API…');
        fetchWebApi(path.join(projectDir, 'src', 'modules', 'renweb'));

    } else if (type === 'node-vanilla') {
        ui.step('Fetching RenWeb JS API…');
        fetchWebApi(path.join(projectDir, 'src', 'modules', 'renweb'));
        const pkgPath = path.join(projectDir, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (!pkg.dependencies?.['renweb-api']) {
            pkg.dependencies = { ...(pkg.dependencies || {}), 'renweb-api': 'latest' };
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
        }

    } else {
        // vanilla — no bundler, no package manager
        ui.step('Fetching RenWeb JS API…');
        fetchWebApi(path.join(projectDir, 'src', 'modules', 'renweb'));
    }

    // ── RenWeb manifests ──────────────────────────────────────────────────────
    ui.step('Writing info.json, config.json…');
    const configText = makeConfigJson(info, pageName);
    const infoText   = makeInfoJson(info, pageName);
    fs.writeFileSync(path.join(projectDir, 'info.json'),   infoText,   'utf8');
    fs.writeFileSync(path.join(projectDir, 'config.json'), configText, 'utf8');
    fs.writeFileSync(path.join(buildDir, 'info.json'),     infoText,   'utf8');
    fs.writeFileSync(path.join(buildDir, 'config.json'),   configText, 'utf8');

    // ── Static assets from engine repo ───────────────────────────────────────
    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

    // ── Engine executable ─────────────────────────────────────────────────────
    ui.step('Fetching engine executable…');
    fetchEngineExecutable(buildDir);

    // ── .gitignore ────────────────────────────────────────────────────────────
    updateGitignore(projectDir);

    // ── Install packages ──────────────────────────────────────────────────────
    if (type === 'angular' || isViteBased || type === 'node-vanilla') {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        ui.step('Installing npm packages…');
        const r = spawnSync(npmCmd, ['install'], { cwd: projectDir, stdio: 'inherit' });
        if (r.status !== 0) ui.warn('npm install failed — run it manually');
        else ui.ok('npm packages installed');
    } else if (type === 'deno') {
        ui.step('Running deno install…');
        const r = spawnSync('deno', ['install'], { cwd: projectDir, stdio: 'inherit' });
        if (r.status !== 0) ui.warn('deno install failed — run it manually');
        else ui.ok('deno packages installed');
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    ui.ok('RenWeb integration complete.');
    ui.section('Next steps');
    if (type === 'angular') {
        ui.nextSteps([['npm run build', 'or: ng build — outputs to build/content/main/']]);
    } else if (isViteBased) {
        ui.nextSteps([['rw build', 'delegates to npm run build → Vite']]);
    } else {
        ui.nextSteps([['rw build', 'mirrors src/ → build/']]);
    }
    ui.nextSteps([['rw run', 'launch the engine']]);
}

module.exports = { run };
