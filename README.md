
<p align="center">
    <a href="https://github.com/spur27/RenWeb-Engine">
        <img height=300 src="https://github.com/spur27/RenWeb-Engine/blob/main/docs/assets/renweb.png" alt="RenWeb ~ A FOSS Software SDK">
    </a>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/version-0.0.7-EF233C?style=flat-square" alt="Version">
    <img src="https://img.shields.io/badge/license-BSL--1.0-9333EA?style=flat-square" alt="License">
    <img src="https://img.shields.io/badge/C%2B%2B-20-00599C?style=flat-square&logo=cplusplus&logoColor=white" alt="C++20">
    <img src="https://github.com/SpurSlicer/RenWeb/actions/workflows/ubuntu_make_test.yml/badge.svg" alt="Ubuntu">
    <img src="https://github.com/SpurSlicer/RenWeb/actions/workflows/fedora_make_test.yml/badge.svg" alt="Fedora">
    <img src="https://github.com/SpurSlicer/RenWeb/actions/workflows/windows_make_test.yml/badge.svg" alt="Windows">
    <img src="https://github.com/SpurSlicer/RenWeb/actions/workflows/macos_make_test.yml/badge.svg" alt="MacOS">
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

Copyright (C) 2025 spur27 — [Boost Software License 1.0](./licenses/LICENSE)
