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
    makeConfigJson, makeInfoJson,
} = require('../shared/templates/project');
const {
    makePluginHpp, makePluginCpp, makePluginMakefile, makePluginBuildAllArchs,
    makePluginBuildForRelease,
    makePluginReadme, makePluginGitignore, makePluginWorkflow,
    makePluginTestInfoJson, makePluginTestConfigJson, makePluginTestHarnessHtml,
} = require('../shared/templates/plugin');
const ui = require('../shared/ui');
const { prompt } = ui;

function isDirectoryNonEmpty(dirPath) {
    if (!fs.existsSync(dirPath)) return false;
    const entries = fs.readdirSync(dirPath);
    return entries.some((entry) => !entry.startsWith('.'));
}

function appendGitignoreEntries(projectDir, entries, sectionLabel = 'RenWeb') {
    const giPath = path.join(projectDir, '.gitignore');
    const existing = fs.existsSync(giPath) ? fs.readFileSync(giPath, 'utf8') : '';
    const toAdd = entries.filter((entry) => !existing.includes(entry));
    if (toAdd.length === 0) return;
    fs.appendFileSync(giPath, `\n# ${sectionLabel}\n${toAdd.join('\n')}\n`, 'utf8');
}

function mergeGitignoreFiles(srcPath, destPath) {
    if (!fs.existsSync(srcPath)) return;
    if (!fs.existsSync(destPath)) {
        fs.renameSync(srcPath, destPath);
        return;
    }

    const srcLines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/);
    const destText = fs.readFileSync(destPath, 'utf8');
    const toAdd = srcLines
        .map((line) => line.trim())
        .filter((line) => line && !destText.includes(line));

    if (toAdd.length) {
        fs.appendFileSync(destPath, `\n# Existing scaffold\n${toAdd.join('\n')}\n`, 'utf8');
    }

    fs.unlinkSync(srcPath);
}

function moveDirectoryContents(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir)) {
        const srcPath = path.join(srcDir, entry);
        const destPath = path.join(destDir, entry);

        if (entry === '.gitignore') {
            mergeGitignoreFiles(srcPath, destPath);
            continue;
        }

        // Preserve user/system dotfiles already present in destination.
        if (entry.startsWith('.') && fs.existsSync(destPath)) {
            fs.rmSync(srcPath, { recursive: true, force: true });
            continue;
        }

        fs.renameSync(srcPath, destPath);
    }
    fs.rmdirSync(srcDir);
}

function getCwdSafe() {
    try {
        return process.cwd();
    } catch (_) {
        return null;
    }
}

function relativeFromCwdOrAbsolute(targetPath) {
    const cwd = getCwdSafe();
    if (!cwd) return targetPath;
    return path.relative(cwd, targetPath) || '.';
}

function getTailText(buf) {
    const s = (buf || '').toString().trim();
    if (!s) return '';
    return s.split('\n').slice(-8).join('\n');
}

function showScaffoldFailure(prefix, result, fallbackExitCode = 1) {
    if (result.error) {
        ui.error(`${prefix} failed: ${result.error.message}`);
    } else {
        ui.error(`${prefix} command failed.`);
    }

    const stderr = getTailText(result.stderr);
    const stdout = getTailText(result.stdout);
    if (stderr) ui.dim(stderr);
    else if (stdout) ui.dim(stdout);

    process.exit(result.status ?? fallbackExitCode);
}

function ensureNpmAvailable(npmCmd) {
    const check = spawnSync(npmCmd, ['--version'], { stdio: 'ignore' });
    if (check.error?.code === 'ENOENT') {
        ui.error('npm is not installed or not on PATH.');
        ui.dim('Install Node.js from https://nodejs.org and try again.');
        process.exit(1);
    }
}

function installNpmPackages(projectDir, npmCmd) {
    ui.step('Installing packages…');
    const install = runNpmWithWindowsFallback(projectDir, npmCmd, ['install']);

    if (install.error) {
        ui.warn(`npm install failed — ${install.error.message}`);
        const stderr = getTailText(install.stderr);
        const stdout = getTailText(install.stdout);
        if (stderr) ui.dim(stderr);
        else if (stdout) ui.dim(stdout);
        ui.warn('Run `npm install` manually in the project directory.');
        return;
    }

    if (install.status !== 0) {
        ui.warn('npm install failed — run it manually');
        const stderr = getTailText(install.stderr);
        const stdout = getTailText(install.stdout);
        if (stderr) ui.dim(stderr);
        else if (stdout) ui.dim(stdout);
        return;
    }

    ui.ok('packages installed');
}

function normalizeScaffoldPaths(projectDir) {
    const parent = path.dirname(projectDir);
    const name = path.basename(projectDir);
    const safeBaseName = toKebab(name) || 'renweb-app';
    const tempScaffoldName = `${safeBaseName}-rwtmp-${Date.now()}`;
    const targetExists = fs.existsSync(projectDir);
    const scaffoldName = (targetExists || safeBaseName !== name) ? tempScaffoldName : name;
    return {
        parent,
        name,
        scaffoldName,
        scaffoldProjectDir: path.join(parent, scaffoldName),
    };
}

function quoteForCmd(arg) {
    const s = String(arg);
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s;
    return `"${s.replace(/(["^])/g, '^$1')}"`;
}

function runNpmWithWindowsFallback(parentDir, npmCmd, args) {
    const options = { cwd: parentDir, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 };
    let result = spawnSync(npmCmd, args, options);

    if (result.error && process.platform === 'win32') {
        const cmd = `${npmCmd} ${args.map(quoteForCmd).join(' ')}`;
        result = spawnSync('cmd.exe', ['/d', '/s', '/c', cmd], options);
    }

    return result;
}

function runViteScaffold(parentDir, npmCmd, scaffoldName, template) {
    const npmCreateArgs = ['--yes', 'create', 'vite@5', scaffoldName, '--', '--template', template];
    return runNpmWithWindowsFallback(parentDir, npmCmd, npmCreateArgs);
}

function runAngularScaffold(parentDir, npmCmd, scaffoldName) {
    const npmExecArgs = [
        'exec', '--yes', '--package', '@angular/cli@latest',
        'ng', 'new', scaffoldName,
        '--routing=false', '--style=css', '--ssr=false', '--defaults', '--skip-install',
    ];
    return runNpmWithWindowsFallback(parentDir, npmCmd, npmExecArgs);
}

function setupPluginBoostSubmodule(projectDir) {
    const BOOST_TAG = 'boost-1.90.0';
    const BOOST_REPO = 'https://github.com/boostorg/boost.git';
    const BOOST_REQUIRED_MODULES = [
        'json',
        'assert', 'config', 'container', 'container_hash', 'core',
        'describe', 'endian', 'mp11', 'predef', 'preprocessor',
        'static_assert', 'system', 'throw_exception', 'type_traits',
        'variant2', 'winapi', 'move', 'intrusive', 'compat',
    ];

    const gitOk = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
    if (!gitOk) {
        ui.warn('git not found; skipping Boost submodule setup.');
        return;
    }

    if (!fs.existsSync(path.join(projectDir, '.git'))) {
        const init = spawnSync('git', ['init'], { cwd: projectDir, stdio: 'pipe' });
        if (init.status !== 0) {
            ui.warn('Failed to initialize git repository; skipping Boost submodule setup.');
            return;
        }
    }

    fs.mkdirSync(path.join(projectDir, 'external'), { recursive: true });
    const boostSubmodulePath = 'external/boost';
    const boostSubmoduleDir = path.join(projectDir, boostSubmodulePath);

    const runGit = (args) => spawnSync('git', args, { cwd: projectDir, stdio: 'pipe' });
    const runGitText = (args) => {
        const r = runGit(args);
        return {
            status: r.status,
            stdout: (r.stdout || '').toString().trim(),
            stderr: (r.stderr || '').toString().trim(),
        };
    };
    const pinBoostTag = (submodulePath) => {
        const fetchTag = runGit(['-C', submodulePath, 'fetch', '--depth', '1', 'origin', `refs/tags/${BOOST_TAG}:refs/tags/${BOOST_TAG}`]);
        if (fetchTag.status !== 0) {
            const err = (fetchTag.stderr || fetchTag.stdout || '').toString().trim();
            ui.warn(`Failed to fetch Boost tag ${BOOST_TAG}.`);
            if (err) ui.warn(`git fetch tag error: ${err}`);
            return false;
        }

        const checkoutTag = runGit(['-C', submodulePath, 'checkout', '--detach', BOOST_TAG]);
        if (checkoutTag.status !== 0) {
            const err = (checkoutTag.stderr || checkoutTag.stdout || '').toString().trim();
            ui.warn(`Failed to checkout Boost tag ${BOOST_TAG}.`);
            if (err) ui.warn(`git checkout tag error: ${err}`);
            return false;
        }

        return true;
    };

    if (fs.existsSync(boostSubmoduleDir) && !fs.existsSync(path.join(projectDir, '.gitmodules'))) {
        ui.warn('Detected partial Boost submodule state; retrying with --force.');
    }

    let gitmodulesHasBoost = (() => {
        const cfg = runGitText(['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$']);
        if (cfg.status !== 0 || !cfg.stdout) return false;
        return cfg.stdout
            .split(/\r?\n/)
            .map((line) => line.trim().split(/\s+/)[1])
            .includes(boostSubmodulePath);
    })();

    const indexHasBoostGitlink = (() => {
        const ls = runGitText(['ls-files', '--stage', '--', boostSubmodulePath]);
        if (ls.status !== 0 || !ls.stdout) return false;
        return ls.stdout
            .split(/\r?\n/)
            .filter(Boolean)
            .some((line) => line.startsWith('160000 '));
    })();

    const ensureGitmodulesBoostEntry = () => {
        if (gitmodulesHasBoost) return true;

        const setPath = runGit(['config', '--file', '.gitmodules', 'submodule.external/boost.path', boostSubmodulePath]);
        const setUrl = runGit(['config', '--file', '.gitmodules', 'submodule.external/boost.url', BOOST_REPO]);
        const setBranch = runGit(['config', '--file', '.gitmodules', 'submodule.external/boost.branch', BOOST_TAG]);
        if (setPath.status !== 0 || setUrl.status !== 0 || setBranch.status !== 0) {
            ui.warn('Failed to write Boost entry to .gitmodules.');
            return false;
        }

        gitmodulesHasBoost = true;
        return true;
    };

    if (gitmodulesHasBoost || indexHasBoostGitlink) {
        if (!ensureGitmodulesBoostEntry()) return;
        ui.step(`Reusing existing Boost submodule registration (${BOOST_TAG})…`);
        const initExisting = runGit(['submodule', 'update', '--init', '--depth', '1', boostSubmodulePath]);
        if (initExisting.status !== 0) {
            const err = (initExisting.stderr || initExisting.stdout || '').toString().trim();
            ui.warn('Failed to initialize existing Boost submodule registration.');
            if (err) ui.warn(`git submodule update error: ${err}`);
            return;
        }
    } else if (!fs.existsSync(path.join(projectDir, '.gitmodules')) || !fs.existsSync(boostSubmoduleDir)) {
        ui.step(`Adding Boost submodule (${BOOST_TAG}, shallow)…`);
        const add = runGit([
            'submodule', 'add', '--force', '--depth', '1',
            BOOST_REPO, boostSubmodulePath,
        ]);
        if (add.status !== 0) {
            const err = (add.stderr || add.stdout || '').toString().trim();
            ui.warn('Failed to add Boost submodule; create plugin may not build until external/boost is available.');
            if (err) ui.warn(`git submodule add error: ${err}`);
            return;
        }
        if (!ensureGitmodulesBoostEntry()) return;
    }

    if (!pinBoostTag(boostSubmodulePath)) return;

    const tagCommit = runGitText(['-C', boostSubmodulePath, 'rev-list', '-n', '1', BOOST_TAG]);
    const headCommit = runGitText(['-C', boostSubmodulePath, 'rev-parse', 'HEAD']);
    if (tagCommit.status !== 0 || headCommit.status !== 0 || !tagCommit.stdout || !headCommit.stdout || tagCommit.stdout !== headCommit.stdout) {
        ui.warn(`Boost submodule is not pinned to ${BOOST_TAG}; refusing to continue.`);
        if (tagCommit.stderr) ui.warn(`git rev-list error: ${tagCommit.stderr}`);
        if (headCommit.stderr) ui.warn(`git rev-parse error: ${headCommit.stderr}`);
        return;
    }

    ui.step('Initializing required Boost module submodules…');
    const headerModulePaths = BOOST_REQUIRED_MODULES.map((name) => `libs/${name}`);
    const parseSubmodulePrefixes = (statusText) => {
        const prefixes = new Map();
        if (!statusText) return prefixes;
        statusText.split(/\r?\n/).filter(Boolean).forEach((line) => {
            const prefix = line[0];
            const pathToken = line.trim().split(/\s+/)[1];
            if (pathToken) prefixes.set(pathToken, prefix);
        });
        return prefixes;
    };
    const beforeModuleStatus = runGitText(['-C', boostSubmodulePath, 'submodule', 'status', ...headerModulePaths]);
    const beforePrefixes = beforeModuleStatus.status === 0
        ? parseSubmodulePrefixes(beforeModuleStatus.stdout)
        : new Map();

    const updateHeaders = runGit(['-C', boostSubmodulePath, 'submodule', 'update', '--init', '--depth', '1', ...headerModulePaths]);
    if (updateHeaders.status !== 0) {
        ui.warn(`Failed to initialize required Boost modules (${BOOST_REQUIRED_MODULES.join(', ')}).`);
        ui.warn('Run `git -C external/boost submodule update --init --depth 1 libs/json libs/assert libs/config libs/container libs/container_hash libs/core libs/describe libs/endian libs/mp11 libs/predef libs/preprocessor libs/static_assert libs/system libs/throw_exception libs/type_traits libs/variant2 libs/winapi libs/move libs/intrusive libs/compat`.');
        const err = (updateHeaders.stderr || updateHeaders.stdout || '').toString().trim();
        if (err) ui.warn(`git submodule update error: ${err}`);
        return;
    }

    const afterModuleStatus = runGitText(['-C', boostSubmodulePath, 'submodule', 'status', ...headerModulePaths]);
    const afterPrefixes = afterModuleStatus.status === 0
        ? parseSubmodulePrefixes(afterModuleStatus.stdout)
        : new Map();
    for (const modulePath of headerModulePaths) {
        const beforePrefix = beforePrefixes.get(modulePath);
        const afterPrefix = afterPrefixes.get(modulePath);
        if (beforePrefix === '-' && afterPrefix && afterPrefix !== '-') {
            ui.step(`Installed Boost module submodule: ${modulePath}`);
        }
    }

    for (const name of BOOST_REQUIRED_MODULES) {
        const materialize = runGit(['-C', `${boostSubmodulePath}/libs/${name}`, 'checkout', '-f']);
        if (materialize.status !== 0) {
            const err = (materialize.stderr || materialize.stdout || '').toString().trim();
            ui.warn(`Failed to materialize Boost module libs/${name}.`);
            if (err) ui.warn(`git checkout error: ${err}`);
            return;
        }
    }

    const modulePaths = BOOST_REQUIRED_MODULES.map((name) => `libs/${name}`);
    const submoduleStatus = runGitText(['-C', boostSubmodulePath, 'submodule', 'status', ...modulePaths]);
    if (submoduleStatus.status !== 0) {
        ui.warn('Failed to verify Boost module submodule status.');
        if (submoduleStatus.stderr) ui.warn(`git submodule status error: ${submoduleStatus.stderr}`);
        return;
    }
    const badLines = submoduleStatus.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .filter((line) => ['-', '+', 'U'].includes(line[0]));
    if (badLines.length > 0) {
        ui.warn(`Some required Boost modules are not cleanly pinned to ${BOOST_TAG}:`);
        badLines.forEach((line) => ui.warn(line));
        return;
    }
}

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

async function promptInfo(rl, extra = [], yes = false, type = '', defaultTitle = 'My RenWeb App') {
    if (yes) {
        const title = defaultTitle;
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
    const title       = await prompt(rl, 'App title', defaultTitle);
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

    if (isDirectoryNonEmpty(projectDir)) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        ui.dim('To integrate RenWeb into an existing project, run: rw init');
        process.exit(1);
    }
    fs.mkdirSync(projectDir, { recursive: true });

    const srcContent = path.join(projectDir, 'src', 'content', pageName);
    const srcAssets  = path.join(projectDir, 'src', 'assets');
    fs.mkdirSync(srcContent, { recursive: true });
    fs.mkdirSync(srcAssets,  { recursive: true });

    fetchWebApi(path.join(projectDir, 'src', 'modules', 'renweb'));

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

    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

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

    const configText = makeConfigJson(info, pageName);
    const infoText   = makeInfoJson(info, pageName);
    fs.writeFileSync(path.join(projectDir, 'info.json'),   infoText,   'utf8');
    fs.writeFileSync(path.join(projectDir, 'config.json'), configText, 'utf8');

    const buildDir = path.join(projectDir, 'build');
    fs.mkdirSync(path.join(buildDir, 'content', pageName), { recursive: true });
    fs.writeFileSync(path.join(buildDir, 'config.json'), configText, 'utf8');
    fs.writeFileSync(path.join(buildDir, 'info.json'),   infoText,   'utf8');
    fetchEngineExecutable(buildDir);

    appendGitignoreEntries(projectDir, [
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
    ]);
}


// ─── JS framework scaffolder (React / future: Vue, Svelte, …) ────────────────

async function createFramework(projectDir, info, type) {
    const pageName  = 'main';
    const fw        = VITE_FRAMEWORK[type];
    const template  = fw.template;
    const npmCmd    = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    ensureNpmAvailable(npmCmd);

    if (isDirectoryNonEmpty(projectDir)) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        ui.dim('To integrate RenWeb into an existing project, run: rw init');
        process.exit(1);
    }

    const { parent, scaffoldName, scaffoldProjectDir } = normalizeScaffoldPaths(projectDir);
    fs.mkdirSync(parent, { recursive: true });

    ui.step(`Scaffolding ${type} project via Vite…`);
    const scaffold = runViteScaffold(parent, npmCmd, scaffoldName, template);

    if (scaffold.error || scaffold.status !== 0) {
        showScaffoldFailure('Vite scaffolding', scaffold);
    }

    const scaffoldPkgPath = path.join(scaffoldProjectDir, 'package.json');
    if (scaffoldProjectDir !== projectDir && fs.existsSync(scaffoldPkgPath)) {
        moveDirectoryContents(scaffoldProjectDir, projectDir);
    }

    const pkgPath = path.join(projectDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        ui.error('Vite scaffolding failed — package.json not found.');
        const stderr = getTailText(scaffold.stderr);
        const stdout = getTailText(scaffold.stdout);
        if (stderr) ui.dim(stderr);
        else if (stdout) ui.dim(stdout);
        process.exit(scaffold.status ?? 1);
    }
    const pkg  = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.name   = toKebab(info.title);
    pkg.version = info.version || '0.0.1';

    pkg.dependencies = { ...pkg.dependencies, 'renweb-api': 'latest' };
    pkg.scripts = {
        ...pkg.scripts,
        prebuild: 'rw build --meta-only',
        start:    'rw build && rw run',
        test:     'rw run',
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

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

    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

    appendGitignoreEntries(projectDir, ['build/', 'credentials/', '.env', 'Thumbs.db', '.rw/']);

    installNpmPackages(projectDir, npmCmd);
}


async function createAngular(projectDir, info) {
    const pageName = 'main';
    const npmCmd   = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    ensureNpmAvailable(npmCmd);

    if (isDirectoryNonEmpty(projectDir)) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        ui.dim('To integrate RenWeb into an existing project, run: rw init');
        process.exit(1);
    }

    const { parent, name, scaffoldName, scaffoldProjectDir } = normalizeScaffoldPaths(projectDir);
    fs.mkdirSync(parent, { recursive: true });

    ui.step('Scaffolding Angular project…');
    const scaffold = runAngularScaffold(parent, npmCmd, scaffoldName);

    if (scaffold.error || scaffold.status !== 0) {
        showScaffoldFailure('Angular scaffolding', scaffold);
    }

    const scaffoldAngJsonPath = path.join(scaffoldProjectDir, 'angular.json');
    if (scaffoldProjectDir !== projectDir && fs.existsSync(scaffoldAngJsonPath)) {
        moveDirectoryContents(scaffoldProjectDir, projectDir);
    }

    const angJsonPath = path.join(projectDir, 'angular.json');
    if (!fs.existsSync(angJsonPath)) {
        ui.error('Angular scaffolding failed — angular.json not found.');
        const stderr = getTailText(scaffold.stderr);
        const stdout = getTailText(scaffold.stdout);
        if (stderr) ui.dim(stderr);
        else if (stdout) ui.dim(stdout);
        process.exit(scaffold.status ?? 1);
    }

    ui.step('Augmenting angular.json…');
    const angJson   = JSON.parse(fs.readFileSync(angJsonPath, 'utf8'));
    const angularProjectKey = Object.keys(angJson.projects || {})[0] || name;
    const buildOpts = angJson.projects?.[angularProjectKey]?.architect?.build?.options;
    if (buildOpts) {
        // Angular 17+: must use object form; browser:'' places assets directly in base.
        buildOpts.outputPath = { base: `build/content/${pageName}`, browser: '' };
    }
    fs.writeFileSync(angJsonPath, JSON.stringify(angJson, null, 2) + '\n', 'utf8');

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

    ui.step('Fetching licenses…');
    fetchGitHubDirectory('licenses', path.join(projectDir, 'licenses'));
    ui.step('Fetching resource files…');
    fetchGitHubDirectory('resource', path.join(projectDir, 'resource'));
    ui.step('Fetching credentials template…');
    fetchGitHubDirectory('credentials', path.join(projectDir, 'credentials'));

    appendGitignoreEntries(projectDir, ['build/', 'credentials/', '.env', 'Thumbs.db', '.rw/']);

    installNpmPackages(projectDir, npmCmd);
}

async function createPlugin(projectDir, info, skipSubmodules = false) {
    const pluginName  = info.internalName || toSnake(info.title);
    const pluginClass = info.title.replace(/[^A-Za-z0-9]/g, '');
    const includeDir  = path.join(projectDir, 'include');
    const srcDir      = path.join(projectDir, 'src');

    fs.mkdirSync(srcDir,     { recursive: true });
    fs.mkdirSync(includeDir, { recursive: true });
    fs.mkdirSync(path.join(projectDir, '.github', 'workflows'), { recursive: true });

    if (skipSubmodules) {
        ui.step('Skipping Boost submodule setup (--skip-submodules).');
    } else {
        setupPluginBoostSubmodule(projectDir);
    }

    fetchPluginHpp(includeDir);

    fs.writeFileSync(path.join(includeDir, `${pluginName}.hpp`),
        makePluginHpp(info, pluginName, pluginClass), 'utf8');

    fs.writeFileSync(path.join(srcDir, `${pluginName}.cpp`),
        makePluginCpp(info, pluginName, pluginClass), 'utf8');

    fs.writeFileSync(path.join(projectDir, 'makefile'),
        makePluginMakefile(info, pluginName), 'utf8');

    const buildAllArchsPath = path.join(projectDir, 'build_all_archs.sh');
    fs.writeFileSync(buildAllArchsPath, makePluginBuildAllArchs(pluginName), 'utf8');
    try { fs.chmodSync(buildAllArchsPath, 0o755); } catch (_) {}

    const buildForReleasePath = path.join(projectDir, 'build_for_release.sh');
    fs.writeFileSync(buildForReleasePath, makePluginBuildForRelease(), 'utf8');
    try { fs.chmodSync(buildForReleasePath, 0o755); } catch (_) {}

    fs.writeFileSync(path.join(projectDir, 'README.md'),
        makePluginReadme(info, pluginName), 'utf8');

    const pluginGitignore = makePluginGitignore()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    appendGitignoreEntries(projectDir, pluginGitignore, 'RenWeb Plugin');

    fs.writeFileSync(path.join(projectDir, '.github', 'workflows', 'build.yml'),
        makePluginWorkflow(pluginName), 'utf8');

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

    fetchWebApi(contentDir);
    fetchEngineExecutable(buildDir);
}

// ─── Engine repo cloner ───────────────────────────────────────────────────────

function createEngine(projectDir, skipSubmodules) {
    const gitOk = spawnSync('git', ['--version'], { stdio: 'ignore' }).status === 0;
    if (!gitOk) { ui.error('git is required for `rw create engine`'); process.exit(1); }

    if (isDirectoryNonEmpty(projectDir)) {
        ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
        process.exit(1);
    }

    // Ensure an empty directory exists for cloning into.
    // We clear contents rather than deleting the directory itself so that any
    // shell process whose CWD is projectDir doesn't end up with an invalid CWD.
    if (fs.existsSync(projectDir)) {
        for (const entry of fs.readdirSync(projectDir)) {
            fs.rmSync(path.join(projectDir, entry), { recursive: true, force: true });
        }
    } else {
        fs.mkdirSync(projectDir, { recursive: true });
    }

    const name    = path.basename(projectDir);
    const repoUrl = resolveEngineRepo();
    // Clone into '.' (the now-empty projectDir) rather than creating a child directory.
    const cloneArgs = skipSubmodules
        ? ['clone', repoUrl, '.']
        : ['clone', '--recurse-submodules', repoUrl, '.'];

    ui.step(`Cloning RenWeb Engine repository into ${name}/…${skipSubmodules ? '' : ' (including submodules)'}`);
    const r = spawnSync('git', cloneArgs, { cwd: projectDir, stdio: 'inherit' });
    if (r.status !== 0) { ui.error('git clone failed'); process.exit(r.status); }
}

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(args) {
    const [first, ...rest] = args;

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

    const cwd = dir || getCwdSafe();
    if (!cwd) {
        ui.error('Cannot determine working directory. Please run from a valid directory or pass --dir.');
        if (rl) rl.close();
        process.exit(1);
    }
    const projectDir = path.resolve(cwd);

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
        const info = await promptInfo(rl, [], yes, 'Plugin', 'My RenWeb Plugin');
        info.internalName = toSnake(info.title);
        if (rl) rl.close();

        ui.step(`Scaffolding plugin project at: ${projectDir}`);
        if (isDirectoryNonEmpty(projectDir)) {
            ui.error(`Directory '${path.basename(projectDir)}' already exists and is not empty.`);
            ui.dim('To integrate RenWeb into an existing project, run: rw init');
            process.exit(1);
        }
        fs.mkdirSync(projectDir, { recursive: true });
        await createPlugin(projectDir, info, skipSubmodules);
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
        const relA = relativeFromCwdOrAbsolute(projectDir);
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
        const relF = relativeFromCwdOrAbsolute(projectDir);
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
    const rel = relativeFromCwdOrAbsolute(projectDir);
    ui.nextSteps([
        ['cd ' + rel, null],
        ['rw build', 'copy src → build'],
        ['rw run', 'launch the engine'],
    ]);
    ui.dim('Tip: need npm packages? Use rw create lit for a lightweight Vite setup.');
}

module.exports = { run };
