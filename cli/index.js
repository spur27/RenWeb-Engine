#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');

const pkgPath = path.join(__dirname, 'package.json');
let version = '0.0.1';
if (fs.existsSync(pkgPath)) {
  try { version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || version; } catch (e) {}
}

const program = new Command();
program.name('rw').description('RenWeb CLI — create, develop, and package RenWeb projects').version(version);

program
  .command('create [type]')
  .description('Scaffold a new RenWeb project (default: vanilla | react | vue | svelte | preact | plugin | engine)')
  .option('--dir <path>', 'Output directory (default: cwd)')
  .option('--skip-submodules', 'Skip --recurse-submodules when cloning the engine repository (engine type only)')
  .option('--node', 'Add package.json with the renweb npm package as a dependency')
  .option('--deno', 'Add deno.json with the renweb jsr package as an import')
  .allowUnknownOption(true)
  .action((type) => {
    const idx       = process.argv.indexOf('create');
    const remaining = [type, ...process.argv.slice(idx + 2)];
    require('./commands/create').run(remaining);
  });

program
  .command('update')
  .description('Update the engine executable and/or bundle libs in an existing project')
  .option('--bundle-only',     'Only update the bundle archive (libs + launcher + exe)')
  .option('--executable-only', 'Only update the bare executable')
  .option('--version <tag>',   'Pin to a specific release tag (default: latest)')
  .action(() => {
    const idx = process.argv.indexOf('update');
    require('./commands/update').run(process.argv.slice(idx + 1));
  });

program
  .command('run')
  .description('Launch the engine (Vite projects: starts watch mode and waits for initial build first)')
  .action(() => {
    const idx = process.argv.indexOf('run');
    require('./commands/run').run(process.argv.slice(idx + 1));
  });

program
  .command('build')
  .description('Run vite build from anywhere inside a RenWeb project')
  .action(() => {
    const idx = process.argv.indexOf('build');
    require('./commands/build').run(process.argv.slice(idx + 1));
  });

program
  .command('add <type>')
  .description('Add a page or plugin: rw add page <name> | rw add plugin <repo-url>')
  .allowUnknownOption(true)
  .action((type) => {
    const idx       = process.argv.indexOf('add');
    const remaining = [type, ...process.argv.slice(idx + 2)];
    require('./commands/add').run(remaining);
  });

program
  .command('remove <type>')
  .description('Remove a page or plugin: rw remove page <name> | rw remove plugin <name>')
  .allowUnknownOption(true)
  .action((type) => {
    const idx       = process.argv.indexOf('remove');
    const remaining = [type, ...process.argv.slice(idx + 2)];
    require('./commands/remove').run(remaining);
  });

program
  .command('list [type]')
  .description('List pages and/or plugins: rw list | rw list pages | rw list plugins')
  .allowUnknownOption(true)
  .action((type) => {
    const idx       = process.argv.indexOf('list');
    const remaining = type ? [type, ...process.argv.slice(idx + 2)] : [];
    require('./commands/list').run(remaining);
  });

program
  .command('doctor')
  .description('Check environment and project health')
  .action(() => {
    require('./commands/doctor').run();
  });

program
  .command('package')
  .description('Create packages from build directory (downloads latest release assets and packages them)')
  .option('--bundle-only',        'Only process bundled engine archives (includes bundled .so libs)')
  .option('--executable-only',    'Only process bare executables (no bundled libs)')
  .option('-e, --ext <ext>',      'Output format filter, repeatable: -edeb -erpm -etar.gz -ezip (default: all formats)')
  .option('-o, --os <os>',        'Target OS filter, repeatable: -olinux -owindows (default: all)')
  .option('-a, --arch <arch>',    'Target arch filter, repeatable: -aarm64 -ax86_64 (default: all). Aliases: aarch64, armhf, x64, i686, ppc, …')
  .option('-c, --cache',          'Cache downloads in ./.package and reuse on subsequent runs')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('package');
    require('./commands/package').dispatch(process.argv.slice(idx + 1));
  });

// `in-docker` command removed — `package` runs in Docker when required.

program
  .command('doc [pages...]')
  .description('Open RenWeb docs in the default browser (rw doc js, rw doc usage, etc.; no arg = home)')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('doc');
    require('./commands/doc').run(process.argv.slice(idx + 1));
  });

program
  .command('fetch')
  .description('Download the latest RenWeb engine, bundle, plugin header, or JS/TS API files')
  .option('--executable',    'Download the engine executable + template info.json to build/')
  .option('--bundle',        'Download the engine bundle (with libs) + template info.json to build/')
  .option('--plugin',        'Download plugin.hpp to the current directory')
  .option('--api',           'Download the JS/TS API files (index.js, .ts, .d.ts, .js.map)')
  .option('--version <tag>', 'Pin to a specific release tag (default: latest)')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('fetch');
    require('./commands/fetch').run(process.argv.slice(idx + 1));
  });

program
  .command('docker <action>')
  .description('Manage the renweb-cli Docker image: build | rebuild | kill')
  .action((action) => {
    const { spawnSync } = require('child_process');
    const image     = process.env.RENWEB_IMAGE || 'renweb-cli';
    const cliDir    = __dirname;

    const actions = {
      build: () => {
        console.log(`Building Docker image '${image}'…`);
        const r = spawnSync('docker', ['build', '-t', image, cliDir], { stdio: 'inherit' });
        process.exit(r.status ?? 0);
      },
      rebuild: () => {
        console.log(`Rebuilding Docker image '${image}' (no cache)…`);
        const r = spawnSync('docker', ['build', '--no-cache', '-t', image, cliDir], { stdio: 'inherit' });
        process.exit(r.status ?? 0);
      },
      kill: () => {
        const list = spawnSync('docker', ['ps', '-q', '--filter', `ancestor=${image}`], { encoding: 'utf8' });
        const ids  = (list.stdout || '').trim().split('\n').filter(Boolean);
        if (ids.length === 0) { console.log('No running containers to kill.'); return; }
        console.log(`Killing ${ids.length} container(s)…`);
        const r = spawnSync('docker', ['kill', ...ids], { stdio: 'inherit' });
        process.exit(r.status ?? 0);
      },
    };

    if (!actions[action]) {
      console.error(`Unknown docker action '${action}'. Use: build | rebuild | kill`);
      process.exit(1);
    }
    actions[action]();
  });

program.parse(process.argv);
