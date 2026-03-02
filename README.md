
<p align="center">
    <a href="https://github.com/spur27/RenWeb-Engine">
        <img height=300 src="https://github.com/spur27/RenWeb-Engine/blob/main/docs/assets/renweb.png" alt="RenWeb ~ A FOSS Software SDK">
    </a>
</p>

![Ubuntu](https://github.com/SpurSlicer/RenWeb/actions/workflows/ubuntu_make_test.yml/badge.svg)
![Fedora](https://github.com/SpurSlicer/RenWeb/actions/workflows/fedora_make_test.yml/badge.svg)
![Windows](https://github.com/SpurSlicer/RenWeb/actions/workflows/windows_make_test.yml/badge.svg)
![MacOS](https://github.com/SpurSlicer/RenWeb/actions/workflows/macos_make_test.yml/badge.svg) 

#### [Home](https://spur27.github.io/RenWeb-Engine/?page=home) | [Downloads](https://spur27.github.io/RenWeb-Engine/?page=downloads) | [Usage](https://spur27.github.io/RenWeb-Engine/?page=usage) | [Compilation](https://spur27.github.io/RenWeb-Engine/?page=compilation) | [CLI Tool](https://spur27.github.io/RenWeb-Engine/?page=cli) | [JS API](https://spur27.github.io/RenWeb-Engine/?page=api) | [Plugin API](https://spur27.github.io/RenWeb-Engine/?page=plugins)

## RenWeb Engine

A cross-platform desktop application framework that lets you build native GUI apps using HTML, CSS, and JavaScript with a C++ backend. Made to be simple, easy, and fun to use.

## Features

- Native webview rendering (WKWebView / WebView2 / WebKitGTK)
- Embedded multi-threaded HTTP server with WebSocket and Range request support
- 90+ JavaScript ↔ C++ bindings for window, filesystem, system, process, and more
- Per-page configurable window properties via `config.json`
- Multi-window process management
- Portable executables under 2MB
- Compiles for 18 architectures across Linux, macOS, and Windows

## Platform Support

| Platform | Renderer | Min Version |
|----------|----------|-------------|
| Linux | WebKitGTK 2.40+ | Ubuntu 22.04 / Fedora 38+ |
| macOS | WKWebView | macOS 10.15+ |
| Windows | WebView2 | Windows 10+ |

## Dependencies

- [webview](https://github.com/webview/webview) — cross-platform webview
- [cpp-httplib](https://github.com/yhirose/cpp-httplib) — embedded HTTP server
- [spdlog](https://github.com/gabime/spdlog) — logging
- [Boost](https://www.boost.org/) — program options & JSON

## License

[Boost Software License 1.0](./licenses/LICENSE)
