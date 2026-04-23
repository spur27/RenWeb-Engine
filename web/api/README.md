<p align="center">
    <a href="https://github.com/spur27/RenWeb-Engine">
        <img height=300 src="https://github.com/spur27/RenWeb-Engine/blob/main/docs/assets/renweb.png" alt="RenWeb ~ A FOSS Software SDK">
    </a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/license-BSL--1.0-9333EA?style=flat-square" alt="License">
    <img src="https://img.shields.io/badge/node-%3E%3D16-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js ≥16">
    <img src="https://img.shields.io/npm/v/renweb-api?style=flat-square&color=CB3837&logo=npm&logoColor=white" alt="npm">
    <a href="https://jsr.io/@spur27/renweb-api"><img src="https://jsr.io/badges/@spur27/renweb-api" alt="JSR"></a>
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

## renweb-api

The official TypeScript/JavaScript API package for [RenWeb Engine](https://github.com/spur27/RenWeb-Engine). Provides typed bindings, interfaces, and utility functions for the `window.renweb.*` runtime available inside RenWeb desktop application pages.

## Installation

**npm:**
```sh
npm install renweb-api
```

**Deno / JSR:**
```sh
deno add @spur27/renweb-api
```

Or fetch the files directly with the CLI:
```sh
rw fetch api
```

## Usage

```typescript
import * as RenWeb from "renweb-api";

// Wait for the engine runtime to be ready
(window as RenWeb.RenWebWindow).renweb.onReady = async () => {
    const size = await RenWeb.Properties.getSize();
    console.log(`Window: ${size.width}x${size.height}`);

    await RenWeb.Window.changeTitle("My App");

    const home = await RenWeb.FS.readFile("data/config.txt");
    console.log(home);
};
```

## API Namespaces

| Namespace | Description |
|-----------|-------------|
| `Properties` | Get/set window properties: size, position, title bar, opacity, fullscreen, resizable, etc. |
| `Window` | Window management: show/hide, focus, change title, open new windows |
| `Log` | Send log messages to the C++ backend (trace, debug, info, warn, error, critical) |
| `FS` | Filesystem operations: read/write files, list directories, path utilities |
| `Config` | Read and write values in `config.json` at runtime |
| `System` | System-level calls: clipboard, shell commands, notifications, system info |
| `Debug` | Debug utilities for inspecting the runtime environment |
| `Network` | HTTP requests and WebSocket connections from the frontend |
| `Application` | Application lifecycle: close, hide, restart |
| `Navigate` | Navigate between pages within the RenWeb application |
| `Utils` | Helper functions: `encode` and `decode` for base64 data exchange with C++ |

## Types

- `RenWebWindow` — extends `Window` with the `renweb` runtime object
- `RenWebCallbacks` — interface for lifecycle callbacks (`onReady`, etc.)

## License

Copyright (C) 2025 spur27 — [Boost Software License 1.0](https://github.com/spur27/RenWeb-Engine/blob/main/licenses/LICENSE)
