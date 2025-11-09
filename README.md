
<!-- [![RenWeb ~ a FOSS Software SDK](docs/assets/renweb.png)](https://github.com/SpurSlicer/Mauve) -->
<p align="center">
    <a href="https://github.com/SpurSlicer/Mauve">
        <img height=250 src="https://github.com/SpurSlicer/RenWeb/blob/main/docs/assets/renweb.png" alt="Renweb ~ A FOSS Software SDK">
    </a>
</p>

![Ubuntu](https://github.com/SpurSlicer/RenWeb/actions/workflows/ubuntu_make_test.yml/badge.svg)
![Fedora](https://github.com/SpurSlicer/RenWeb/actions/workflows/fedora_make_test.yml/badge.svg)
![Windows](https://github.com/SpurSlicer/RenWeb/actions/workflows/windows_make_test.yml/badge.svg)
![MacOS](https://github.com/SpurSlicer/RenWeb/actions/workflows/macos_make_test.yml/badge.svg)
<!-- ![Debian](https://github.com/SpurSlicer/RenWeb/actions/workflows/debian_make_test.yml/badge.svg) -->
<!-- ![GitHub tag (latest SemVer)](https://img.shields.io/github/v/tag/SpurSlicer/RenWeb?sort=semver) -->

- [Introduction (OUTDATED: Update to readme is a WIP)](#introduction-outdated-update-to-readme-is-a-wip)
- [Compilation](#compilation)
  - [Linux](#linux)
  - [MacOS](#macos)
  - [Windows](#windows)
- [File Structure](#file-structure)
  - [`assets` and `content`](#assets-and-content)
  - [`custom`](#custom)
  - [`config.json`](#configjson)
  - [`log.txt`](#logtxt)
  - [`renweb_app`](#renweb_app)
- [Server-Side Design](#server-side-design)
  - [Program Arguments](#program-arguments)
  - [Default Configuration](#default-configuration)
  - [Logging](#logging)
  - [Windows](#windows-1)
- [Client Design](#client-design)
- [Q\&A](#qa)
- [Reminders](#reminders)
- [Planned Additions](#planned-additions)
- [Credits](#credits)
- [License](#license)


## Introduction (OUTDATED: Update to readme is a WIP)

__*(Currently working on windows compilation)*__

RenWeb is a combined engine and toolset for developing GUI applications with web technology written mostly in C++. The most effective way to use this technology is to fork or clone this repository and develop your GUI application from there so that you have control over both the C++ RenWeb engine and your webpages. This also allows for you to add or remove settings, JavaScript engine bindings, etc. with ease.
<p align="center">
        <img height=500 src="https://github.com/SpurSlicer/RenWeb/blob/main/docs/assets/window_example_1.png" alt="Window displaying the test page">
</p>

The RenWeb engine is built with multithreaded web server,  a process manager, all main window technologies, a logger, and more! It takes on a portable structure, searching for files in whatever directory it is placed in. In addition, RenWeb aims to provide full support for *front-end* node libraries as well as JS frameworks like react, offering for more sophisticated development.

The RenWeb engine relies on the following:
- <a href="https://github.com/webview/webview">webview</a> (*submodule*)
- <a href="https://github.com/gabime/spdlog">spdlog</a> (*submodule*)
- <a href="https://github.com/nlohmann/json">nlohmann's JSON library</a> (*submodule*)
- <a href="https://www.boost.org/">Boost libraries</a>
- <a href="https://en.cppreference.com/w/cpp/standard_library.html">Standard libraries</a>

For compiling the engine, RenWeb uses <a href="https://www.gnu.org/software/make/">make</a>. For building UIs, RenWeb uses <a href="https://nodejs.org/en">node</a> *only* for webpacking, TypeScript compilation, and script running via the package.jsons.

In order to use node modules for UI design (or anything like react), RenWeb needs to use a webpacker to essentially pre-process all web content into something the webview engine can read and display. RenWeb always tries to compile to standalone JS, HTML, CSS, and resource files in order to promote customizability for users of RenWeb-made applications. Customization is further discussed in it's specific section along the UI design process.

## Compilation
Clone with `git clone --recurse-submodules https://github.com/SpurSlicer/RenWeb.git`. \
Every OS needs you to install the following:
- *Download and install A C++ Compiler* 
  - `g++` is recommended and is used by the makefile by default 
- *Download and install* <a href="https://nodejs.org/en/download">Node</a>
- *Download and install* <a href="https://www.gnu.org/software/make/">Make</a>

Run the following *from the project root*:
- `npm install && cd ./scripts && npm install`
- `cd ../src && npx tsc && cd ../`
- `npm run build` 
  - **NOTE:** This command is used to rebuild your UI designs (pages) after you make changes

Now, install the required technologies to compile the executable

### Linux
- **Debian-based**
  - `apt install libgtk-3-dev libwebkit2gtk-4.1-dev`
  - `apt install libgtk-3-0 libwebkit2gtk-4.1-0`
  - `apt install pkg-config`
  - `apt install libboost-all-dev`
- **Fedora-based**
  - `dnf install gtk3-devel webkit2gtk4.1-devel`
  - `dnf install gtk3 webkit2gtk4.1`
  - `dnf install pkgconf-pkg-config`
  - `dnf install boost-devel boost-url`
- **Other:**
  - *Download and install* <a href="">gtk3</a>
  - *Download and install* <a href="">webkit2</a>
  - *Download and install* <a href="">pkg-config</a>
  - *Download and install* <a href="https://www.boostlibraries.org/users/download/">All Boost Libraries</a>
  - *Make sure C Standard Libraries are installed*

### MacOS
*<p style="color: red">WIP</p>*
*In progress:* https://github.com/WebKit/webkit/blob/main/ReadMe.md#getting-the-code
### Windows
*<p style="color: red">WIP</p>*

Finally,  *from the project root*, run:
- `cd ./engine`
- `make run`

This should open the test page seen in the image above.

## File Structure
**NOTE:** The makefile and build scripts will setup the build directory correctly by default, meaning you should rarely have to manually go in and edit it. Here are the files and directories the RenWeb executable looks for:
```
.
└── build/
    ├── assets/     [autogenerated by webpacker]
    │   ├── example.png
    │   └── example2.png
    ├── content/    [autogenerated by webpacker]
    │   ├── page1/
    │   └── page2/
    │       ├── index.html
    │       ├── style.css
    │       └── script.js
    ├── custom [optional]/
    │   └── example2.png
    ├── config.json [initially generated by renweb_app]
    ├── log.txt     [autogenerated by renweb_app]
    └── renweb_app  [autogenerated by makefile]
```
### `assets` and `content`
These directories are automatically generated by the webpacker. To generate these, run `npm run build` after installing **both** the required npm packages in for <a href="./package.json">./package.json</a> and <a href="./scripts/package.json">./scripts/package.json</a>.
### `custom`
The RenWeb webserver always checks this directory before `assets` and `content` when fulfilling GET requests. Placing assets here allows for the easy substitution of content used in any given program, thus allowing for easily-applied customization for users.
### `config.json`
RenWeb either makes a new one of these if none is found or interprets one given. Configuration settings are indexed by their respective page name. These *should* be set by the application developer when building each page, but if they aren't for whatever reason, RenWeb will just add a new entry and will apply the default settings to it.

A typical config would look like this:
```json
{
  "main": {
    "author": "@me",
    "decorated": true,
    "description": "I am an app that does, in fact, do things.",
    "height": 900,
    "hint": 0,
    "keep_above": false,
    "license": "MIT",
    "name": "Notes App",
    "page": "main",
    "resizable": true,
    "save_resize_dimensions": true,
    "version": "1.0.2",
    "width": 600
  }
}
```
How default settings work and are stored is explained more in its respective section.
### `log.txt`
This file is autogenerated from the RenWeb executable and can be cleared by either deleting the file or running its respective command. More information on this can be found in its respective section below.
### `renweb_app`
This app is produced from running the make file. To change the name from `renweb_app` to something else, change the `EXE := ` value on line 20 in <a href="./engine/makefile">./engine/makefile</a> 

## Server-Side Design
<p align="center">
        <img height=500 src="https://github.com/SpurSlicer/RenWeb/blob/main/docs/assets/server_uml.png" alt="UML diagram of the server">
</p>

### Program Arguments
```
Available Options:
  -h [ --help ]                      Displays help info
  -v [ --version ]                   Displays version info
  -c [ --clear ]                     Clears the log file
  -l [ --log_level ] arg (=2 (info)) Sets log level (n>=0)
  -t [ --thread_count ] arg (=4)     Number of threads (n>=0)
  -p [ --port ] arg (=8270)          Web server port (n>=0)
  -i [ --ip ] arg                    IP of web server
  -P [ --pages ] arg (=test)         List of pages to open
```
Arguments are passed and processed *before* the window is created. All arguments are set and parsed in <a href="">./engine/args_manager.hpp</a>
### Default Configuration
Upon starting, RenWeb either creates or reads a config named `config.json` in whatever directory the executable is in. The config settings are set individually *per page name*. For example, the config for the RenWeb for this would have `test: {...}` and `test_react: {}` in it. Should no settings be found, RenWeb sets the settings to the defaults defined in <a href="./engine/include/info.hpp">./engine/include/info.hpp</a> to the values below:
```c++
#define RENWEB_INFO_DEFAULT_PAGE "test" // This is default page ran
#define RENWEB_INFO_DEFAULT_NAME "RenWeb"
#define RENWEB_INFO_DEFAULT_VERSION "a0.0.1"
#define RENWEB_INFO_DEFAULT_DESCRIPTION "I am an app that does things."
#define RENWEB_INFO_DEFAULT_LICENSE "LISC"
#define RENWEB_INFO_DEFAULT_AUTHOR "@YOU"
#define RENWEB_INFO_DEFAULT_HINT WEBVIEW_HINT_NONE
#define RENWEB_INFO_DEFAULT_WIDTH 720
#define RENWEB_INFO_DEFAULT_HEIGHT 480
#define RENWEB_INFO_DEFAULT_SAVE_RESIZE_DIMENSIONS true
#define RENWEB_INFO_DEFAULT_DECORATED true
#define RENWEB_INFO_DEFAULT_RESIZABLE true
#define RENWEB_INFO_DEFAULT_KEEP_ABOVE false
```
- **NOTE:** The settings above are used if either `config.json` doesn't exist or if the page the window is set to doesn't have an entry in `config.json`.

To obtain a config.json, either run the RenWeb program and save the settings or create your own and store it in the same directory as the RenWeb executable.
### Logging
Program logs are stored in the same directory as the RenWeb executable in a file called `log.txt`. All log levels are output here. To view the log messages in real time as the program executes, run it via the command line. To the log file, either delete it or run `./[renweb_app] -c`. To change the log level, run `./[renweb_app] -ln` where <img src="https://latex.codecogs.com/svg.image?&space;n\in\mathbb{Z}_{6}">. 0 is "trace" level and 5 is "critical" level.

Any log entries that have the tag `[SERVER]` are messages sent from the webserver. Similarly, any log entries with the tag `[CLIENT]` are messages sent with JavaScript from the client.
### Windows
RenWeb has the ability to run multiple pages at once. When it does this, the original process becomes a sort of manager that waits for all child processes to finish executing before closing. Should you close the original process that runs all subprocesses, all subprocesses will be killed. See the diagram below for an illustration of what this looks like:
<p align="center">
        <img height=200 src="https://github.com/SpurSlicer/RenWeb/blob/main/docs/assets/multiple_windows.png" alt="A tree diagram showing what happens when multiple pages are used">
</p>

In addition to this, every normal 1-window process has the ability to create and manage subwindows/subprocesses in the same tree-like fashion:

<p align="center">
        <img height=300 src="https://github.com/SpurSlicer/RenWeb/blob/main/docs/assets/subprocesses.png" alt="A tree diagram showing how subwindows work">
</p>

Subwindows can also be set to be `single` which makes it so that only one instance of that page can ever be active at once. See the Client Design section for more information. Note that subwindows don't *know* that they're single; the process manager that invokes the subwindow is what keeps track of singleness.

## Client Design
The RenWeb engine provides a set of `Log`, `FS` (filesystem), `Window`, and `Util` functions found at <a href="./src/lib/renweb/index.ts">./src/lib/renweb/index.ts</a>. Notice that the library was created in typescript; running `npx tsc` in the <a href="./src">./src</a> directory will compile it to JavaScript and make it usable module.

The RenWeb engine searches for web content to display in the content folder (this should be in the same directory as the RenWeb executable). The content folder should be structured as follows:
```
.
└── content/
    ├── page1/
    ├── page2/
    ├── page3/
    │   ├── index.html [required]
    │   ├── style1.css
    │   ├── style2.css
    │   ├── script2.js
    │   ├── script2.js
    │   └── ...
    └── ...
```
- Style and script files can be named anything.

UI files are organized as such:
```
.
└── src/
    ├── assets/
    │   └── example.png
    ├── dist/ [generated by running `npx tsc` while in ./src]
    │   └── lib/
    │       ├── renweb/ 
    │       │   └── index.js [import/require this file]
    │       ├── lib_name1/
    │       │   └── index.js
    │       └── lib_name2/
    │           └── index.js
    ├── lib/
    │   ├── renweb/
    │   │   └── index.ts
    │   ├── lib_name1/
    │   │   └── index.ts
    │   └── lib_name2/
    │       └── index.ts
    ├── components/ [optional; functions like ./lib]
    ├── pages/
    │   ├── page1/
    │   │   ├── index.html
    │   │   ├── style.css
    │   │   └── script.js
    │   └── page2/
    │       ├── app.tsx
    │       ├── app.css
    │       ├── index.tsx
    │       └── index.css
    └── tsconfig.json
```
Here, `page1` and `page2` are page names. The webpacker is ran with `npm run build` and is currently able to build both vanilla and react-style applications. This will generate the necessary files and store them properly to be used by RenWeb.

Please try and keep all of your asset files in the respective asset folder to keep the symmetry between the build folder.

To edit the build script, you can find it at <a href="./scripts//src/build.ts">./scripts/src/build.ts</a>. Script don't compile to JS, so you don't need to run TSC. The npm script for running the build script uses `ts-node`. 

## Q&A
- **Q**: When I run the RenWeb executable nothing displays.
  - **A**: To avoid the classic webapp "flashbang," RenWeb defers the task of showing the window to the program. Make sure you have `window.onload = async () => await Window.show();` or something similar in either a script tag or file.
- **Q**: How do I add custom function bindings?
  - **A**: Follow these steps:
    1. Add the binding for it in the RenWeb module defined in <a href="./src/lib/renweb/index.ts">./src/lib/renweb/index.ts</a> as well as its declare value in the bottom of that file (follow the pattern of all of the other bindings). Then run `npx tsc`.
    2. Add in the header for its binding in <a href="./engine/include/webview_binds.hpp">./engine/include/webview_binds.hpp</a>. Be sure to follow the same structure as all other bound functions defined there. Feel free to make a new namespace if you'd like.
    3. Add in the implementation in <a href="./engine/src/webview_binds.cpp">./engine/src/webview_binds.cpp</a>. Make sure you follow the same structure as all of the other bound functions defeined there.
    4. Scroll down to the bottom of <a href="./engine/src/webview_binds.cpp">./engine/src/webview_binds.cpp</a> and add in the function to the `bindAll()` method.
- **Q**: How do I add custom settings?
  - **A**: Follow these steps:
    1. Go to <a href="./engine/include/info.hpp">./engine/include/info.hpp</a> and add in a `#default` for it along with all of the other ones. Then, add a member for it in the `App` class following the pattern as all of the other members.
    2. Go to <a href="./engine/src/info.cpp">./engine/src/info.cpp</a> and add in a line for it in the `refresh`, `resetToDefaults`, and `get` methods.
    3. Go to <a href="./src/lib/renweb/index.ts">./src/lib/renweb/index.ts</a> and add it to the `Window.Settings` type. Then run `npx tsc` and you should be good.
- **Q**: How do I add custom scripts to run over my pages like the `build.ts` script?
  - **A**: Follow these steps:
    1. Add you script in the <a href="./scripts/src/">./scripts/src</a> directory. You can import the logger module found in <a href="./scripts/lib/logger/logger.ts">./scripts/lib/logger/logger.ts</a> directly as a TS file since scripts don't compile to JS and just run using `ts-node`.
    2. Add an npm script to make running it easier at both <a href="./scripts/package.json">./scripts/package.json</a> and <a href="./package.json">./package.json</a>. Follow the structure as the other scripts.

## Reminders
- <a href="./package.json">./package.json</a> is the package.json that should contain UI node modules.

## Planned Additions
- Support for angular and vue (currently untested)
- Support for Mac and Window
- An npm script to generate installers for each OS
- Switch to tsx

## Credits
- This repository depends on <a href="https://github.com/boostorg/boost">the boost libraries</a> as a submodule and is licensed under the <a href="./engine/external/boost/LICENSE.MIT">MIT License</a>.
- This repository depends on <a href="https://github.com/nlohmann/json">nlohmann's JSON</a> as a submodule and is licensed under the <a href="./engine/external/boost/LICENSE_1_0.txt">BSL License</a>.
- This repository depends on <a href="https://github.com/yhirose/cpp-httplib">yhirose's cpp-httplib</a> as a submodule and is licensed under the <a href="./engine/external/cpp-httplib/LICENSE">MIT License</a>.
- This repository depends on a modified version of the <a href="https://github.com/samhocevar/portable-file-dialogs">samhocevar's Portable File Dialog</a> titled <a href="https://github.com/spur27/portable-file-dialogs-mod">Portable File Dialog Mod</a> as a submodule and is distributed under the <a href="./engine/external/portable-file-dialogs-mod/COPYING">original custom license</a>.
- This repository depends on <a href="https://github.com/gabime/spdlog">gabime's spdlog</a> as a submodule and is licensed under <a href="./engine/external/spdlog/LICENSE">MIT License</a>.
- This repository depends on <a href="https://github.com/webview/webview">webview's webview</a> as a submodule and is licensed under <a href="./engine/external/webview/LICENSE">MIT License</a>.
- This repository depends on a modified version of the <a href="https://github.com/gpakosz/whereami">gpakosz's whereami</a> titled <a href="https://github.com/spur27/whereami-hpp">whereami-hpp</a> as a submodule and is distributed under the <a href="./engine/external/whereami-hpp/LICENSE.MIT">MIT License</a>.

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