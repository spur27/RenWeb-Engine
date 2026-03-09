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
  .command('create <type>')
  .description('Scaffold a new RenWeb project (vanilla | react | vue | svelte | preact | plugin | repo)')
  .option('--dir <path>', 'Output directory (default: cwd)')
  .allowUnknownOption(true)
  .action((type) => {
    const idx       = process.argv.indexOf('create');
    const remaining = [type, ...process.argv.slice(idx + 2)];
    require('./commands/create').run(remaining);
  });

program
  .command('init')
  .description('Add RenWeb to an existing Vite/vanilla project in the current directory')
  .option('--type <type>', 'Project type: vanilla | react | vue | svelte | preact (auto-detected if omitted)')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('init');
    require('./commands/init').run(process.argv.slice(idx + 1));
  });

program
  .command('update')
  .description('Update the engine executable and/or web API in an existing project')
  .option('--engine-only', 'Only update the engine executable')
  .option('--api-only',    'Only update the web API files')
  .action(() => {
    const idx = process.argv.indexOf('update');
    require('./commands/update').run(process.argv.slice(idx + 1));
  });

program
  .command('run')
  .description('Kill any tracked engine instance and relaunch it')
  .option('--page <name>', 'Override the starting page for this run')
  .action(() => {
    const idx = process.argv.indexOf('run');
    require('./commands/run').run(process.argv.slice(idx + 1));
  });

program
  .command('build')
  .description('Run vite build from anywhere inside a RenWeb project')
  .option('-w, --watch', 'Run in watch mode (continuous rebuild)')
  .action(() => {
    const idx = process.argv.indexOf('build');
    require('./commands/build').run(process.argv.slice(idx + 1));
  });

program
  .command('plugin <subcommand>')
  .description('Manage plugins: add <repo-url> | remove <name> | list')
  .allowUnknownOption(true)
  .action((subcommand) => {
    const idx       = process.argv.indexOf('plugin');
    const remaining = [subcommand, ...process.argv.slice(idx + 2)];
    require('./commands/plugin').run(remaining);
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
  .option('-c, --cache',          'Cache downloads in ./.package and reuse on subsequent runs')
  .allowUnknownOption(true)
  .action(() => {
    const { spawnSync, spawn } = require('child_process');
    const path = require('path');

    function normalizePathForDocker(p) {
      if (process.platform !== 'win32') return p;
      const m = p.match(/^([A-Za-z]):\\?(.*)$/);
      if (!m) return p.replace(/\\/g, '/');
      const drive = m[1].toLowerCase();
      const rest = m[2].replace(/\\/g, '/');
      return `/${drive}/${rest}`;
    }

    const idx = process.argv.indexOf('package');
    const remaining = process.argv.slice(idx + 1);

    // If already executing inside the container, run the package logic directly
    if (process.env.IN_DOCKER === '1') {
      require('./commands/package').run(remaining);
      return;
    }

    // Require Docker to run packaging. If Docker is missing, fail with a clear error.
    let dockerOk = false;
    try { dockerOk = spawnSync('docker', ['--version'], { stdio: 'ignore' }).status === 0; } catch (e) { dockerOk = false; }
    if (!dockerOk) {
      console.error('docker is required to run `package`. Please install Docker and try again.');
      process.exit(2);
    }

    // Docker is present — proceed.
    if (dockerOk) {
      const hostDir    = normalizePathForDocker(path.resolve(__dirname));
      const hostCwd    = normalizePathForDocker(path.resolve(process.cwd()));
      const image = process.env.RENWEB_IMAGE || 'renweb-cli';

      // Check if the image exists locally; if not, build it from the project Dockerfile
      let imageExists = false;
      try {
        const inspect = spawnSync('docker', ['images', '-q', image], { encoding: 'utf8' });
        imageExists = Boolean(inspect.stdout && inspect.stdout.trim().length > 0);
      } catch (e) { imageExists = false; }

      if (!imageExists) {
        console.log(`Docker image '${image}' not found locally — building it now.`);
        const buildRes = spawnSync('docker', ['build', '-t', image, path.resolve(__dirname)], { stdio: 'inherit' });
        if (buildRes.status !== 0) {
          console.error('Failed to build docker image; cannot continue.');
          process.exit(buildRes.status || 3);
        }
      }

      // Pre-create .package/ in the user's cwd so it is owned by the current
      // user before the container starts. Warn cleanly if root owns it already.
      if (process.platform !== 'win32') {
        const pkgCache = path.join(process.cwd(), '.package');
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

      // Run the container as the current host user so output files are owned by
      // the caller rather than root (avoids needing sudo to delete/modify them).
      const userFlag = process.platform !== 'win32'
        ? ['--user', `${process.getuid()}:${process.getgid()}`]
        : [];
      // Mount the user's cwd at /project (rw). The CLI itself is baked into
      // the image at /work — no volume mount needed for it.
      // RENWEB_CWD tells package.js where to find build/ and write output.
      const containerName = `renweb-pkg-${Date.now()}`;
      const dockerArgs = [
        'run', '--rm',
        '--name', containerName,
        '-e', 'IN_DOCKER=1',
        '-e', 'RENWEB_CWD=/project',
        ...userFlag,
        '-v', `${hostCwd}:/project`,
        '-w', '/project',
        image,
        'package', ...remaining,
      ];

      // Kill the container on Ctrl+C / SIGTERM so it doesn't linger.
      function killContainer() {
        try { spawnSync('docker', ['kill', containerName], { stdio: 'ignore' }); } catch (_) {}
      }
      process.on('SIGINT',  killContainer);
      process.on('SIGTERM', killContainer);

      const child = spawn('docker', dockerArgs, { stdio: 'inherit' });
      child.on('exit', (code, signal) => {
        process.off('SIGINT',  killContainer);
        process.off('SIGTERM', killContainer);
        process.exit(code ?? (signal ? 1 : 0));
      });
    }

    // unreachable: docker presence already enforced above
  });

// `in-docker` command removed — `package` runs in Docker when required.

program
  .command('doc')
  .description('Open the RenWeb documentation in the default browser')
  .option('--js',     'Open the JS API reference page')
  .option('--plugin', 'Open the plugin development reference page')
  .allowUnknownOption(true)
  .action(() => {
    const idx = process.argv.indexOf('doc');
    require('./commands/doc').run(process.argv.slice(idx + 1));
  });

program
  .command('fetch')
  .description('Download the latest RenWeb engine, bundle, plugin header, or JS/TS API files')
  .option('--executable', 'Download the latest engine executable + template info.json to build/')
  .option('--bundle',     'Download the latest engine bundle (with libs) + template info.json to build/')
  .option('--plugin',     'Download plugin.hpp to the current directory')
  .option('--api',        'Download the JS/TS API files (index.js, .ts, .d.ts, .js.map) to the current directory')
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
