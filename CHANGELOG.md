## Changelog

## 0.1.0 - 2026-04-25
- Bumped engine version to 0.1.0 across runtime metadata, site metadata, wiki templates, and maintenance references.
- Improved Windows plugin build reliability by adding Unix-like tool path handling for make-based plugin builds.
- Improved `rw doctor` on Windows by making npm detection work with `npm.cmd`, `npm`, and `cmd /c` fallback probing.
- Fixed Windows resource metadata mapping so file description uses app title and comments use app description.
- Added consistent cross-platform command naming support for packaging outputs.
- Reduced Windows build noise by replacing deprecated `getenv` usage with `_dupenv_s` for `ComSpec` lookup.
- Validated release build and Windows packaging flow for updated metadata and command behavior.

## 0.0.7 - 2026-04-23
- Added example plugin
- Added CLI tool (packager and project manager for applications, plugins, and engines)
- Added packages on JSR and NPM for both CLI and API
- Added an "Application" namespace of functions
- Added many more `window.renweb.<fn>` callbacks
- Fixed some issues with windows flashing geometry early
- Added installer generation graphics and more custom icon placeholders
- simplified info.json by removing unneeded server configuration options that didn't do anything
- Updated wiki pictures, contents, and filled in CLI page + plugin and CLI tool download sections
- Added new security distinction to toggle access to JS bindings
- Validation spreadsheet [here](https://drive.proton.me/urls/ZSCMMTTVPW#wQZdg1qyD0O3)