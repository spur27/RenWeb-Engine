#!/usr/bin/env node
'use strict';

const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const {
    toSnake, toKebab, makeRl, resolveEngineRepo,
} = require('../shared/utils');
const { FRAMEWORK_TYPES, ANGULAR_TYPES, VITE_FRAMEWORK, ALL_TYPES } = require('../shared/constants');
const {
    fetchWebApi, fetchEngineExecutable, fetchPluginHpp, fetchGitHubDirectory,
} = require('../shared/fetchers');
const {
    makeCopilotInstructions, makeConfigJson, makeInfoJson,
} = require('../shared/templates/project');
const {
    makePluginHpp, makePluginCpp, makePluginMakefile, makePluginBuildAllArchs,
    makePluginReadme, makePluginGitignore, makePluginWorkflow,
    makePluginTestInfoJson, makePluginTestConfigJson, makePluginTestHarnessHtml,
} = require('../shared/templates/plugin');
const ui = require('../shared/ui');
const { prompt } = ui;

// ─── Interactive type / engine prompts ───────────────────────────────────────

async function promptType(rl) {
    console.clear();
    ui.spacer();
    ui.section('Project types');
    ui.spacer();
    ui.menuGroup('Applications');
    ui.menuItem('vanilla',  'Plain HTML/CSS/JS (no bundler)');
    ui.menuItem('react',    'React');
    ui.menuItem('vue',      'Vue 3');
    ui.menuItem('svelte',   'Svelte');
    ui.menuItem('preact',   'Preact');
    ui.menuItem('solid',    'SolidJS');
    ui.menuItem('lit',      'Lit (Web Components)');
    ui.menuItem('angular',  'Angular (uses @angular/cli)');
    ui.spacer();
    ui.menuGroup('Other');
    ui.menuItem('plugin',   'C++ plugin for RenWeb');
    ui.menuItem('engine',   'Clone the RenWeb engine repository');
    ui.spacer();
    const raw = await prompt(rl, 'Type', 'vanilla');
    const t   = raw.trim().toLowerCase();
    if (!ALL_TYPES.includes(t)) {
        ui.error(`Unknown type '${t}'. Options: ${ALL_TYPES.join(', ')}`);
        rl.close();
        process.exit(1);
    }
    return t;
}

// ─── Interactive prompts ─────────────────────────────────────────────────────

async function promptInfo(rl, extra = [], yes = false, type = '') {
    if (yes) {
        const title = 'My RenWeb App';
        return {
            title,
            description: '',
            author:      '',
            version:     '0.0.1',
            license:     'BSL 1.0',
            categories:  ['Utility'],
            app_id:      `io.github.user.${toKebab(title)}`,
            repository:  '',
            ...Object.fromEntries(extra.map(({ key, fallback }) => [key, fallback ?? ''])),
        };
    }
    console.clear();
    ui.spacer();
    ui.section(`${type} Project info`);
    ui.spacer();
    const title       = await prompt(rl, 'App title', 'My RenWeb App');
    const description = await prompt(rl, 'Description', '');
    const author      = await prompt(rl, 'Author', '');
    const version     = await prompt(rl, 'Version', '0.0.1');
    const license     = await prompt(rl, 'License', 'BSL 1.0');
    const categoriesRaw = await prompt(rl, 'Categories (comma-separated)', 'Utility');
    const categories     = categoriesRaw.split(',').map(s => s.trim()).filter(Boolean);
    const app_id         = await prompt(rl, 'App ID (reverse domain)', `io.github.${toKebab(author || 'user')}.${toKebab(title)}`);
    const repository     = await prompt(rl, 'Repository URL', '');
    const extraInfo      = {};
    for (const { key, question, fallback } of extra) {
        extraInfo[key] = await prompt(rl, question, fallback);
    }
    ui.spacer();
    return { title, description, author, version, license, categories, app_id, repository, ...extraInfo };
}

// ─── Front-end project scaffolder ────────────────────────────────────────────

async function createFrontend(projectDir, info) {
    const pageName = 'main';

    if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        ui.dim('To integrate RenWeb into an existing project, run: rw init');
        process.exit(1);
    }
    fs.mkdirSync(projectDir, { recursive: true });

    // ── src/ structure ────────────────────────────────────────────────────────
    const srcContent = path.join(projectDir, 'src', 'content', pageName);
    const srcAssets  = path.join(projectDir, 'src', 'assets');
    fs.mkdirSync(srcContent, { recursive: true });
    fs.mkdirSync(srcAssets,  { recursive: true });

    // ── RenWeb JS API (static download, no bundler needed) ────────────────────
    fetchWebApi(path.join(projectDir, 'src', 'modules', 'renweb'));

    // ── Starter HTML page ─────────────────────────────────────────────────────
    // After rw build, content lives at build/content/<page>/ and modules at
    // build/content/<page>/modules/renweb/ — so ./modules/renweb/index.js works.
    fs.writeFileSync(path.join(srcContent, 'index.html'),
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${info.title}</title>
</head>
<body>
  <h1>Hello from ${info.title}!</h1>
  <script type="module">
    import { Log, Window, FS } from './modules/renweb/index.js';
    console.log('RenWeb app started');
  </script>
</body>
</html>
`, 'utf8');

    // ── Extra directories from engine repo ────────────────────────────────────
    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

    // ── Copilot instructions ──────────────────────────────────────────────────
    const githubDir = path.join(projectDir, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        makeCopilotInstructions(info, pageName),
        'utf8',
    );

    // ── jsconfig.json (IDE support) ───────────────────────────────────────────
    const jsconfig = {
        compilerOptions: {
            module:           'ESNext',
            moduleResolution: 'bundler',
            checkJs:          false,
        },
    };
    fs.writeFileSync(
        path.join(projectDir, 'jsconfig.json'),
        JSON.stringify(jsconfig, null, 2) + '\n',
        'utf8',
    );

    // ── info.json / config.json ───────────────────────────────────────────────
    const configText = makeConfigJson(info, pageName);
    const infoText   = makeInfoJson(info, pageName);
    fs.writeFileSync(path.join(projectDir, 'info.json'),   infoText,   'utf8');
    fs.writeFileSync(path.join(projectDir, 'config.json'), configText, 'utf8');

    // ── build/ skeleton ───────────────────────────────────────────────────────
    const buildDir = path.join(projectDir, 'build');
    fs.mkdirSync(path.join(buildDir, 'content', pageName), { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'config.json'), configText, 'utf8');
    fs.writeFileSync(path.join(buildDir, 'info.json'),   infoText,   'utf8');
    fetchEngineExecutable(buildDir);

    // ── .gitignore ────────────────────────────────────────────────────────────
    const ignoreEntries = [
        'build/',
        'package/',
        'release/',
        'dist/',
        'credentials/',
        '.DS_Store',
        'Thumbs.db',
        '.env',
        '*.log',
        '.rw/',
        '',
    ];
    const giPath = path.join(projectDir, '.gitignore');
    if (!fs.existsSync(giPath)) fs.writeFileSync(giPath, ignoreEntries.join('\n'), 'utf8');
}


// ─── JS framework scaffolder (React / future: Vue, Svelte, …) ────────────────

async function createFramework(projectDir, info, type) {
    const pageName  = 'main';
    const fw        = VITE_FRAMEWORK[type];
    const template  = fw.template;
    const npmCmd    = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    // ── Pre-flight: verify npm is available ───────────────────────────────────
    const check = spawnSync(npmCmd, ['--version'], { stdio: 'ignore' });
    if (check.error?.code === 'ENOENT') {
        ui.error('npm is not installed or not on PATH.');
        ui.dim('Install Node.js from https://nodejs.org and try again.');
        process.exit(1);
    }

    // ── Guard against non-empty target directory ──────────────────────────────
    if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        ui.dim('To integrate RenWeb into an existing project, run: rw init');
        process.exit(1);
    }

    const parent = path.dirname(projectDir);
    const name   = path.basename(projectDir);
    fs.mkdirSync(parent, { recursive: true });

    // ── Scaffold with create-vite ─────────────────────────────────────────────
    ui.step(`Scaffolding ${type} project via Vite…`);
    const npxCmd  = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const scaffold = spawnSync(
        npxCmd,
        ['--yes', 'create-vite@5', name, '--template', template],
        { cwd: parent, stdio: 'pipe' },
    );
    // Verify by checking the output directory rather than relying on exit code,
    // since some npm/npx versions return non-zero even on success.
    const pkgPath = path.join(projectDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        ui.error('Vite scaffolding failed — package.json not found.');
        process.exit(scaffold.status ?? 1);
    }
    const pkg  = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.name   = toKebab(info.title);
    pkg.version = info.version || '0.0.1';
    // Leave the Vite version untouched — create-vite already pins a version
    // that satisfies all framework plugin peer deps. Overriding it to 'latest'
    // risks breaking those peer constraints (e.g. @vitejs/plugin-vue only
    // accepts vite ^5 || ^6 and would fail with a newer major).
    pkg.dependencies = { ...pkg.dependencies, 'renweb-api': 'latest' };
    pkg.scripts = {
        ...pkg.scripts,
        prebuild: 'rw build --meta-only',
        start:    'rw build && rw run',
        test:     'rw run',
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

    // ── Overwrite vite.config.js to output into build/content/main/ ──────────
    const pluginImport = fw.importLine ? `\n${fw.importLine}` : '';
    const pluginsArr   = fw.pluginCall  ? `[${fw.pluginCall}]` : '[]';
    const viteConfig =
`import { defineConfig } from 'vite';${pluginImport}

export default defineConfig({
  plugins: ${pluginsArr},
  build: {
    outDir: 'build/content/${pageName}',
    emptyOutDir: true,
  },
});
`;
    fs.writeFileSync(path.join(projectDir, 'vite.config.js'), viteConfig, 'utf8');

    // ── RenWeb engine config ──────────────────────────────────────────────────
    ui.step('Writing RenWeb config files…');
    const configText = makeConfigJson(info, pageName);
    const infoText   = makeInfoJson(info, pageName);
    const buildDir   = path.join(projectDir, 'build');
    fs.mkdirSync(path.join(buildDir, 'content', pageName), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'info.json'),   infoText,   'utf8');
    fs.writeFileSync(path.join(projectDir, 'config.json'), configText, 'utf8');
    fs.writeFileSync(path.join(buildDir, 'info.json'),     infoText,   'utf8');
    fs.writeFileSync(path.join(buildDir, 'config.json'),   configText, 'utf8');
    fetchEngineExecutable(buildDir);

    // ── Extra directories from engine repo ────────────────────────────────────
    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

    // ── Copilot instructions ──────────────────────────────────────────────────
    ui.step('Writing Copilot instructions…');
    const githubDir = path.join(projectDir, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        makeCopilotInstructions(info, pageName),
        'utf8',
    );

    // ── .gitignore — append RenWeb entries to Vite's generated file ──────────
    const giPath       = path.join(projectDir, '.gitignore');
    const giExisting   = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
    const giAppend     = ['build/', 'credentials/', '.env', 'Thumbs.db', '.rw/']
        .filter(e => !giExisting.includes(e));
    if (giAppend.length) fs.appendFileSync(giPath, '\n# RenWeb\n' + giAppend.join('\n') + '\n', 'utf8');

    // ── npm install ───────────────────────────────────────────────────────────
    ui.step('Installing packages…');
    const install = spawnSync(npmCmd, ['install'], { cwd: projectDir, stdio: 'pipe' });
    if (install.status !== 0) ui.warn('npm install failed — run it manually');
    else ui.ok('packages installed');
}


async function createAngular(projectDir, info) {
    const pageName = 'main';
    const npmCmd   = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const npxCmd   = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    // ── Pre-flight: verify npm is available ───────────────────────────────────
    const check = spawnSync(npmCmd, ['--version'], { stdio: 'ignore' });
    if (check.error?.code === 'ENOENT') {
        ui.error('npm is not installed or not on PATH.');
        ui.dim('Install Node.js from https://nodejs.org and try again.');
        process.exit(1);
    }

    // ── Guard against non-empty target directory ──────────────────────────────
    if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        ui.dim('To integrate RenWeb into an existing project, run: rw init');
        process.exit(1);
    }

    const parent = path.dirname(projectDir);
    const name   = path.basename(projectDir);
    fs.mkdirSync(parent, { recursive: true });

    // ── Scaffold with Angular CLI ─────────────────────────────────────────────
    ui.step('Scaffolding Angular project…');
    const scaffold = spawnSync(
        npxCmd,
        ['--yes', '@angular/cli@latest', 'new', name,
         '--routing=false', '--style=css', '--ssr=false', '--defaults', '--skip-install'],
        { cwd: parent, stdio: 'pipe' },
    );
    const angJsonPath = path.join(projectDir, 'angular.json');
    if (!fs.existsSync(angJsonPath)) {
        ui.error('Angular scaffolding failed — angular.json not found.');
        process.exit(scaffold.status ?? 1);
    }

    // ── Patch angular.json outputPath ────────────────────────────────────────
    ui.step('Augmenting angular.json…');
    const angJson   = JSON.parse(fs.readFileSync(angJsonPath, 'utf8'));
    const buildOpts = angJson.projects?.[name]?.architect?.build?.options;
    if (buildOpts) {
        // Always use the object form — the application builder (Angular 17+) appends
        // browser/ to any plain string path. Setting browser:'' places assets directly
        // in base, which is what RenWeb expects at build/content/main/.
        buildOpts.outputPath = { base: `build/content/${pageName}`, browser: '' };
    }
    fs.writeFileSync(angJsonPath, JSON.stringify(angJson, null, 2) + '\n', 'utf8');

    // ── Augment package.json ──────────────────────────────────────────────────
    ui.step('Augmenting package.json…');
    const pkgPath = path.join(projectDir, 'package.json');
    const pkg     = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.name      = toKebab(info.title);
    pkg.version   = info.version || '0.0.1';
    pkg.dependencies = { ...pkg.dependencies, 'renweb-api': 'latest' };
    pkg.scripts = {
        ...pkg.scripts,
        prebuild: 'rw build --meta-only',
        start:    'rw build && rw run',
        test:     'rw run',
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

    // ── RenWeb config files ───────────────────────────────────────────────────
    ui.step('Writing RenWeb config files…');
    const configText = makeConfigJson(info, pageName);
    const infoText   = makeInfoJson(info, pageName);
    const buildDir   = path.join(projectDir, 'build');
    fs.mkdirSync(path.join(buildDir, 'content', pageName), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'info.json'),   infoText,   'utf8');
    fs.writeFileSync(path.join(projectDir, 'config.json'), configText, 'utf8');
    fs.writeFileSync(path.join(buildDir, 'info.json'),     infoText,   'utf8');
    fs.writeFileSync(path.join(buildDir, 'config.json'),   configText, 'utf8');
    fetchEngineExecutable(buildDir);

    // ── Extra directories from engine repo ────────────────────────────────────
    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

    // ── Copilot instructions ──────────────────────────────────────────────────
    ui.step('Writing Copilot instructions…');
    const githubDir = path.join(projectDir, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(
        path.join(githubDir, 'copilot-instructions.md'),
        makeCopilotInstructions(info, pageName),
        'utf8',
    );

    // ── .gitignore — append RenWeb entries ───────────────────────────────────
    const giPath     = path.join(projectDir, '.gitignore');
    const giExisting = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
    const giAppend   = ['build/', 'credentials/', '.env', 'Thumbs.db', '.rw/']
        .filter(e => !giExisting.includes(e));
    if (giAppend.length) fs.appendFileSync(giPath, '\n# RenWeb\n' + giAppend.join('\n') + '\n', 'utf8');

    // ── npm install ───────────────────────────────────────────────────────────
    ui.step('Installing packages…');
    const install = spawnSync(npmCmd, ['install'], { cwd: projectDir, stdio: 'pipe' });
    if (install.status !== 0) ui.warn('npm install failed — run it manually');
    else ui.ok('packages installed');
}

async function createPlugin(projectDir, info) {
    const pluginName  = info.internalName || toSnake(info.title);
    const pluginClass = info.title.replace(/[^A-Za-z0-9]/g, '');
    const includeDir  = path.join(projectDir, 'include');
    const srcDir      = path.join(projectDir, 'src');

    fs.mkdirSync(srcDir,     { recursive: true });
    fs.mkdirSync(includeDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.github', 'workflows'), { recursive: true });

    // ── Fetch deps ────────────────────────────────────────────────────────────
    fetchPluginHpp(includeDir);

    // ── Write C++ source files ────────────────────────────────────────────────
    fs.writeFileSync(path.join(includeDir, `${pluginName}.hpp`),
        makePluginHpp(info, pluginName, pluginClass), 'utf8');

    fs.writeFileSync(path.join(srcDir, `${pluginName}.cpp`),
        makePluginCpp(info, pluginName, pluginClass), 'utf8');

    // ── Write build files ─────────────────────────────────────────────────────
    fs.writeFileSync(path.join(projectDir, 'makefile'),
        makePluginMakefile(info, pluginName), 'utf8');

    const buildAllArchsPath = path.join(projectDir, 'build_all_archs.sh');
    fs.writeFileSync(buildAllArchsPath, makePluginBuildAllArchs(pluginName), 'utf8');
    try { fs.chmodSync(buildAllArchsPath, 0o755); } catch (_) {}

    // ── Write project metadata ────────────────────────────────────────────────
    fs.writeFileSync(path.join(projectDir, 'README.md'),
        makePluginReadme(info, pluginName), 'utf8');

    fs.writeFileSync(path.join(projectDir, '.gitignore'),
        makePluginGitignore(), 'utf8');

    fs.writeFileSync(path.join(projectDir, '.github', 'workflows', 'build.yml'),
        makePluginWorkflow(pluginName), 'utf8');

    // ── Test environment (build/ with engine + minimal JSONs + test harness) ──
    ui.step('Setting up test environment in build/…');
    fetchPluginTestEnv(projectDir, info, pluginName);
}

// ─── Plugin test environment scaffolder ─────────────────────────────────────

function fetchPluginTestEnv(projectDir, info, pluginName) {
    const buildDir   = path.join(projectDir, 'build');
    const contentDir = path.join(buildDir, 'content', 'test');
    const pluginsDir = path.join(buildDir, 'plugins');

    fs.mkdirSync(contentDir, { recursive: true });
    fs.mkdirSync(pluginsDir,  { recursive: true });

    fs.writeFileSync(path.join(buildDir, 'info.json'),
        makePluginTestInfoJson(info), 'utf8');

    fs.writeFileSync(path.join(buildDir, 'config.json'),
        makePluginTestConfigJson(info), 'utf8');

    fs.writeFileSync(path.join(contentDir, 'index.html'),
        makePluginTestHarnessHtml(info, pluginName), 'utf8');

    // ── RenWeb API (flat copy alongside index.html) ───────────────────────────
    fetchWebApi(contentDir);

    // ── Engine executable ─────────────────────────────────────────────────────
    fetchEngineExecutable(buildDir);
}

// ─── Engine repo cloner ───────────────────────────────────────────────────────

function createEngine(projectDir, skipSubmodules) {
    const gitOk = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
    if (!gitOk) { ui.error('git is required for `rw create engine`'); process.exit(1); }

    const parent    = path.dirname(projectDir);
    const name      = path.basename(projectDir);
    const repoUrl   = resolveEngineRepo();
    const cloneArgs = skipSubmodules
        ? ['clone', repoUrl, name]
        : ['clone', '--recurse-submodules', repoUrl, name];

    ui.step(`Cloning RenWeb Engine repository into ${name}/…${skipSubmodules ? '' : ' (including submodules)'}`);
    const r = spawnSync('git', cloneArgs, { cwd: parent, stdio: 'inherit' });
    if (r.status !== 0) { ui.error('git clone failed'); process.exit(r.status); }
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(args) {
    const [first, ...rest] = args;
    // First positional is the type only if it doesn't look like a flag
    const rawType  = (first && !first.startsWith('-')) ? first.toLowerCase() : null;
    const allFlags = rawType ? rest : (first ? [first, ...rest] : []);

    const yes            = allFlags.includes('-y') || allFlags.includes('--yes');
    const skipSubmodules = allFlags.includes('--skip-submodules');
    const dirIdx         = allFlags.indexOf('--dir');
    const dir            = dirIdx >= 0 ? allFlags[dirIdx + 1] : null;

    return { rawType, dir, yes, skipSubmodules };
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function run(args) {
    const { rawType, dir, yes, skipSubmodules } = parseArgs(args);

    const rl = yes ? null : makeRl();

    // ── Step 1: Determine project type ────────────────────────────────────────
    let type;
    if (rawType && ALL_TYPES.includes(rawType)) {
        type = rawType;
    } else if (rawType) {
        ui.error(`Unknown type '${rawType}'. Options: ${ALL_TYPES.join(', ')}`);
        if (rl) rl.close();
        process.exit(1);
    } else if (yes) {
        type = 'vanilla';
    } else {
        type = await promptType(rl);
    }

    const projectDir = path.resolve(dir || process.cwd());

    // ── Engine clone: no further prompts needed ───────────────────────────────
    if (type === 'engine') {
        if (rl) rl.close();
        createEngine(projectDir, skipSubmodules);
        ui.ok('Repository cloned.');
        return;
    }

    // ── Plugin: existing flow ─────────────────────────────────────────────────
    if (type === 'plugin') {
        ui.section('RenWeb Plugin Project');
        const info = await promptInfo(rl, [], yes, 'Plugin');
        info.internalName = toSnake(info.title);
        if (rl) rl.close();

        ui.step(`Scaffolding plugin project at: ${projectDir}`);
        if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
            ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
            ui.dim('To integrate RenWeb into an existing project, run: rw init');
            process.exit(1);
        }
        fs.mkdirSync(projectDir, { recursive: true });
        await createPlugin(projectDir, info);
        ui.ok('Plugin project ready.');
        ui.nextSteps([
            ['cd ' + path.basename(projectDir), null],
            ['make', 'build for the current OS/arch'],
            ['./build_all_archs.sh', 'build for all supported architectures'],
        ]);
        ui.dim('Output goes to build/plugins/ — copy it to your RenWeb project');
        return;
    }

    // ── Angular: dedicated CLI, node is implicit ─────────────────────────────
    if (ANGULAR_TYPES.includes(type)) {
        ui.section('RenWeb Angular Project');
        const info = await promptInfo(rl, [], yes, 'Angular');
        if (rl) rl.close();

        ui.step(`Scaffolding angular project at: ${projectDir}`);
        await createAngular(projectDir, info);

        ui.ok('Project scaffolded.');
        const relA = path.relative(process.cwd(), projectDir) || '.';
        ui.nextSteps([
            ['cd ' + relA, null],
            ['ng build', 'build → build/content/main/'],
            ['rw run', 'launch the engine'],
        ]);
        return;
    }

    // ── Framework types: node is implicit, skip engine prompt ────────────────
    if (FRAMEWORK_TYPES.includes(type)) {
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
        ui.section(`RenWeb ${typeLabel} Project`);
        const info = await promptInfo(rl, [], yes, typeLabel);
        if (rl) rl.close();

        ui.step(`Scaffolding ${type} project at: ${projectDir}`);
        await createFramework(projectDir, info, type);

        ui.ok('Project scaffolded.');
        const relF = path.relative(process.cwd(), projectDir) || '.';
        ui.nextSteps([
            ['cd ' + relF, null],
            ['rw build', 'run Vite build → build/content/main/'],
            ['rw run', 'launch the engine'],
        ]);
        return;
    }

    // ── Step 2: Project metadata (vanilla) ──────────────────────────────────
    ui.section(`RenWeb ${type.charAt(0).toUpperCase() + type.slice(1)} Project`);
    const info = await promptInfo(rl, [], yes, type.charAt(0).toUpperCase() + type.slice(1));
    if (rl) rl.close();

    ui.step(`Scaffolding ${type} project at: ${projectDir}`);
    await createFrontend(projectDir, info);

    ui.ok('Project scaffolded.');
    const rel = path.relative(process.cwd(), projectDir) || '.';
    ui.nextSteps([
        ['cd ' + rel, null],
        ['rw build', 'copy src → build'],
        ['rw run', 'launch the engine'],
    ]);
    ui.dim('Tip: need npm packages? Use rw create lit for a lightweight Vite setup.');
}

module.exports = { run };
