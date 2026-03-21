# RenWeb Engine — GitHub Copilot Instructions

This file provides full context for AI assistants (especially Claude) when
working with the RenWeb Engine codebase. Read this completely before making
any changes to this project.

---

## Project Overview

**RenWeb Engine** is a cross-platform desktop application framework that lets
developers build native GUI applications using HTML, CSS, and JavaScript for
the frontend with a C++ backend. It is intentionally minimal: executables stay
under 2 MB and no Electron/Chromium runtimes are required.

- **Repository**: https://github.com/spur27/RenWeb-Engine
- **Version**: 0.0.7
- **License**: Boost Software License 1.0 (BSL-1.0)
- **Author**: spur27 / Spur27
- **App ID**: `io.github.spur27.renweb-engine`
- **Copyright**: Copyright © 2025 Spur27

---

## Tech Stack

### Languages

| Role | Language | Standard |
|------|----------|----------|
| Backend (Linux) | C++ via `g++` | C++20 |
| Backend (macOS) | C++ via `clang++` | C++17 (Apple limitation) |
| Backend (Windows) | C++ via `cl.exe` | C++20 |
| Frontend UI | HTML, CSS, JavaScript | (any) |
| Build system | GNU Make | — |
| CLI tool | Node.js | — |

### Platform Renderers

| Platform | Renderer | Minimum Version |
|----------|----------|-----------------|
| Linux | WebKitGTK 2.40+ | Ubuntu 22.04 / Fedora 38+ |
| macOS | WKWebView (Apple) | macOS 10.15+ (Catalina) |
| Windows | WebView2 (Microsoft) | Windows 10+ |

### External Dependencies (all in `external/`)

| Library | Path | Purpose |
|---------|------|---------|
| `webview/webview` | `external/webview/` | Cross-platform webview abstraction |
| `yhirose/cpp-httplib` | `external/cpp-httplib/` | Single-header HTTP/WebSocket server |
| `gabime/spdlog` | `external/spdlog/` | Fast structured logging |
| `Boost` (program_options + JSON) | `external/boost/` or `C:/local/boost_*` | CLI arg parsing + JSON |

---

## Annotated Project Tree

```
RenWeb-engine/
├── .github/
│   ├── instructions/                   # Copilot instruction files (applyTo scoped)
│   │   ├── copilot-instructions.md     # This file
│   │   ├── markdown.instructions.md    # Markdown content standards
│   │   └── html-css-style-color-guide.instructions.md  # Color/CSS guidelines
│   └── workflows/                      # CI/CD (Ubuntu, Fedora, Windows, macOS)
│
├── src/                                # C++ implementation files
│   ├── main.cpp                        # Entry point (WinMain on Win, main on Unix)
│   ├── app.cpp                         # App class implementation
│   ├── args.cpp                        # CLI arg parsing (Boost.program_options)
│   ├── config.cpp                      # Config class (per-page window config)
│   ├── file.cpp                        # File I/O utilities
│   ├── json.cpp                        # Boost.JSON wrapper implementation
│   ├── web_server.cpp                  # HTTP server (cpp-httplib integration)
│   ├── web_server_errors.cpp           # Error HTML page generation
│   ├── web_server_mime.cpp             # MIME type detection table
│   └── window_functions.cpp            # JS↔C++ binding implementations (90+)
│
├── include/                            # C++ header files
│   ├── app.hpp                         # App + AppBuilder (central class)
│   ├── args.hpp                        # CLI argument parsing declarations
│   ├── config.hpp                      # Config extends JSON; per-page properties
│   ├── file.hpp                        # File utility declarations
│   ├── info.hpp                        # info.json loader
│   ├── json.hpp                        # Boost.JSON wrapper class (RenWeb::JSON)
│   ├── locate.hpp                      # Library/resource path detection
│   ├── logger.hpp                      # ILogger + spdlog implementation
│   ├── plugin.hpp                      # Plugin base class + ILogger re-declaration
│   ├── web_server.hpp                  # WebServer extends IWebServer
│   ├── webview.hpp                     # Webview wraps webview::webview
│   ├── window_functions.hpp            # WindowFunctions declaration (JS↔C++ API)
│   ├── interfaces/
│   │   ├── Ilogger.hpp                 # ILogger interface (pure virtual)
│   │   ├── Iprocess_manager.hpp        # IProcessManager interface
│   │   ├── Iweb_server.hpp             # IWebServer interface
│   │   └── Iwebview.hpp                # IWebview interface
│   └── managers/
│       ├── callback_manager.hpp        # CallbackManager<K,V,Arg> template
│       ├── in_out_manager.hpp          # InOutManager<K,V,Arg> template
│       ├── plugin_manager.hpp          # PluginManager (dlopen/.dll loading)
│       └── process_manager.hpp         # ProcessManager (multi-window subprocess)
│
├── build/                              # Build output directory (git-tracked defaults)
│   ├── bundle_exec.sh                  # Bundle runtime launcher (3-tier lib resolution)
│   ├── config.json                     # Default window configuration for testing
│   ├── info.json                       # Default project metadata for testing
│   ├── lib/                            # Generic bundled shared libraries (tier-2)
│   ├── lib-x86_64/                     # Arch-specific bundled libs (tier-1 example)
│   ├── content/                        # Web content pages
│   │   ├── hello/                      # Hello world example page
│   │   ├── media/                      # Media player demo page
│   │   ├── security/                   # Security sandbox demo page
│   │   └── test/                       # Test page
│   ├── plugins/                        # Plugin .so/.dll files
│   └── resource/                       # App icons/resources
│
├── external/                           # Header-only / source third-party libraries
│   ├── boost/                          # Boost (used as Windows fallback)
│   ├── cpp-httplib/                    # Single-header HTTP server
│   ├── spdlog/                         # Logger headers
│   └── webview/                        # Webview abstraction headers
│
├── script_templates/                   # Canonical templates for bundle scripts
│   ├── bundle_exec.template.sh         # Unix template (license-only comments)
│   ├── bundle_exec.template.bat        # Windows template (license-only comments)
│   ├── bundle_exec.explanation.sh.md   # Explanation doc for Unix bundle script
│   └── bundle_exec.explanation.bat.md  # Explanation doc for Windows bundle script
│
├── docs/                               # PlantUML class diagrams (.puml)
├── web/                                # JS API definitions and example web content
├── wiki/                               # GitHub Pages wiki (home.html, api.html, etc.)
├── cli/                                # Node.js CLI tool (commands/, Dockerfile)
├── resource/                           # Windows app.manifest, app.rc
├── licenses/                           # Third-party license files
├── patches/                            # Webview patches for unmerged upstream features
│
├── makefile                            # Main GNU Make build file
├── build_all_archs.sh                  # Build for all supported architectures
├── build_for_release.sh                # Release packaging script
├── rebuild-webkit-devmode.sh           # Rebuild WebKitGTK in dev mode
├── info.json                           # Project metadata (name, version, app_id)
├── config.json                         # Default window configuration
├── compile_commands.json               # clangd / IDE support
├── package.json                        # Node.js metadata (for CLI tool)
└── BUNDLE_NOTES.md                     # Bundle system documentation
```

---

## Core Application Architecture

### `App` class (`include/app.hpp`)

The central class is `RenWeb::App`:

```cpp
class App {
    std::shared_ptr<ILogger> logger;
    JSON info;              // Loaded from info.json at startup
    Config config;          // Loaded from config.json; per-page properties
    IProcessManager procm;  // Multi-window subprocess management
    IWebview w;             // Platform webview (WKWebView/WebView2/WebKitGTK)
    IWebServer ws;          // Embedded HTTP server (cpp-httplib)
    WindowFunctions fns;    // 90+ JS↔C++ bindings
    PluginManager pm;       // Dynamic .so/.dll plugin loading
};
```

`AppBuilder` uses a fluent builder pattern with an `opts` map + `argc`/`argv`.
Key methods: `App::run()`, `App::showErrorPopup()`.

### Interface Pattern

All major components have interface base classes (prefix `I`):

| Interface | Concrete | Location |
|-----------|----------|----------|
| `ILogger` | spdlog wrapper | `include/interfaces/Ilogger.hpp` |
| `IWebview` | `Webview` | `include/interfaces/Iwebview.hpp` |
| `IWebServer` | `WebServer` | `include/interfaces/Iweb_server.hpp` |
| `IProcessManager` | `ProcessManager` | `include/interfaces/Iprocess_manager.hpp` |

---

## Configuration Files

### `info.json` Schema

```json
{
    "author": "Spur27",
    "description": "Base RenWeb engine.",
    "license": "BSL",
    "title": "RenWeb",
    "version": "0.0.7",
    "repository": "https://github.com/spur27/RenWeb-Engine",
    "category": "Utility",
    "copyright": "Copyright © 2025 Spur27",
    "app_id": "io.github.spur27.renweb-engine",
    "starting_pages": ["test"],
    "permissions": {
        "geolocation": false,
        "notifications": true,
        "media_devices": false,
        "pointer_lock": false,
        "install_missing_media_plugins": true,
        "device_info": true
    },
    "origins": ["https://www.google.com"]
}
```

Version is read from `info.json` at build time via `sed` to construct executable filenames.
**Always keep `info.json` version in sync with the build.**

### `config.json` Schema

Per-page window configuration. `__defaults__` provides fallback values for all pages:

```json
{
    "__defaults__": {
        "title_bar": true,
        "fullscreen": false,
        "keepabove": false,
        "maximize": false,
        "minimize": false,
        "opacity": 1,
        "position": { "x": 0, "y": 0 },
        "resizable": true,
        "size": { "width": 1280, "height": 840 },
        "taskbar_show": true,
        "initially_shown": false
    },
    "test": {
        "title": "Test",
        "merge_defaults": true
    }
}
```

Each page key (e.g., `"test"`) can override any `__defaults__` property.
`merge_defaults: true` merges the page's properties on top of `__defaults__`.

`Config` extends `RenWeb::JSON` (Boost.JSON wrapper). Key API:
- `getProperty(page, key)` — read page-specific property
- `setProperty(page, key, value)` — write page property
- `getDefaultProperty(key)` — read from `__defaults__`
- `setDefaultProperty(key, value)` — write to `__defaults__`
- `update(json::object)` — bulk update
- `initial_page` / `current_page` — page navigation state

---

## Build System

### `makefile` Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TOOLCHAIN` | (empty = native) | Cross-compiler prefix (e.g., `aarch64-linux-gnu`) |
| `ARCH` | auto-detected | Target architecture label (e.g., `arm64`, `x86_64`) |
| `TARGET` | `debug` | Build mode: `debug` or `release` |
| `BUNDLE` | `false` | Produce a bundled build (includes library tier) |
| `WIN7_COMPAT` | `false` | Windows 7 compatibility mode |
| `OS_NAME` | auto-detected | `linux`, `macos`, or `windows` |
| `BUILD_PATH` | `./build` | Output directory |
| `EXE_NAME` | from `info.json` | Executable base name |
| `EXE_VERSION` | from `info.json` | Executable version string |

**Critical for AI**: `BUNDLE` and `WIN7_COMPAT` are set with `ifndef` guards.
The existing environment value takes precedence over the makefile default.
When modifying makefile defaults, always use the `ifndef VAR` / `VAR := value` pattern.

### Executable Naming Convention

```
build/<name>-<version>-<os>-<arch>[.exe]
```

Example: `build/renweb-0.0.7-linux-x86_64`

Name and version are extracted from `./info.json` using `sed` at build time.

### Toolchain → Architecture Mapping (Linux cross-compile)

| `TOOLCHAIN` value | `ARCH` set to |
|-------------------|---------------|
| `arm-linux-gnueabihf` | `arm32` |
| `aarch64-linux-gnu` | `arm64` |
| `i686-linux-gnu` | `x86_32` |
| `x86_64-linux-gnu` | `x86_64` |
| `mips-linux-gnu` | `mips32` |
| `mipsel-linux-gnu` | `mips32el` |
| `mips64-linux-gnuabi64` | `mips64` |
| `mips64el-linux-gnuabi64` | `mips64el` |
| `powerpc-linux-gnu` | `powerpc32` |
| `powerpc64-linux-gnu` | `powerpc64` |
| `riscv64-linux-gnu` | `riscv64` |
| `s390x-linux-gnu` | `s390x` |
| `sparc64-linux-gnu` | `sparc64` |

macOS: `clang++` native; arch from `uname -m`.
Windows: `cl.exe`; arch from `VSCMD_ARG_TGT_ARCH` or `PROCESSOR_ARCHITECTURE`.

### Common Make Invocations

```sh
make                          # Debug build (native arch)
make TARGET=release           # Release build
make BUNDLE=true              # Build with bundled libraries
make TOOLCHAIN=aarch64-linux-gnu  # Cross-compile for arm64
make clean                    # Remove build artifacts
```

### `build_all_archs.sh`

Builds for all supported architectures on the current OS:

- **Linux**: 13 toolchains (arm32, arm64, x86_32, x86_64, mips32, mips32el,
  mips64, mips64el, powerpc32, powerpc64, riscv64, s390x, sparc64)
- **macOS**: arm64, x86_64
- **Windows**: x64, x86, arm64, arm

Options:

```sh
./build_all_archs.sh                   # Build both executables and bundles
./build_all_archs.sh --bundle-only     # Bundles only
./build_all_archs.sh --executable-only # Executables only
./build_all_archs.sh --arch arm64      # Filter to one architecture
```

---

## Bundle System (3-Tier Library Resolution)

The bundle execution script (`build/bundle_exec.sh`) resolves shared libraries
in three tiers at runtime:

```
Tier 1: ./lib-<arch>/   → architecture-specific bundled libs  (preferred)
    ↓ (if not found)
Tier 2: ./lib/          → generic bundled libs                 (fallback)
    ↓ (if not found)
Tier 3: /lib            → system libs (musl or glibc)          (last resort)
```

**musl/glibc isolation**: The script detects the host ABI by checking whether
`/lib/ld-musl-*` exists. This allows the bundle to ship libraries for both
glibc and musl targets in separate tier-1 directories.

**WebKit handling**: `WEBKIT_DISABLE_COMPOSITING_MODE=1` is set before launch.
WebKit libraries may require special `LD_PRELOAD` ordering on some systems.

The template source is `script_templates/bundle_exec.template.sh`.
The deployed copy is `build/bundle_exec.sh`. Both must be kept in sync when
making structural changes to the resolution logic.

---

## JavaScript ↔ C++ Bindings (`WindowFunctions`)

`RenWeb::WindowFunctions` (`include/window_functions.hpp`) organizes all
JS↔C++ communication into typed callback managers:

| Member (`CM*` or `IOM*`) | Type | Purpose |
|--------------------------|------|---------|
| `getsets` | `IOM` | Property getters/setters |
| `window_callbacks` | `CM` | Window management (resize, focus, etc.) |
| `log_callbacks` | `CM` | Logging from JS → spdlog |
| `filesystem_callbacks` | `CM` | File I/O, directory operations |
| `config_callbacks` | `CM` | Read/write config.json properties |
| `system_callbacks` | `CM` | OS-level calls (clipboard, shell, etc.) |
| `process_callbacks` | `CM` | Multi-window process spawn/management |
| `debug_callbacks` | `CM` | Debug utilities |
| `network_callbacks` | `CM` | HTTP/WebSocket from JS |
| `navigate_callbacks` | `CM` | Page navigation |
| `plugin_callbacks` | `CM` | Plugin invocation from JS |
| `internal_callbacks` | `CM` | Hidden API (not exposed to web content) |

Each binding uses:

```cpp
std::map<std::string, std::function<json::value(const json::value&)>>
```

where `json::value` is `boost::json::value`.

Input normalization: `processInput()` converts JS args to `json::value`.
Output wrapping: `formatOutput()` wraps results in standard response envelopes.

**Setup order**: `bindDefaults()` must run before any `set*Callbacks()` method.
`WindowFunctions::setup()` calls all category registrations in sequence.

When adding a new JS↔C++ binding:
1. Add method registration inside the appropriate `set*Callbacks()` method
2. Re-run the full setup sequence if needed
3. Never call `webview::bind()` directly outside of `WindowFunctions`

---

## Plugin System

Plugins are dynamically-loaded shared libraries (`.so` on Linux/macOS,
`.dll` on Windows) placed in `build/plugins/`.

### `Plugin` base class (`include/plugin.hpp`)

```cpp
class Plugin {
    std::string name;
    std::string internal_name;
    std::string version;
    std::string description;
    std::string repository_url;

    // Function dispatch map
    std::map<std::string, std::function<json::value(const json::value&)>> functions;
};
```

Plugins receive `std::shared_ptr<ILogger>` via constructor and use it for all
logging. JSON in/out for all function calls.

### `PluginManager` (`include/managers/plugin_manager.hpp`)

- Linux/macOS: `dlopen` / `dlsym`
- Windows: `LoadLibraryA` / `GetProcAddress`
- Factory function signature: `typedef RenWeb::Plugin* (*CreatePluginFunc)(std::shared_ptr<ILogger>)`

### Loading

Plugins are discovered from `build/plugins/` at startup. Each plugin `.so`/`.dll`
must export `CreatePlugin(std::shared_ptr<ILogger>)` returning a heap-allocated
`Plugin*`.

**Note on `ILogger` header guard**: `ILogger` is defined in
`include/interfaces/Ilogger.hpp` and *also* embedded in `include/plugin.hpp`
under `#ifdef RENWEB_ILOGGER_DEFINED`. This prevents double-definition when
plugins include only `plugin.hpp` without the full app headers.

---

## Embedded HTTP Server (`WebServer`)

`RenWeb::WebServer` extends `IWebServer`, wrapping `cpp-httplib`.

Key properties:
- `base_path` — root directory for serving web content (`build/content/`)
- `port` — HTTP port
- `ip = "127.0.0.1"` — **always loopback only**
- `ssl_cert_path`, `ssl_key_path` — optional HTTPS support
- `CallbackManager` for WebSocket message handling

The webview navigates to `http://127.0.0.1:<port>/?page=<starting_page>`.

**Security requirement**: The server binds to `127.0.0.1` only. Do **not**
change `ip` to `0.0.0.0`; the HTTP server exposes the application's internal
file system and must never be accessible over the network.

---

## Logging

`RenWeb::ILogger` interface (`include/interfaces/Ilogger.hpp`):

Methods: `trace()`, `debug()`, `info()`, `warn()`, `error()`, `critical()`, `refresh()`

Backed by `spdlog` in the main application. Plugins receive the same
`ILogger` instance via their factory function.

---

## Multi-Window Process Management

`ProcessManager` handles spawning additional windows as child processes.
Each window is a separate OS process running the same executable with different
`config.json` page parameters. `IProcessManager` is the interface;
`ProcessManager` is the concrete Linux/macOS/Windows implementation.

---

## Platform-Specific Implementation Notes

### Linux (WebKitGTK)

- Requires WebKitGTK 2.40+ (`libwebkit2gtk-4.1-dev` or equivalent)
- GTK 3/4 development headers required
- Cross-compilation uses standard GNU toolchain prefixes
- `WEBKIT_DISABLE_COMPOSITING_MODE=1` may be needed in some GPU environments
- Bundle script manages `LD_LIBRARY_PATH` and optional WebKit `LD_PRELOAD`
- `g++` with `-std=c++20` and system `--sysroot` for cross-compilation

### macOS (WKWebView)

- Uses `clang++` with `-std=c++17` (Apple's clang does not fully support C++20)
- Minimum deployment target: macOS 10.15 (`-mmacosx-version-min=10.15`)
- Supported target architectures: `arm64` (Apple Silicon), `x86_64` (Intel)
- Static linking preferred
- No `TOOLCHAIN` variable used; architecture detected via `uname -m`
- For App Store distribution, a proper `.app` bundle is required

### Windows (WebView2)

- Uses MSVC `cl.exe` (invoked from Visual Studio Developer Command Prompt)
- Requires the WebView2 runtime, which ships with Windows 10+ / Microsoft Edge
- **Boost path detection**: checks `C:/local/boost_*` first, falls back to
  `external/boost`
- Entry point is `WinMain` (not `main`); `src/main.cpp` includes the full
  Windows stdout/stderr redirection handling
- `WIN7_COMPAT=true` enables compatibility paths for older WebView2 APIs
- Architecture variants: `x64`, `x86`, `arm64`, `arm`
- No `TOOLCHAIN` variable; architecture from `VSCMD_ARG_TGT_ARCH`

---

## Web Content Structure

Web content lives in `build/content/` with one directory per page:

```
build/content/
├── hello/      index.html + assets  (hello world)
├── media/      index.html + assets  (media player demo)
├── security/   index.html + assets  (security sandbox demo)
└── test/       index.html + assets  (test page)
```

The embedded HTTP server serves from `build/content/`.
The RenWeb JS API is available as `window.renweb.*` (bindings injected by C++).
New pages must be added both here and to `config.json`.

---

## CLI Tool (`cli/`)

A Node.js CLI tool for project scaffolding and management:

- `cli/index.js` — main entry point
- `cli/commands/` — individual command implementations
- Docker support: `cli/Dockerfile`, `cli/DOCKER.md`

---

## Coding Conventions

### License Header — C++ Files

Every `.hpp` and `.cpp` file **must** begin with the full BSL-1.0 boilerplate:

```cpp
// Copyright (C) 2025 spur27
// SPDX-License-Identifier: BSL-1.0
//
// This file is part of RenWeb Engine.
//
// Boost Software License - Version 1.0 - August 17th, 2003
//
// Permission is hereby granted, free of charge, to any person or organization
// obtaining a copy of the software and accompanying documentation covered by
// this license (the "Software") to use, reproduce, display, distribute,
// execute, and transmit the Software, and to prepare derivative works of the
// Software, and to permit third-parties to whom the Software is furnished to
// do so, all subject to the following:
//
// The copyright notices in the Software and this entire statement, including
// the above license grant, this restriction and the following disclaimer,
// must be included in all copies of the Software, in whole or in part, and
// all derivative works of the Software, unless such copies or derivative
// works are solely in the form of machine-executable object code generated by
// a source language processor.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
// SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
// FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.
```

### License Header — Shell Scripts

Every `.sh` file must begin with:

```sh
#!/usr/bin/env sh
# Copyright (C) 2025 spur27
# SPDX-License-Identifier: BSL-1.0
#
# This file is part of RenWeb Engine.
# [same BSL-1.0 boilerplate text, with # prefix]
```

Shell scripts should contain **only** the license header as comments.
Inline code comments (beyond the license block) are placed in `.md` explanation
files (`script_templates/bundle_exec.explanation.sh.md` pattern).

### Namespace

All classes live in the `RenWeb` namespace. Never add code at global scope
without a compelling reason.

### JSON

Use `boost::json` exclusively throughout the project. Alias everywhere:

```cpp
namespace json = boost::json;
```

Do not introduce `nlohmann/json` or any other JSON library.

### Interfaces vs Implementations

- Interfaces: `I` prefix, pure virtual, in `include/interfaces/`
- Implementations: no prefix, in `include/` root
- Always inject `std::shared_ptr<ILogger>` — never create loggers directly in
  implementations

### `#pragma once`

All header files use `#pragma once` (not include guards).

### Error Handling

Use `try`/`catch` around platform API calls (webview, file I/O, plugin loading).
Log errors via the injected `ILogger`; never swallow exceptions silently.

---

## Claude-Specific Knowledge

The following details are particularly easy to get wrong; Claude should keep
them in mind at all times.

### makefile Guards

`BUNDLE` and `WIN7_COMPAT` are set with `ifndef`. An environment variable set
before `make` takes precedence over the makefile default. When modifying these
defaults, preserve the `ifndef` pattern:

```makefile
ifndef BUNDLE
    BUNDLE := false
endif
```

### ILogger Double-Definition

`ILogger` is intentionally defined twice:

1. `include/interfaces/Ilogger.hpp` — for the main application
2. Embedded inside `include/plugin.hpp` under `#ifdef RENWEB_ILOGGER_DEFINED`

This allows standalone plugin compilation without pulling in the entire app
header tree. Do **not** remove either definition.

### Webview bind() — Scope

Never call `webview_impl->bind()` directly outside `WindowFunctions`.
All JS↔C++ bindings must go through the `set*Callbacks()` methods and be
registered in `WindowFunctions::setup()`.

### Config JSON Key

The global default window properties live under the key `"__defaults__"` in
`config.json`. This key is special-cased in `Config::getProperty()` — it is
not a real page name.

### Bundle Script LIB_DIR Logic

When editing `build/bundle_exec.sh` or `script_templates/bundle_exec.template.sh`,
the `LIB_DIR` three-tier resolution selects from:
- `lib-${ARCH}/` (tier 1, arch-specific)
- `lib/` (tier 2, generic)
- `/lib` (tier 3, system)

The musl/glibc detection checks the **host** system's `/lib` for
`ld-musl-*` patterns — not the bundle's `lib/` directory.

### Executable Size Goal

The project intentionally targets sub-2 MB executables. Do not introduce large
static data arrays, embedded fonts, or binary resources without explicit discussion.

### HTTP Server Bind Address

`WebServer` binds to `127.0.0.1` always. This is a security requirement.
Changing it to `0.0.0.0` exposes the internal file server to the network.

### macOS C++ Standard

macOS builds use `-std=c++17`, not C++20. Code that is macOS-relevant must not
use C++20-only features (concepts, `std::format`, `std::source_location`, etc.)
without an appropriate `#if __cplusplus >= 202002L` guard.

### Windows Entry Point

`src/main.cpp` uses `WinMain` on Windows. The output is a windowed application;
there is custom stdout/stderr redirection logic at the top of `WinMain` to
support terminal output when launched from a command prompt.

### Plugin Factory Symbol

Every plugin shared library must export:

```cpp
extern "C" RenWeb::Plugin* CreatePlugin(std::shared_ptr<ILogger> logger);
```

`PluginManager` uses `dlsym`/`GetProcAddress` to find this exact symbol.

### Version Synchronization

The project version appears in:
1. `info.json` → `"version"` field (runtime use + executable filename)
2. Makefile read via `sed` at compile time

When bumping the version, update `info.json`. The makefile will automatically
pick up the new version for the executable filename.

---

## Recommended awesome-copilot Instructions

The following instruction files from
[github/awesome-copilot](https://github.com/github/awesome-copilot)
are installed or recommended for this project:

| File | Scope | Benefit |
|------|-------|---------|
| `html-css-style-color-guide.instructions.md` | `*.html, *.css, *.js` | Color palette + accessibility for web content |
| `shell.instructions.md` | `*.sh` | Shell scripting best practices for bundle scripts |
| `makefile.instructions.md` | `makefile` | GNU Make conventions and patterns |
| `security-and-owasp.instructions.md` | all | OWASP Top 10 for the HTTP server and JS bindings |
| `performance-optimization.instructions.md` | all | Performance guidance for both C++ and JS |
| `oop-design-patterns.instructions.md` | `*.cpp, *.hpp` | SOLID and GoF patterns for the C++ class hierarchy |
| `taming-copilot.instructions.md` | all | Keeps AI from making unsolicited cross-platform changes |
| `a11y.instructions.md` | `*.html, *.css` | Accessibility for the embedded web UI |
