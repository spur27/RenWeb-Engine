# RenWeb Linux Bundle Reference

This document describes the portable Linux bundle produced by `make BUNDLE=true`.
It covers every library included, the stub directories created for isolation,
which system libraries are permitted to load on each host type, and the
complete runtime logic applied by `bundle_exec.sh`.

---

## Bundle structure

```
build/
├── renweb-<version>-linux-<arch>    # glibc-linked ELF binary
├── bundle_exec.sh                   # portable launcher (generated from template)
├── lib-<arch>/                      # self-contained glibc-linked .so files
│   ├── ld-linux-<arch>.so*          # bundled glibc dynamic linker
│   ├── webkit2gtk-4.1/              # WebKit subprocess helpers
│   │   ├── WebKitWebProcess         # thin wrapper shell script
│   │   ├── WebKitWebProcess.real    # ELF binary (PT_INTERP patched)
│   │   ├── WebKitNetworkProcess
│   │   ├── WebKitNetworkProcess.real
│   │   ├── WebKitGPUProcess
│   │   ├── WebKitGPUProcess.real
│   │   └── libwebkit2gtkinjectedbundle.so
│   ├── glvnd/
│   │   └── egl_vendor.d/            # intentionally empty (musl EGL block)
│   └── <all .so files listed below>
└── lib/                             # optional generic lib dir (populated
                                     # manually or with cp -r lib-<arch>/. lib/)
```

**`lib-<arch>/`** is the authoritative directory created by the build system.
`lib/` is a manually-managed fallback that `bundle_exec.sh` tries second.

---

## Library resolution order (`bundle_exec.sh`)

The launcher resolves `LIB_DIR` in three steps, using the arch suffix extracted
from the executable's filename (which matches the makefile `ARCH` variable):

| Priority | Path | Used when |
|---|---|---|
| 1 | `$SCRIPT_DIR/lib-<arch>/` | `make BUNDLE=true` was run; standard case |
| 2 | `$SCRIPT_DIR/lib/` | manual generic populate / legacy layout |
| 3 | `/lib` | neither bundle dir exists; **no isolation** — warning printed |

When tiers 1 or 2 are used, `LD_LIBRARY_PATH` is prepended with `LIB_DIR` so
all bundled `.so` files take precedence over any same-named system libraries.

---

## Bundled libraries (x86_64 — representative; cross-arch bundles contain the
same set built for their target ABI)

### Dynamic linker

| File | Purpose |
|---|---|
| `ld-linux-x86-64.so.2` | glibc dynamic linker / program interpreter — required so the glibc-linked binary executes correctly on musl hosts |

### C++ / compiler runtime

| File |
|---|
| `libc.so.6` |
| `libm.so.6` |
| `libstdc++.so.6` |
| `libgcc_s.so.1` |
| `libatomic.so.1` |

### WebKit / JavaScriptCore

| File |
|---|
| `libwebkit2gtk-4.1.so.0` |
| `libjavascriptcoregtk-4.1.so.0` |
| `libbacktrace.so.0` |

### GLib / GObject / GIO / GModule

| File |
|---|
| `libglib-2.0.so.0` |
| `libgobject-2.0.so.0` |
| `libgio-2.0.so.0` |
| `libgmodule-2.0.so.0` |

### GTK3 / GDK / ATK / Pango / Cairo / Accessibility

| File |
|---|
| `libgtk-3.so.0` |
| `libgdk-3.so.0` |
| `libgdk_pixbuf-2.0.so.0` |
| `libatk-1.0.so.0` |
| `libatk-bridge-2.0.so.0` |
| `libatspi.so.0` |
| `libpango-1.0.so.0` |
| `libpangocairo-1.0.so.0` |
| `libpangoft2-1.0.so.0` |
| `libcairo.so.2` |
| `libcairo-gobject.so.2` |
| `libpixman-1.so.0` |

### OpenGL / EGL / GLVND

| File | Notes |
|---|---|
| `libEGL.so.1` | GLVND EGL dispatch library |
| `libGL.so.1` | GLVND OpenGL dispatch library |
| `libGLX.so.0` | GLVND GLX dispatch library |
| `libGLdispatch.so.0` | GLVND core dispatch |
| `libepoxy.so.0` | rebuilt EGL-only (`-Dglx=no -Dx11=false`) — never dlopen's `libGL.so.1` or `libGLX.so.0` |

### GStreamer (media pipeline)

| File |
|---|
| `libgstreamer-1.0.so.0` |
| `libgstbase-1.0.so.0` |
| `libgstallocators-1.0.so.0` |
| `libgstapp-1.0.so.0` |
| `libgstaudio-1.0.so.0` |
| `libgstfft-1.0.so.0` |
| `libgstgl-1.0.so.0` |
| `libgstpbutils-1.0.so.0` |
| `libgstrtp-1.0.so.0` |
| `libgstsdp-1.0.so.0` |
| `libgsttag-1.0.so.0` |
| `libgstvideo-1.0.so.0` |
| `libgstwebrtc-1.0.so.0` |

### DRM / GBM / evdev / udev / gudev

| File |
|---|
| `libdrm.so.2` |
| `libgbm.so.1` |
| `libevdev.so.2` |
| `libudev.so.1` |
| `libgudev-1.0.so.0` |

### Wayland

| File |
|---|
| `libwayland-client.so.0` |
| `libwayland-cursor.so.0` |
| `libwayland-egl.so.1` |
| `libwayland-server.so.0` |

### X11 / XCB (needed by GTK3 and GLVND even in Wayland mode)

| File |
|---|
| `libX11.so.6` |
| `libX11-xcb.so.1` |
| `libXau.so.6` |
| `libXcomposite.so.1` |
| `libXcursor.so.1` |
| `libXdamage.so.1` |
| `libXdmcp.so.6` |
| `libXext.so.6` |
| `libXfixes.so.3` |
| `libXinerama.so.1` |
| `libXi.so.6` |
| `libXrandr.so.2` |
| `libXrender.so.1` |
| `libxcb.so.1` |
| `libxcb-render.so.0` |
| `libxcb-shm.so.0` |
| `libxkbcommon.so.0` |

### Fonts / Text / I18n

| File |
|---|
| `libfontconfig.so.1` |
| `libfreetype.so.6` |
| `libharfbuzz.so.0` |
| `libharfbuzz-icu.so.0` |
| `libicudata.so.76` |
| `libicui18n.so.76` |
| `libicuuc.so.76` |
| `libfribidi.so.0` |
| `libgraphite2.so.3` |
| `libdatrie.so.1` |
| `libthai.so.0` |

### Audio

| File |
|---|
| `libasound.so.2` |
| `libflite.so.1` |
| `libflite_cmulex.so.1` |
| `libflite_usenglish.so.1` |
| `libflite_cmu_us_awb.so.1` |
| `libflite_cmu_us_kal.so.1` |
| `libflite_cmu_us_rms.so.1` |
| `libflite_cmu_us_slt.so.1` |

### Image codecs

| File |
|---|
| `libjpeg.so.8` |
| `libpng16.so.16` |
| `libwebp.so.7` |
| `libwebpdemux.so.2` |
| `libwebpmux.so.3` |
| `libsharpyuv.so.0` |
| `libgdk_pixbuf-2.0.so.0` |
| `libaom.so.3` |
| `libavif.so.16` |
| `libdav1d.so.7` |
| `libgav1.so.1` |
| `libjxl.so.0.11` |
| `libjxl_cms.so.0.11` |
| `librav1e.so.0.7` |
| `libSvtAv1Enc.so.2` |
| `libyuv.so.0` |
| `libhwy.so.1` |
| `liblcms2.so.2` |

### Web / Network / TLS

| File |
|---|
| `libsoup-3.0.so.0` |
| `libcrypto.so.3` |
| `libssl.so.3` (if present) |
| `libnghttp2.so.14` |
| `libgssapi_krb5.so.2` |
| `libkrb5.so.3` |
| `libk5crypto.so.3` |
| `libkrb5support.so.0` |
| `libkeyutils.so.1` |
| `libcom_err.so.2` |
| `libidn2.so.0` |
| `libunistring.so.5` |
| `libpsl.so.5` |
| `libtasn1.so.6` |

### Text / Spell-check

| File |
|---|
| `libenchant-2.so.2` |
| `libhyphen.so.0` |

### Rendering / Compositor

| File |
|---|
| `libwoff2common.so.1.0.2` |
| `libwoff2dec.so.1.0.2` |
| `libxml2.so.2` |
| `libxslt.so.1` |
| `libmanette-0.2.so.0` |
| `liborc-0.4.so.0` |

### System / Security

| File |
|---|
| `libseccomp.so.2` |
| `libsecret-1.so.0` |
| `libsystemd.so.0` |
| `libdbus-1.so.3` |
| `libcap.so.2` |
| `libselinux.so.1` |
| `libblkid.so.1` |
| `libmount.so.1` |
| `libgcrypt.so.20` |
| `libgpg-error.so.0` |

### Compression / I/O

| File |
|---|
| `libz.so.1` |
| `libzstd.so.1` |
| `liblzma.so.5` |
| `libbz2.so.1.0` |
| `libbrotlicommon.so.1` |
| `libbrotlidec.so.1` |
| `libbrotlienc.so.1` |

### Other

| File |
|---|
| `libffi.so.8` |
| `libexpat.so.1` |
| `libpcre2-8.so.0` |
| `libsqlite3.so.0` |

### Abseil (used by WebKit internals)

`libabsl_base`, `libabsl_debugging_internal`, `libabsl_demangle_internal`,
`libabsl_graphcycles_internal`, `libabsl_int128`, `libabsl_kernel_timeout_internal`,
`libabsl_malloc_internal`, `libabsl_raw_logging_internal`, `libabsl_spinlock_wait`,
`libabsl_stacktrace`, `libabsl_string_view`, `libabsl_strings`, `libabsl_strings_internal`,
`libabsl_symbolize`, `libabsl_synchronization`, `libabsl_throw_delegate`,
`libabsl_time`, `libabsl_time_zone` — all `.so.20230802`

---

## Stub directories

These directories are created empty inside `lib-<arch>/` and serve as isolation
sinks — the runtime is pointed at them so it finds nothing and silently skips
loading any system-installed (potentially musl-linked) modules.

| Stub path | Variable pointed at it | Purpose |
|---|---|---|
| `lib-<arch>/glvnd/egl_vendor.d/` | `__EGL_VENDOR_LIBRARY_DIRS` (musl only) | Prevents GLVND from loading the host `libEGL_mesa.so.0` ICD |
| `lib-<arch>/gstreamer-1.0/` | `GST_PLUGIN_SYSTEM_PATH_1_0` (always) | GStreamer finds no system plugin `.so` files |
| `lib-<arch>/gio/modules/` | `GIO_EXTRA_MODULES` (musl only) | GIO loads no system VFS/proxy modules |
| `lib-<arch>/dri/` | `LIBGL_DRIVERS_PATH` (musl only) | Mesa DRI driver search path (empty = use software rasteriser) |
| `lib-<arch>/gbm/` | `GBM_BACKENDS_PATH` (musl only) | GBM backend search path (empty = use bundled gbm) |
| `lib-<arch>/enchant/` | `ENCHANT_CONFIG_DIR` (always) | Enchant spell-check providers blocked; spell-check silently unavailable |
| `lib-<arch>/gdk-pixbuf-2.0/` | `GDK_PIXBUF_MODULE_FILE` (always) | Points at `loaders.cache`; absent = built-in loaders only (PNG/JPEG/GIF/WebP) |

---

## Runtime environment variables set by `bundle_exec.sh`

### Always set (both glibc and musl hosts)

| Variable | Value | Reason |
|---|---|---|
| `LD_LIBRARY_PATH` | `$LIB_DIR:…` | Bundled `.so` files take precedence over system libs |
| `GST_PLUGIN_SYSTEM_PATH_1_0` | `$LIB_DIR/gstreamer-1.0` | GStreamer plugin isolation |
| `GST_PLUGIN_PATH` | `""` (empty) | Disables additional GStreamer plugin scan paths |
| `GST_GL_PLATFORM` | `egl` | Forces EGL-only GL; prevents GLX probe that dlopen's `libGL.so.1` |
| `GDK_PIXBUF_MODULE_FILE` | `$LIB_DIR/gdk-pixbuf-2.0/loaders.cache` | GdkPixbuf loader isolation |
| `NO_AT_BRIDGE` | `1` | Suppresses AT-SPI bus connection (reduces startup noise/hangs) |
| `GDK_BACKEND` | `wayland` (unless already set) | EGL-only rendering path; no X11 GL libs required |
| `ENCHANT_CONFIG_DIR` | `$LIB_DIR/enchant` | Enchant provider isolation |
| `FONTCONFIG_PATH` | First of `/etc/fonts`, `/usr/local/etc/fonts`, `/usr/share/fontconfig` that contains `fonts.conf` | Suppresses bundled fontconfig "Cannot load default config" warning; ensures system fonts are found |
| `WEBKIT_EXEC_PATH` | `$SCRIPT_DIR/lib-<arch>/webkit2gtk-4.1` (if dir exists) | WebKit subprocess helper override |
| `WEBKIT_INJECTED_BUNDLE_PATH` | same as above | WebKit injected bundle override |
| `RENWEB_EXECUTABLE_PATH` | path to the resolved binary | Available to the application for introspection |

### Set only on musl hosts (when `/lib/ld-musl-*.so*` is detected)

| Variable | Value | Reason |
|---|---|---|
| `GIO_EXTRA_MODULES` | `$LIB_DIR/gio/modules` | Blocks system GIO VFS/proxy modules (musl-linked) |
| `GTK_MODULES` | `""` (empty) | Blocks system GTK input-method / accessibility modules |
| `GTK_PATH` | `""` (empty) | Blocks system GTK theme / engine module search |
| `LIBGL_ALWAYS_SOFTWARE` | `1` | Forces Mesa software rasteriser; no host GPU driver loaded |
| `LIBGL_DRIVERS_PATH` | `$LIB_DIR/dri` | Empty stub; Mesa finds no DRI `.so` files |
| `GBM_BACKENDS_PATH` | `$LIB_DIR/gbm` | Empty stub; GBM uses bundled in-process backend |
| `__EGL_VENDOR_LIBRARY_DIRS` | `$LIB_DIR/glvnd/egl_vendor.d` | Empty stub; GLVND finds no ICD, so it never loads `libEGL_mesa.so.0` |

### Not set / explicitly cleared on musl hosts

- None of the above musl-only variables are set on glibc hosts, so system GPU
  hardware acceleration (Mesa, GLVND, GPU ICD) remains fully available.

---

## Libraries permitted to load at runtime

### glibc host (Ubuntu, Debian, Fedora, Arch, openSUSE, …)

The following system library categories are **allowed** to load because they are
glibc-linked and safe to mix with the bundled process:

- Host EGL/GLVND ICD (`libEGL_mesa.so.0`, `libGLX_mesa.so.0`, GPU vendor ICDs)
- Host Mesa DRI drivers (`/usr/lib/…/dri/*.so`)
- Host GIO modules (`/usr/lib/…/gio/modules/*.so`)
- Host GTK3 input-method and accessibility modules
- Host GStreamer plugins present in `/usr/lib/gstreamer-1.0/` are **blocked**
  regardless of host type (GST_PLUGIN_SYSTEM_PATH_1_0 is always redirected to
  the bundle stub).

All bundled `.so` files in `lib-<arch>/` take precedence via `LD_LIBRARY_PATH`
over any same-named system library.

### musl host (Alpine Linux, Void Linux musl, …)

**Zero** system `.so` files are permitted to load at runtime.  Every path that
could cause the dynamic linker to open a musl-linked `.so` is either:

- Blocked by pointing an environment variable at an empty bundle stub directory.
- Blocked by setting an env var to an empty string.
- Prevented by `LD_LIBRARY_PATH` directing all linker resolution into the
  bundled `lib-<arch>/`.

The consequence is:

- **GPU rendering**: software rasteriser only (no host GPU acceleration).
  `LIBGL_ALWAYS_SOFTWARE=1` + empty `LIBGL_DRIVERS_PATH` ensures Mesa uses the
  software path built into the bundled `libwebkit2gtk` / `libgstgl`.
- **GStreamer**: built-in elements only (no host audio/video codecs).
- **GIO**: built-in VFS only (no GVFS, SAMBA, or MTP plugins).
- **Fonts**: system fonts are discovered normally via `FONTCONFIG_PATH`
  (fontconfig reads font files, not shared libraries — safe on musl).
- **Spell-check**: unavailable (Enchant provider .so files are blocked).

This design was verified by `strace -f -e trace=openat` inside an Alpine Docker
container with `mesa`, `gtk+3.0`, `libepoxy`, `gst-plugins-base`, and `dbus`
all installed: **zero non-bundle `.so` opens were observed**.

---

## WebKit subprocess execution model

WebKitGTK forks three separate helper processes at runtime:

| Helper | Role |
|---|---|
| `WebKitWebProcess` | Renders each web page (sandboxed) |
| `WebKitNetworkProcess` | Handles all network I/O |
| `WebKitGPUProcess` | GPU compositing |

Each helper is stored in `lib-<arch>/webkit2gtk-4.1/` as a pair:

- `<Helper>` — a POSIX shell script wrapper that resolves the bundled
  `ld-linux-*.so*` from `LIB_DIR` and invokes it with `--library-path LIB_DIR`
  before executing `<Helper>.real`.
- `<Helper>.real` — the original ELF binary, stripped, with its `PT_INTERP`
  (ELF program interpreter field) patched by `patchelf` to
  `/tmp/.renweb/.so/<sha256-of-ld>.so`.

The `PT_INTERP` symlink at `/tmp/.renweb/.so/<hash>.so` is created by
`bundle_exec.sh` at startup using `sha256sum` of the bundled `ld-linux`.  This
ensures any kernel `exec()` of a `.real` binary (as happens during WebKit
seccomp sandbox re-exec) uses the bundled glibc linker rather than the system
musl linker.

`WEBKIT_EXEC_PATH` is set to `$SCRIPT_DIR/lib-<arch>/webkit2gtk-4.1` so
WebKit's `DEVELOPER_MODE`-enabled build finds the helpers by environment
variable rather than the compiled-in `PKGLIBEXECDIR`.  A best-effort symlink at
`/usr/local/libexec/webkit2gtk-4.1` is also created for compatibility with
older WebKit builds that ignore `WEBKIT_EXEC_PATH`.

---

## Building with DEVELOPER_MODE

`WEBKIT_EXEC_PATH` is **only honoured** in WebKitGTK builds compiled with
`-DDEVELOPER_MODE=ON`.  All architectures must be rebuilt with
`rebuild-webkit-devmode.sh` before bundling:

```sh
# Rebuild all arches (first time or after source update)
./rebuild-webkit-devmode.sh

# Rebuild a single arch
./rebuild-webkit-devmode.sh --arch arm64

# After rebuilding, create the bundle
make TOOLCHAIN=aarch64-linux-gnu BUNDLE=true      # cross
PKG_CONFIG_PATH=/usr/local/lib/pkgconfig make BUNDLE=true  # x86_64 native
```

Verify it is active:
```sh
strings build/lib-x86_64/libwebkit2gtk-4.1.so.0 | grep WEBKIT_EXEC_PATH
# should print: WEBKIT_EXEC_PATH
```

---

## Architecture support matrix

| TOOLCHAIN | makefile ARCH | ELF machine | Notes |
|---|---|---|---|
| `aarch64-linux-gnu` | `arm64` | AArch64 | |
| `arm-linux-gnueabihf` | `arm32` | ARM Thumb-2 | USE_CAPSTONE stub required |
| `mips-linux-gnu` | `mips32` | MIPS BE | USE_CAPSTONE stub required |
| `mipsel-linux-gnu` | `mips32el` | MIPS LE | USE_CAPSTONE stub required |
| `mips64-linux-gnuabi64` | `mips64` | MIPS64 BE | |
| `mips64el-linux-gnuabi64` | `mips64el` | MIPS64 LE | |
| `powerpc-linux-gnu` | `powerpc32` | PPC32 | Web Extensions disabled (GOT2) |
| `powerpc64-linux-gnu` | `powerpc64` | PPC64 | Web Extensions disabled (GOT2) |
| `riscv64-linux-gnu` | `riscv64` | RISC-V 64 | |
| `s390x-linux-gnu` | `s390x` | S/390x | |
| `sparc64-linux-gnu` | `sparc64` | SPARC64 | Bubblewrap sandbox disabled (no libseccomp) |
| *(native)* | `x86_64` | x86-64 | |

`bundle_exec.sh` extracts the arch suffix directly from the executable filename
(e.g. `renweb-0.0.7-linux-arm64` → `arm64`) and resolves `lib-arm64/` first,
so the launcher is arch-agnostic with no hard-coded paths.
