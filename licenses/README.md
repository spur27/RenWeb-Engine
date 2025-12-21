# Third-Party Licenses

This directory contains the licenses for all dependencies used by RenWeb.

## Direct Dependencies (Included as Submodules)

- **cpp-httplib** - MIT License - See [cpp-httplib-LICENSE](./cpp-httplib-LICENSE)
- **spdlog** - MIT License - See [spdlog-LICENSE](./spdlog-LICENSE)
- **webview** - MIT License - See [webview-LICENSE](./webview-LICENSE)

## System Dependencies (Dynamically Linked)

- **Boost** (Program Options, JSON) - Boost Software License - See [BOOST-LICENSE](./BOOST-LICENSE)
- **WebKitGTK 4.1** - LGPL 2.0+ - See [WEBKITGTK-LICENSE](./WEBKITGTK-LICENSE)
- **GTK 3** - LGPL 2.1+ - See [GTK-LICENSE](./GTK-LICENSE)

## Notes on LGPL Dependencies

RenWeb dynamically links to WebKitGTK and GTK, which are licensed under LGPL.
This is fully compliant with LGPL requirements as:
- No modifications are made to WebKitGTK or GTK source code
- Dynamic linking is used (not static linking)
- Users can replace the LGPL libraries with their own versions

## RenWeb License

RenWeb itself is licensed under the Boost Software License 1.0 - See [LICENSE](./LICENSE)
