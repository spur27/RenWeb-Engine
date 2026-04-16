#!/usr/bin/env node
const { Command } = require('commander');
const path = require('path');
const fs = require('fs');
const ui = require('./shared/ui');
const { FRAMEWORK_TYPES, ANGULAR_TYPES } = require('./shared/constants');

const APP_TYPES  = [...FRAMEWORK_TYPES, ...ANGULAR_TYPES, 'vanilla'].sort();
const OTHER_TYPES = ['plugin', 'engine'];

const pkgPath = path.join(__dirname, 'package.json');
let version = '0.0.1';
if (fs.existsSync(pkgPath)) {
  try { version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || version; } catch (e) {}
}

const program = new Command();
program
  .name('rw')
  .description('RenWeb CLI — create, develop, and package RenWeb projects')
  .option('-V, --version', 'Display version')
  .on('option:version', () => {
    ui.renwebBanner(version);
    process.exit(0);
  });

program.configureHelp({
  formatHelp: (cmd, helper) => {
    const tw  = helper.padWidth(cmd, helper);
    const hw  = helper.helpWidth || process.stdout.columns || 80;
    const out = [];

    out.push(ui.helpTitle('Usage:') + ' ' + helper.commandUsage(cmd));

    const desc = helper.commandDescription(cmd);
    if (desc) {
      out.push('');
      out.push(helper.wrap(desc, hw, 0));
    }

    const args = helper.visibleArguments(cmd);
    if (args.length) {
      out.push('');
      out.push(ui.helpTitle('Arguments:'));
      args.forEach((a) => {
        const term = helper.argumentTerm(a).padEnd(tw + 2);
        out.push('  ' + ui.helpArg(term) + ui.helpDesc(a.description || ''));
      });
    }

    const opts = helper.visibleOptions(cmd);
    if (opts.length) {
      out.push('');
      out.push(ui.helpTitle('Options:'));
      opts.forEach((o) => {
        const term = helper.optionTerm(o).padEnd(tw + 2);
        out.push('  ' + ui.helpOpt(term) + ui.helpDesc(o.description || ''));
      });
    }

    const cmds = helper.visibleCommands(cmd);
    if (cmds.length) {
      out.push('');
      out.push(ui.helpTitle('Commands:'));
      cmds.forEach((c) => {
        const term = helper.subcommandTerm(c).padEnd(tw + 2);
        out.push('  ' + ui.helpCmd(term) + ui.helpDesc(c.description()));
      });
    }

    return out.join('\n') + '\n\n';
  },
});

program
  .command('create [type]')
  .description(`Makes/bootstraps a new RenWeb project of the following types:\n   Applications: ${APP_TYPES.join(' | ')}\n   Other: ${OTHER_TYPES.join(' | ')}`)
  .option('-y, --yes', 'Skip all prompts and use defaults')
  .option('--dir <path>', 'Output directory (default: cwd)')
  .option('--skip-submodules', 'Skip --recurse-submodules when cloning the engine repository (engine type only)')
  .allowUnknownOption(true)
  .action((type) => {
    const idx       = process.argv.indexOf('create');
    const remaining = [type, ...process.argv.slice(idx + 2)];
    require('./commands/create').run(remaining);
  });

program
  .command('init [dir]')
  .description('Integrate RenWeb into an existing project (auto-detects Angular, Vite, Deno, or vanilla)')
  .option('-y, --yes', 'Skip prompts and use defaults')
  .action(() => {
    const idx = process.argv.indexOf('init');
    require('./commands/init').run(process.argv.slice(idx + 1));
  });

program
  .command('update')
  .description('Update engine for a given project')
  .option('--plugins-only', 'Only update plugins')
  .option('--version <tag>',   'Pin to a specific release tag (default: latest)')
  .action(() => {
    const idx = process.argv.indexOf('update');
    require('./commands/update').run(process.argv.slice(idx + 1));
  });

program
  .command('run')
  .description('Launch the engine')
  .action(() => {
    const idx = process.argv.indexOf('run');
    require('./commands/run').run(process.argv.slice(idx + 1));
  });

program
  .command('build')
  .description('Build the project: copies manifests, fetches engine + plugins, then delegates to the bundler or mirrors src/')
  .option('--meta-only', 'Only run the meta steps (manifests, engine, plugins) — skip the JS build; used as a prebuild hook')
  .action(() => {
    const idx = process.argv.indexOf('build');
    require('./commands/build').run(process.argv.slice(idx + 1));
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
  .option('--executable-only',    'Only process bare executables')
  .option('-e, --ext <ext>',      'Output format filter, repeatable: -edeb -erpm -etar.gz -ezip (default: all formats)')
  .option('-o, --os <os>',        'Target OS filter, repeatable: -olinux -owindows (default: all)')
  .option('-a, --arch <arch>',    'Target arch filter, repeatable: -aarm64 -ax86_64 (default: all). Aliases: aarch64, armhf, x64, i686, ppc, …')
  .option('-c, --cache',          'Cache downloads in ./.package and reuse on subsequent runs')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('package');
    require('./commands/package').dispatch(process.argv.slice(idx + 1));
  });

program
  .command('doc [pages...]')
  .description('Opens RenWeb documentation pages.\n   Pages: home | js | api | usage | cli | compilation | download | downloads | plugin | plugins')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('doc');
    require('./commands/doc').run(process.argv.slice(idx + 1));
  });

program
  .command('fetch')
  .description('Download the latest RenWeb engine, plugin header, or JS/TS API files')
  .option('--executable',    'Download the engine executable + template info.json to build/')
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
        ui.step(`Building Docker image '${image}'…`);
        const r = spawnSync('docker', ['build', '-t', image, cliDir], { stdio: 'inherit' });
        process.exit(r.status ?? 0);
      },
      rebuild: () => {
        ui.step(`Rebuilding Docker image '${image}' (no cache)…`);
        const r = spawnSync('docker', ['build', '--no-cache', '-t', image, cliDir], { stdio: 'inherit' });
        process.exit(r.status ?? 0);
      },
      kill: () => {
        const list = spawnSync('docker', ['ps', '-q', '--filter', `ancestor=${image}`], { encoding: 'utf8' });
        const ids  = (list.stdout || '').trim().split('\n').filter(Boolean);
        if (ids.length === 0) { ui.info('No running containers to kill.'); return; }
        ui.step(`Killing ${ids.length} container(s)…`);
        const r = spawnSync('docker', ['kill', ...ids], { stdio: 'inherit' });
        process.exit(r.status ?? 0);
      },
    };

    if (!actions[action]) {
      ui.error(`Unknown docker action '${action}'. Use: build | rebuild | kill`);
      process.exit(1);
    }
    actions[action]();
  });

program.parse(process.argv);
