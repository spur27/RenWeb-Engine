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
program.name('renweb-tools').description('RenWeb packaging tools').version(version);

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
    const { spawnSync } = require('child_process');
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
      const dockerArgs = [
        'run', '--rm',
        '-e', 'IN_DOCKER=1',
        '-e', 'RENWEB_CWD=/project',
        ...userFlag,
        '-v', `${hostCwd}:/project`,
        '-w', '/project',
        image,
        'package', ...remaining,
      ];
      const r = spawnSync('docker', dockerArgs, { stdio: 'inherit' });
      process.exit(r.status || 0);
    }

    // unreachable: docker presence already enforced above
  });

// `in-docker` command removed — `package` runs in Docker when required.

program.parse(process.argv);
