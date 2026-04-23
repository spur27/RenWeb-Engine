<p align="center">
    <a href="https://github.com/spur27/RenWeb-Engine">
        <img height=300 src="https://github.com/spur27/RenWeb-Engine/blob/main/docs/assets/renweb.png" alt="RenWeb ~ A FOSS Software SDK">
    </a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/license-BSL--1.0-9333EA?style=flat-square" alt="License">
    <img src="https://img.shields.io/badge/node-%3E%3D16-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js ≥16">
    <img src="https://img.shields.io/npm/v/renweb-cli?style=flat-square&color=CB3837&logo=npm&logoColor=white" alt="npm">
</p>

<p align="center">
  <a href="https://spur27.github.io/RenWeb-Engine/?page=home"><img src="https://img.shields.io/badge/Home-EF233C?style=for-the-badge" alt="Home"></a>
  <a href="https://spur27.github.io/RenWeb-Engine/?page=downloads"><img src="https://img.shields.io/badge/Downloads-F77F00?style=for-the-badge" alt="Downloads"></a>
  <a href="https://spur27.github.io/RenWeb-Engine/?page=usage"><img src="https://img.shields.io/badge/Usage-22BB44?style=for-the-badge" alt="Usage"></a>
  <a href="https://spur27.github.io/RenWeb-Engine/?page=compilation"><img src="https://img.shields.io/badge/Compilation-0AADCC?style=for-the-badge" alt="Compilation"></a>
  <a href="https://spur27.github.io/RenWeb-Engine/?page=cli"><img src="https://img.shields.io/badge/CLI%20Tool-0070F3?style=for-the-badge" alt="CLI Tool"></a>
  <a href="https://spur27.github.io/RenWeb-Engine/?page=api"><img src="https://img.shields.io/badge/JS%20API-9333EA?style=for-the-badge" alt="JS API"></a>
  <a href="https://spur27.github.io/RenWeb-Engine/?page=plugins"><img src="https://img.shields.io/badge/Plugin%20API-DB2777?style=for-the-badge" alt="Plugin API"></a>
</p>

## renweb-cli

The official CLI tool for [RenWeb Engine](https://github.com/spur27/RenWeb-Engine) — scaffold, develop, build, and package cross-platform desktop applications from the command line.

## Installation

```sh
npm install -g renweb-cli
```

## Commands

| Command | Description |
|---------|-------------|
| `rw create [type]` | Scaffold a new RenWeb project (app or plugin) |
| `rw init [dir]` | Integrate RenWeb into an existing project |
| `rw run` | Launch the engine for the current project |
| `rw build` | Build the project (copy manifests, fetch engine and plugins, run bundler) |
| `rw update` | Update the engine for the current project |
| `rw doctor` | Check environment and project health |
| `rw package` | Package build output into distributable archives (.deb, .rpm, .zip, .tar.gz) |
| `rw doc [pages...]` | Open RenWeb documentation pages in a browser |
| `rw fetch [verb]` | Download engine assets (executable, plugin headers, JS/TS API files) |
| `rw docker <action>` | Manage the renweb-cli Docker image (build, rebuild, kill, delete) |

## Project Types (`rw create`)

**Applications:** Angular, Vite, Deno, vanilla, and Angular variants.

**Other:** `plugin` — scaffold a new C++ plugin, `engine` — clone the full engine repository.

## Features

- Zero-config project scaffolding for popular frontend frameworks
- Automatic engine and plugin fetching from GitHub releases
- Cross-platform packaging: `.deb`, `.rpm`, `.tar.gz`, `.zip`
- Architecture and OS filters for targeted packaging
- Docker support for isolated build environments
- Inline documentation viewer (`rw doc`)

## Usage Examples

```sh
# Create a new vanilla RenWeb app
rw create vanilla

# Create an Angular app and skip prompts
rw create angular --yes

# Build and package for Linux x86_64 as .deb
rw build
rw package -olinux -ax86_64 -edeb

# Fetch the latest engine executable
rw fetch executable

# Check environment health
rw doctor
```

## License

Copyright (C) 2025 spur27 — [Boost Software License 1.0](https://github.com/spur27/RenWeb-Engine/blob/main/licenses/LICENSE)
