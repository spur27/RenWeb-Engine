# Docker packager

The `package` command always runs inside a Docker container so that every
native packaging tool is available regardless of the host OS.

## What the image provides

| Tool | Purpose |
|------|---------|
| `fpm` (ruby gem) | Linux: `.deb`, `.rpm`, `.pkg.tar.zst` (pacman), `.apk`, FreeBSD `.txz` |
| `makensis` (NSIS) | Windows: one-click NSIS installer (`.exe`) |
| `wine64` + `rcedit` | Windows: patches PE version info & icon into `.exe` before NSIS |
| `msitools` | Windows: MSI creation (via `wixl`) |
| `genisoimage` / `xorrisofs` | macOS: HFS+-extended ISO used as `.dmg` |
| `tar` / `zip` | All platforms: portable `.tar.gz` and `.zip` archives |
| `p7zip` | Extra archive support |
| `icoutils` | Convert PNG/SVG → `.ico` for Windows packaging |
| `osslsigncode` | Code-sign Windows executables with an Authenticode certificate |
| `mingw-w64` | Cross-compilation helpers (`windres`, etc.) |
| `dpkg-dev` / `rpm` / `rpmdevtools` | Low-level Linux package helpers used by fpm |

## Build the image

```bash
docker build -t renweb-cli:latest .
```

> The first build takes a few minutes — Wine64 and fpm gem install are the
> slowest steps.  The resulting image is ~1.5 GB.

## Run the packager

```bash
# Mount your project directory and run package
docker run --rm \
  -e IN_DOCKER=1 \
  -v "$(pwd)":/work \
  -w /work \
  renweb-cli:latest \
  package

# With flags
docker run --rm -e IN_DOCKER=1 -v "$(pwd)":/work -w /work renweb-cli:latest \
  package --cache -olinux -edeb -erpm

# Via npm (builds/reuses the image automatically, passes args through)
npm start              # -> node index.js package -c
npm start -- -olinux  # -> node index.js package -c -olinux
```

## CLI flags

| Flag | Description |
|------|-------------|

| `--executable-only` | Only process bare executables |
| `-e<ext>` | Filter output formats, e.g. `-edeb -erpm -ezip -ensis -edmg` |
| `-o<os>` | Filter by OS, e.g. `-olinux -owindows -omacos` |
| `-c` / `--cache` | Cache downloads in `./.package/`; reuse on next run |

## Output layout

```
release/
  linux/
    {name}-{version}-linux-{arch}.tar.gz
    {name}-{version}-linux-{arch}.zip
    {name}-{version}-linux-{arch}.deb
    {name}-{version}-linux-{arch}.rpm
    {name}-{version}-linux-{arch}.pkg.tar.zst
    {name}-{version}-linux-{arch}.txz
  windows/
    {name}-{version}-windows-{arch}.tar.gz
    {name}-{version}-windows-{arch}.zip
    {name}-{version}-windows-{arch}-setup.exe
  macos/
    {name}-{version}-macos-{arch}.tar.gz
    {name}-{version}-macos-{arch}.zip
    {name}-{version}-macos-{arch}.dmg
```
