
<p align="center">
    <a href="https://github.com/spur27/RenWeb-Engine">
        <img height=250 src="https://github.com/spur27/RenWeb-Engine/blob/main/docs/assets/renweb.png" alt="RenWeb ~ A FOSS Software SDK">
    </a>
</p>

![Ubuntu](https://github.com/SpurSlicer/RenWeb/actions/workflows/ubuntu_make_test.yml/badge.svg)
![Fedora](https://github.com/SpurSlicer/RenWeb/actions/workflows/fedora_make_test.yml/badge.svg)
![Windows](https://github.com/SpurSlicer/RenWeb/actions/workflows/windows_make_test.yml/badge.svg)
![MacOS](https://github.com/SpurSlicer/RenWeb/actions/workflows/macos_make_test.yml/badge.svg)

## Table of Contents
- [Introduction](#introduction)
## Table of Contents
- [Introduction](#introduction)
- [Compilation](#compilation)
  - [Linux](#linux)
  - [MacOS](#macos)
  - [Windows](#windows)
- [File Structure](#file-structure)
  - [Core Files](#core-files)
  - [Directory Structure](#directory-structure)
- [Configuration Files](#configuration-files)
  - [info.json](#infojson)
  - [config.json](#configjson)
- [Web Server](#web-server)
  - [File Resolution Order](#file-resolution-order)
  - [HTTP Range Requests](#http-range-requests)
- [Command Line Arguments](#command-line-arguments)
- [Credits](#credits)
- [Planned Additions](#planned-additions)
- [Known Bugs](#known-bugs)
- [License](#license)

## Introduction

RenWeb is a modern framework for building cross-platform GUI applications using web technologies (HTML, CSS, JavaScript) with a C++ backend. It combines a WebKit-based webview engine with an embedded HTTP server, providing a complete solution for creating desktop applications with web interfaces. 

The purpose of this project is to provide an easy and fun way to make creative desktop applications that work everywhere and remain simple. Customizability will always be in the end user's hands. All you will need to know in order to use this project is front-end web (this project CAN use UI npm packages just fine once they're webpacked) and... that's it! The RenWeb engine was designed to utilize dependency injection, interfaces, and composition internally, so if you want to fork this project to use your custom webserver, a different logger, even a different rendering engine, all you'll need to do is extend to an interface! Want to add your own custom functions in addition to the 90 that already exist to use in the JS? All you need to do is add one to the maps <a href="./src/window_functions.cpp">here</a> and you're good to go! What about custom settings, changing where settings are stored, changing where web content is stored, etc.? Everything is stored in `info.json` and `config.json`. That's it. 

<p align="center">
    <img height=500 src="https://github.com/SpurSlicer/RenWeb/blob/main/docs/assets/window_example_1.png" alt="Window displaying the test page">
</p>

**Key Features:**
- Embedded multi-threaded HTTP server with WebSocket support
- Full HTTP Range request support for media streaming
- Process management for multi-window applications
- Configurable window properties per page
- Built-in logging system
- Full WebGL Support
- Less-than 2mb executables
- 90 different functions added to the JS engine to interface with the desktop
- Permissions management
- Portable executable
- Uses embedded web rendering hardware to minimize bloat
- Compiles for 12 CPU architectures on linux
- Modular file structure
- Allows users to easily customize the app
- Complete process and signal control
- Seals!! (in the test page)

**Core Dependencies:**
- [webview](https://github.com/webview/webview) - Cross-platform webview library
- [spdlog](https://github.com/gabime/spdlog) - Fast C++ logging library  
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) - HTTP/HTTPS server library
- [Boost](https://www.boost.org/) - Program options and JSON parsing
- Standard C++ libraries (C++17 or later)

## Compilation

Clone with submodules:
```bash
git clone --recurse-submodules https://github.com/spur27/RenWeb-Engine.git
```
NOTE: you can remove the boost library submodule if you've installed boost as a package in linux. It's included as a submodule for convenience when compiling for windows and mac. Use version 1.82 if you install it as a package on linux!!

**Prerequisites (All Platforms):**
- C++ Compiler (g++ recommended, C++17 or later)
- [Make](https://www.gnu.org/software/make/)

### Linux

**Debian/Ubuntu:**
```bash
apt install libgtk-3-dev libwebkit2gtk-4.1-dev
apt install libgtk-3-0 libwebkit2gtk-4.1-0
apt install pkg-config libboost-all-dev
```

**Fedora/RHEL:**
```bash
dnf install gtk3-devel webkit2gtk4.1-devel
dnf install gtk3 webkit2gtk4.1
dnf install pkgconf-pkg-config boost-devel boost-static
```

**Build:**
```bash
make
```
(See the <a href="./makefile">makefile</a> to check out how cleaning, building for other architectures, and building for development/release works)

**Run:**
```bash
make run
# Or directly:
./build/renweb-0.0.4-linux-<arch>
```

### MacOS
You should be able to compile it with XCode tools (min MacOS version 10.15) and boost from either the brew cask or from the submodule.

### Windows
*Work in progress*

## File Structure

### Core Files

RenWeb looks for files relative to the executable location:

```
build/
├── renweb-0.0.4-linux-<arch>     [executable]
├── info.json                     [application metadata - required]
├── config.json        [moveable] [window configuration - auto-generated or prewritten]
├── log.txt            [moveable] [application logs - auto-generated]
├── content/           [moveable] [page content - required]
│   └── page/
│       ├── index.html
│       └── ...
├── assets/            [moveable] [shared assets]
│   └── ...
├── custom/            [moveable] [user customization - optional]
│   └── (overrides for content/assets)
├── backup/            [moveable] [fallback content - optional]
│   └── (emergency fallback files)
└── licenses/                     [license files]
    └── ...
```
- `moveable` means you can tell RenWeb where to look for these files via properties in `info.json`:
  - `log_path`, `config_path`, and `base_dir` all look in the current-directory of the RenWeb executable unless told otherwise. This mostly exists to make packaging applications more flexible.

### Directory Structure

**`content/[page_name]/`** - Page-specific content
- Each page must have an `index.html`
- Additional CSS, JS, and assets can be included
- Generated by the build system from `RenWeb-npm/src/pages/`

**`assets/`** - Shared resources
- Images, videos, audio, fonts
- Accessible from any page via `../../assets/`
- Supports HTTP Range requests for media streaming
- It supports EVERY MIME type (<a href="./src/web_server_mime.cpp">see for yourself lol</a>)

**`custom/`** - User customization directory (optional)
- Highest priority in file resolution
- Allows users to override default assets
- Enables easy theming without rebuilding

**`backup/`** - Fallback content (optional)
- Lowest priority in file resolution
- Emergency fallback if content is missing

## Configuration Files

### info.json

Application metadata file - **required** for RenWeb to run. Must be in the same directory as the executable.

**Example:**
```json
{
  "title": "RenWeb",
  "version": "0.0.4",
  "author": "Spur27",
  "description": "Base RenWeb engine",
  "license": "BSL",
  "repository": "https://github.com/spur27/RenWeb-Engine",
  "categories": ["Utility"]
  "copyright": "Copyright © 2025 Spur27",
  "app_id": "io.github.spur27.renweb",
  "starting_pages": ["test"],
  "permissions": {
    "geolocation": false,
    "notifications": true,
    "media_devices": false,
    "pointer_lock": false,
    "install_missing_media_plugins": true,
    "device_info": true
  },
  "packaging": {
    "pkg_id": "renweb",
    "resource_path": "[Immutable] path to icons",
    "config_path": "[Mutable] path to config.json", 
    "log_path": "[Mutable] path to log.txt",
    "base_path": "[Mutable] path to content, custom, backup, asset, etc.",
    "desktop_path": "[Immutable] path to sym file",
    "static_path": "[Immutable] path to executable and info.json",
    "bin_path": "[Immutable] path to wrapper executable script",
    "startup_notify": false
  },
  "origins": [
    "https://example.one",
    "http://example.two/sequel"
  ],
  "server": {
    "ip": "127.0.0.1",
    "port": 8270,
    "https": false,
    "ssl_cert_path": "/absolute/path/example",
    "ssl_key_path": "./relative/path/example"
  }
}
```

**Required Fields:**
- `title` - Application name (displayed with `-v` flag)
- `version` - Application version
- `starting_pages` - Array of page names to open on launch (or single string). These open when the program is initially launched

**Optional Fields:**
- `author` - Creator name
- `description` - Application description
- `license` - License type
- `repository` - Source repository URL (used for auto updating (when this is implemented))
- `category` - Application category (used for packaging)
- `copyright` - Copyright notice
- `appId` - Unique application identifier (used for packaging)
- `config_path` - Path to config.json (defaults to `./config.json`)
- `log_path` - Path to log file (defaults to `./log.txt`)
- `base_path` - Base directory for content/assets/custom/backup folders (defaults to `.`)
- `permissions` - WebView permissions object
  - `geolocation` - Allow location access
  - `notifications` - Allow desktop notifications
  - `media_devices` - Allow camera/microphone
  - `pointer_lock` - Allow mouse pointer locking
  - `install_missing_media_plugins` - Auto-install codecs
  - `device_info` - Allow hardware information access
- `packaging` - Contains paths and info for where to find files
  - `pkg_id` - Unused in app; only used by packaging tools
  - `resource_path` - Unused in app; only used by packaging tools
  - `config_path` - USED in app AND packaging tools: tells app where to find and write to config file
  - `log_path` - USED in app AND packaging tools: tells app where to find and write to log file
  - `base_path` - USED in app AND packaging tools: tells app where to look for `content`, `assets`, `backup`, and `custom` directories.
  - `desktop_path` - Unused in app; only used by packaging tools
  - `static_path` - Unused in app; only used by packaging tools
  - `bin_path` - Unused in app; only used by packaging tools
  - `startup_notify` - Unused in app; only used by packaging tools
- `origins` - Contains array of base urls with protocols
- `web_server`
  - `ip` - IP address for webserver (default is 127.0.0.1)
  - `port` - Port (default is random)
  - `https` - Boolean that enables HTTPS as opposed to http
  - `ssl_cert_path` - HTTPS only - path to SSL certificate file
  - `ssl_key_path` - HTTPS only - path to SSL key

__NOTE:__ Should you set the path for `config_path`, `log_path`, or `base_path`, relative paths are interpreted *relative to wherever the executable is stored*. Similarly, the default paths used when values aren't provided is `./`. meaning the same directory as the executable. If `base_path` is set in `packaging`, then that will be used as the relative path and default directory for when the client requests the application directory.
- It is recommended not to touch any `packaging.*` properties unless you have a good reason.
- `ssl_cert_path` and `ssl_key_path` search from `base_path` when they are relative. Both are required only for HTTPS; fallback to HTTP is automatic when things go wrong.

### config.json

Window configuration file - auto-generated if missing. Stores per-page window settings and global defaults.

**Example:**
```json
{
  "__defaults__": { ... },
  "test": {
    "__defaults__": { ... },
    "decorated": true,
    "size": {
      "width": 720,
      "height": 480
    },
    "position": {
      "x": 100,
      "y": 100
    },
    "keepabove": false,
    "resizable": true,
    "minimize": false,
    "maximize": false,
    "fullscreen": false,
    "taskbar_show": true,
    "opacity": 1.0,
    "initially_shown": true,
    "title": "RenWeb"
  },
}
```

**Per-Page Settings:**

All window properties are get/set-able via the client API:

- `title` (string) - Window title text (optional, per-page only; overrides title in `info.json`)
- `decorated` (boolean) - Show window title bar and borders
- `size` (object) - Window dimensions
  - `width` (number) - Window width in pixels
  - `height` (number) - Window height in pixels
- `position` (object) - Window position on screen
  - `x` (number) - X coordinate in pixels
  - `y` (number) - Y coordinate in pixels
- `keepabove` (boolean) - Keep window on top of others
- `resizable` (boolean) - Allow window resizing
- `minimize` (boolean) - Window minimized state
- `maximize` (boolean) - Window maximized state
- `fullscreen` (boolean) - Window fullscreen state
- `taskbar_show` (boolean) - Show window in taskbar/dock
- `opacity` (number) - Window opacity (0.0 = transparent, 1.0 = opaque)
- `initially_shown` (boolean) - Show window immediately on load (if `false`, must call `Window.show()`)

**Note:** 
- Settings are automatically saved when changed via the client API
- Any property not specified in a page's config inherits from `__defaults__`
- If `__defaults__` is not specified, hardcoded defaults are used
- `title` is page-specific and cannot be set in `__defaults__`

### File Resolution Order

When handling GET requests, the server searches in this order:

1. **`custom/[page_name]/[file]`** - User customization (highest priority)
2. **`content/[page_name]/[file]`** - Page-specific content
3. **`[file]`** - Root directory (for assets, info.json, etc.)
4. **`backup/[page_name]/[file]`** - Fallback content (lowest priority)

**Example:** Request for `/assets/logo.png` on page "test"
1. Checks `custom/test/assets/logo.png`
2. Checks `content/test/assets/logo.png`  
3. Checks `assets/logo.png`
4. Checks `backup/test/assets/logo.png`
5. Returns 404 if not found

This allows users to customize your application by placing files in `custom/` without modifying the original content.


## Command Line Arguments

```
Available Options:
  -h, --help                     Display help information
  -v, --version                  Display version from info.json
  
Logging:
  -s, --log-silent             Suppress console log output
  -l, --log-level <n>          Set log level (0=trace, 5=critical, default=2)
  -c, --log-clear              Clear log.txt before starting
    
Pages:
  -P, --pages <name> [names...] Open specific page(s) (default from info.json)
```
## Credits

This repository uses the following open-source libraries:

- [cpp-httplib](https://github.com/yhirose/cpp-httplib) - HTTP/HTTPS server library - [MIT License](./external/cpp-httplib/LICENSE)
- [spdlog](https://github.com/gabime/spdlog) - Fast C++ logging library - [MIT License](./external/spdlog/LICENSE)
- [webview](https://github.com/webview/webview) - Cross-platform webview library - [MIT License](./external/webview/LICENSE)
- [Boost](https://www.boost.org/) - C++ libraries (Program Options, JSON, Process) - [Boost Software License](https://www.boost.org/LICENSE_1_0.txt)

## Planned Additions
- Windows and Apple are still a WIP, so having these fully implmented at some point would be nice.
- Auto-Updating by checking the repository URI in `info.json`
- Full unit testing (planning on using gtest at some point)
- More fool-proof testing

## Known Bugs
- The dreaded flashbang (white flash when opening). 
  - You can avoid it by setting `initially_shown` to false and then running `window.onload = await BIND_show()` (or by using it properly via the `api`). View the <a href="./web/example/pages/test">project example</a> to see how it does this.
  - Problem on MacOS 10.15 and will likely persist on applications with lesser hardware
- `print_page` doesn't work on mac (prints blank screen)
- Very limited functionality in windows (WIP)
- Apple has different empty window screen flash when `initially_shown` is true for a page.
- Server ports are never considered used

## Planned Activities
✅ Disable internet connectivity of the RenWeb Webview instance
  - This will be my approach to security
  - Implementation could be CORS enforcement in webview or proxy funneling
- Add binding to get info (if one doesn't already exist)
- Look into an improved approach over the webserver
✅ Look into webview CORS (would be rad if it exists)
- Fully  implement windows
- Finish packaging tool
✅ Change webserver IP and Port to be set in info.json
  - Maybe revise all program options and see what's even necessary

## License

Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.