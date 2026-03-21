# bundle_exec.template.sh — Line-by-line explanation

This document explains every section of `bundle_exec.template.sh`.
The template is processed at bundle time by `make BUNDLE=true` via `sed`,
which substitutes three tokens before writing `build/bundle_exec.sh`:

| Token | Replaced with | Example |
|---|---|---|
| `@EXE_NAME@` | application name from `info.json`, lowercased/hyphenated | `renweb` |
| `@EXE_VERSION@` | version string from `info.json` | `0.0.7` |
| `@OS_NAME@` | `linux`, `windows`, or `macos` | `linux` |

---

## `set -e`

Enables _exit-on-error_ mode for the entire script.  Any command that returns a
non-zero exit code will terminate execution immediately.  This prevents partial
initialisation (e.g. if `sha256sum` or `mkdir` fail) from leading to a silent
mislaunch.

---

## SCRIPT_DIR

```sh
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
```

Resolves the absolute path of the directory containing `bundle_exec.sh`,
regardless of how the script is invoked (symlink, relative path, etc.).
`dirname "$0"` gives the directory component of the invocation path; `cd && pwd`
canonicalises it to an absolute path without relying on `realpath` or `readlink`,
which are not available on all POSIX systems.

All subsequent paths are derived from `$SCRIPT_DIR` so the bundle remains
relocatable — it can be placed anywhere on the filesystem.

---

## Executable discovery

```sh
EXES=""
for _f in "$SCRIPT_DIR"/@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-*; do
    [ -f "$_f" ] && [ -x "$_f" ] && EXES="${EXES}${_f}
"
done
```

Scans the bundle directory for all executable files whose names match the
pattern `<name>-<version>-<os>-<arch>` (e.g. `renweb-0.0.7-linux-x86_64`,
`renweb-0.0.7-linux-arm64`).  The glob is POSIX-compatible: on an empty match
the literal pattern string is returned, so `[ -f "$_f" ]` guards against that.
Each match is appended to `$EXES` as a newline-separated list.

The check fails fast with a clear error if no binary is found.

---

## Architecture selection (`COUNT` > 1)

```sh
COUNT=$(printf '%s' "$EXES" | grep -c .)
```

Counts the number of discovered executables.  `grep -c .` counts non-empty
lines; `printf '%s'` avoids a trailing newline being counted as an extra entry.

**Single executable found** — `$EXE` is set directly to it; no architecture
argument is consumed.

**Multiple executables found** — the script requires `$1` to be an architecture
suffix.  It constructs the expected full path:

```sh
EXE="$SCRIPT_DIR/@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-$ARCH_PARAM"
```

and exits with an error if the file does not exist or is not executable.
`shift` advances `$@` so `$1` is no longer the arch argument when the binary is
eventually exec'd with `"$@"`.

---

## LIB_DIR — three-tier resolution

```sh
_rw_arch="${EXE##*-}"
if   [ -d "$SCRIPT_DIR/lib-${_rw_arch}" ]; then
    LIB_DIR="$SCRIPT_DIR/lib-${_rw_arch}"
elif [ -d "$SCRIPT_DIR/lib" ]; then
    LIB_DIR="$SCRIPT_DIR/lib"
else
    LIB_DIR="/lib"
    printf 'Warning: …\n' >&2
fi
unset _rw_arch
```

`${EXE##*-}` strips everything up to and including the last `-`, leaving just
the arch suffix (e.g. `x86_64`, `arm64`, `mips32`).  This suffix matches the
makefile `ARCH` variable exactly, so the correct arch-specific library directory
is resolved without any `uname -m` mapping.

| Tier | Path | Condition |
|---|---|---|
| 1 | `lib-<arch>/` | Created by `make BUNDLE=true`; standard deployment |
| 2 | `lib/` | Populated manually or by `cp -r lib-<arch>/. lib/` |
| 3 | `/lib` | No bundled libs present; runs against host system; **no isolation** |

Tier 3 prints a warning to stderr and continues — the binary may work on a
glibc host but will be completely unprotected on a musl host.

---

## Library path injection

```sh
case "$(uname -s)" in
    Darwin) export DYLD_LIBRARY_PATH="$LIB_DIR:${DYLD_LIBRARY_PATH:-}" ;;
    *)      export LD_LIBRARY_PATH="$LIB_DIR:${LD_LIBRARY_PATH:-}" ;;
esac
```

Prepends `$LIB_DIR` to the dynamic linker's search path so bundled `.so` files
take precedence over any identically named system library.  The `:-` default
expansion handles the case where the variable is unset, avoiding a leading `:`.

`DYLD_LIBRARY_PATH` is used on macOS (Darwin); `LD_LIBRARY_PATH` everywhere else.
macOS bundles do not bundle WebKit (it is a system framework), but the template
is shared, so this branch is present for correctness.

---

## `unset LD_PRELOAD`

Ensures the caller cannot inject an arbitrary shared library into the process
via `LD_PRELOAD`.  On a musl host, a caller that had set `LD_PRELOAD` to a
musl-linked library would cause an immediate allocator mismatch crash.

---

## GStreamer isolation (unconditional)

```sh
export GST_PLUGIN_SYSTEM_PATH_1_0="$LIB_DIR/gstreamer-1.0"
export GST_PLUGIN_PATH=""
```

`GST_PLUGIN_SYSTEM_PATH_1_0` overrides GStreamer's default scan path
(`/usr/lib/<arch>/gstreamer-1.0/`) with a bundle subdirectory.  If the
directory is empty or absent, GStreamer finds no plugins and falls back to
built-in elements — no system plugin `.so` is ever loaded.

`GST_PLUGIN_PATH=""` disables any additional plugin search paths that might
have been set in the calling environment.

```sh
export GST_GL_PLATFORM=egl
```

Forces GStreamer's GL abstraction (`libgstgl`) to use EGL exclusively.  Without
this, `libgstgl` probes for a GLX display at startup by calling
`dlopen("libGL.so.1")`.  On musl hosts, `libGL.so.1` is musl-linked;
dlopen'ing it into a glibc process triggers the fatal allocator mismatch.
EGL is sufficient for Wayland rendering and is always available via the bundled
`libEGL.so.1`.

```sh
export GDK_PIXBUF_MODULE_FILE="$LIB_DIR/gdk-pixbuf-2.0/loaders.cache"
```

Points GdkPixbuf at a loaders cache inside the bundle.  If the file is absent,
GdkPixbuf silently uses only the loaders compiled directly into the library
(PNG, JPEG, GIF, WebP) — sufficient for WebKit operation.  This prevents
GdkPixbuf from scanning `/usr/lib/…/gdk-pixbuf-2.0/*/loaders/` and loading
musl-linked loader `.so` files.

```sh
export NO_AT_BRIDGE=1
```

Suppresses AT-SPI (Assistive Technology Service Provider Interface) bridge
connections.  On headless or minimal systems the DBus AT-SPI daemon is absent;
without this flag GTK emits connection errors on stderr and may stall at startup
waiting for a response that never arrives.

---

## Runtime C-library detection

```sh
_rw_musl=0
find /lib -maxdepth 2 -name 'ld-musl-*.so*' 2>/dev/null | grep -q . && _rw_musl=1
```

Probes the **host system's** `/lib` directory (not the bundle's `$LIB_DIR`) for
the presence of a musl dynamic linker.  musl always installs its linker as
`/lib/ld-musl-<arch>.so.1`; glibc uses `ld-linux-*`.  `find` is used rather
than a direct `[ -f /lib/ld-musl-*.so* ]` test because shell glob expansion
inside `[ -f ]` is not portable.  `-maxdepth 2` limits the search to `/lib`
and one subdirectory level, keeping it fast.

The result is stored in `_rw_musl` (0 = glibc, 1 = musl) and unset after the
conditional block.

---

## musl branch

```sh
if [ "$_rw_musl" -eq 1 ]; then
    export GIO_EXTRA_MODULES="$LIB_DIR/gio/modules"
    export GTK_MODULES=""
    export GTK_PATH=""
    export LIBGL_ALWAYS_SOFTWARE=1
    export LIBGL_DRIVERS_PATH="$LIB_DIR/dri"
    export GBM_BACKENDS_PATH="$LIB_DIR/gbm"
    export __EGL_VENDOR_LIBRARY_DIRS="$LIB_DIR/glvnd/egl_vendor.d"
```

On musl hosts **every** system `.so` is musl-linked.  dlopen'ing any of them
into a glibc process causes `malloc.c (sysmalloc): assertion failed` because
musl and glibc use incompatible heap allocators.  This branch blocks every
category of system plugin:

| Variable | Effect |
|---|---|
| `GIO_EXTRA_MODULES` | Redirects GIO module scan to an empty bundle dir; no GVFS/proxy/MTP modules load |
| `GTK_MODULES=""` | Prevents GTK from loading input-method or accessibility modules |
| `GTK_PATH=""` | Prevents GTK from scanning system paths for theme/engine modules |
| `LIBGL_ALWAYS_SOFTWARE=1` | Forces Mesa software rasteriser; no host GPU driver is contacted |
| `LIBGL_DRIVERS_PATH` | Empty bundle stub; Mesa finds no DRI `.so` files |
| `GBM_BACKENDS_PATH` | Empty bundle stub; GBM uses its bundled in-process backend |
| `__EGL_VENDOR_LIBRARY_DIRS` | Empty bundle stub; GLVND finds no ICD, never loads `libEGL_mesa.so.0` |

All stub directories (`gio/modules`, `dri`, `gbm`, `glvnd/egl_vendor.d`) are
created empty by the makefile's bundle step.

---

## glibc branch

```sh
else
    :
fi
```

On glibc hosts all system `.so` files share the same allocator.  System EGL/Mesa
ICDs (`libEGL_mesa.so.0`), GIO modules, and GTK modules are safe to load and
provide hardware GPU acceleration and full desktop integration.  The single `:`
(POSIX no-op) avoids a shell syntax error in the `else` clause while making the
intent explicit: nothing additional needs to be set.

---

## GDK_BACKEND

```sh
[ -z "$GDK_BACKEND" ] && export GDK_BACKEND=wayland
```

Defaults GTK to the Wayland backend.  On Wayland, GDK uses EGL exclusively:
`libepoxy` (rebuilt with `-Dglx=no -Dx11=false`) loads only the bundled
`libEGL.so.1` and never touches `libGL.so.1` or `libGLX.so.0`, so no X11 GL
libraries need to exist on the target system.  The check `[ -z "$GDK_BACKEND" ]`
allows users to override this (e.g. to `x11`) before invoking the script.

---

## ENCHANT_CONFIG_DIR

```sh
export ENCHANT_CONFIG_DIR="$LIB_DIR/enchant"
```

`libenchant-2` dynamically loads spell-check provider `.so` files from a
configured directory.  Redirecting to a bundle path (always empty) means no
system-installed provider is ever loaded.  Spell-check is silently unavailable
rather than crashing.

---

## FONTCONFIG_PATH

```sh
_rw_fc_path=""
for _rw_d in /etc/fonts /usr/local/etc/fonts /usr/share/fontconfig; do
    [ -f "$_rw_d/fonts.conf" ] && { _rw_fc_path="$_rw_d"; break; }
done
[ -n "$_rw_fc_path" ] && export FONTCONFIG_PATH="$_rw_fc_path"
unset _rw_fc_path _rw_d
```

The bundled `libfontconfig` was compiled with `FONTCONFIG_PATH=/usr/local/etc/fonts`,
which does not exist on Alpine, Arch, or many other systems.  When the compiled-in
config path is missing, fontconfig logs `Cannot load default config file: No such
file: (null)` on every startup and falls back to a minimal built-in font path
list, potentially missing system-installed fonts needed for text rendering.

This block searches the three most common fontconfig config directories and sets
`FONTCONFIG_PATH` to the first one containing a `fonts.conf` file.  The bundled
`libfontconfig` then reads the host's config directly, discovering all installed
font directories without any log noise.  The temporary variables are unset to
avoid polluting the child process environment.

---

## WebKit subprocess helpers

```sh
if [ -d "$LIB_DIR/webkit2gtk-4.1" ]; then
    export WEBKIT_EXEC_PATH="$LIB_DIR/webkit2gtk-4.1"
    export WEBKIT_INJECTED_BUNDLE_PATH="$LIB_DIR/webkit2gtk-4.1"
    _wk_dest="/usr/local/libexec/webkit2gtk-4.1"
    _wk_src="$LIB_DIR/webkit2gtk-4.1"
    if [ "$(readlink "$_wk_dest" 2>/dev/null)" != "$_wk_src" ]; then
        set +e
        mkdir -p /usr/local/libexec 2>/dev/null
        if [ -d "$_wk_dest" ] && [ ! -L "$_wk_dest" ]; then
            rm -rf "$_wk_dest" 2>/dev/null
            if [ -d "$_wk_dest" ]; then
                printf 'Warning: could not remove %s — run once with sudo to fix\n' "$_wk_dest" >&2
            fi
        fi
        ln -sfn "$_wk_src" "$_wk_dest" 2>/dev/null
        set -e
    fi
fi
```

WebKitGTK forks three subprocess helpers: `WebKitWebProcess` (page rendering),
`WebKitNetworkProcess` (networking), and `WebKitGPUProcess` (compositing).  By
default, WebKit looks for them at the compile-time `PKGLIBEXECDIR` constant
(`/usr/local/libexec/webkit2gtk-4.1`).

**`WEBKIT_EXEC_PATH`** — overrides the subprocess search path when WebKit is
built with `-DDEVELOPER_MODE=ON`.  This directs WebKit to the bundled wrappers
in `$LIB_DIR/webkit2gtk-4.1/` regardless of what is installed at the system
path.

**`WEBKIT_INJECTED_BUNDLE_PATH`** — directs WebKit to load the injected content
bundle (`libwebkit2gtkinjectedbundle.so`) from the same bundle directory.

**Symlink fallback** — for WebKit builds that do not honour `WEBKIT_EXEC_PATH`
(built without `DEVELOPER_MODE`), a best-effort symlink is created at
`/usr/local/libexec/webkit2gtk-4.1` pointing at the bundle directory.

The symlink logic handles three cases:
1. Path does not exist → `ln -sfn` creates it.
2. Path is an existing symlink pointing elsewhere → `ln -sfn` overwrites it.
3. Path is a real directory (e.g. installed by Alpine's `webkit2gtk` apk) →
   `rm -rf` removes it first, then `ln -sfn` creates the symlink.

Case 3 is the critical musl case: if the system has installed musl-linked
WebKit helper binaries at that path, they must be displaced before WebKit can
find the bundled glibc ones.  Both `rm -rf` and `ln` require root when the
directory was created by the package manager; failures are non-fatal and a
warning directs the user to run once with `sudo`.

`set +e` … `set -e` brackets the fallible operations so a permission error does
not abort the entire launch sequence.

---

## Bundled dynamic linker scan

```sh
BUNDLED_LD=""
for _ld in "$LIB_DIR"/ld-*.so*; do
    [ -f "$_ld" ] && [ -x "$_ld" ] && { BUNDLED_LD="$_ld"; break; }
done
```

Searches `$LIB_DIR` for the bundled glibc dynamic linker (`ld-linux-*.so*`).
The glob pattern matches `ld-linux-x86-64.so.2`, `ld-linux-aarch64.so.1`, etc.
On the first executable match, `BUNDLED_LD` is set and the loop exits.

If the bundle does not contain a dynamic linker (no `ld-*.so*` files),
`BUNDLED_LD` remains empty and the fallback `exec "$EXE"` at the end of the
script invokes the binary normally against the system linker.

---

## PT_INTERP symlink — `/tmp/.renweb/.so/<hash>.so`

```sh
if [ -n "$BUNDLED_LD" ]; then
    _rw_ld_hash=$(sha256sum "$BUNDLED_LD" 2>/dev/null | cut -c1-16)
    if [ -n "$_rw_ld_hash" ]; then
        mkdir -p /tmp/.renweb/.so 2>/dev/null || true
        chmod +t /tmp/.renweb/.so 2>/dev/null || true
        ln -sf "$BUNDLED_LD" "/tmp/.renweb/.so/${_rw_ld_hash}.so" 2>/dev/null || true
    fi
    unset _rw_ld_hash
fi
```

**Why this is needed:** at bundle build time, `patchelf --set-interpreter` patches
each `WebKit*.real` binary's `PT_INTERP` (ELF program interpreter field) from the
system path (e.g. `/lib64/ld-linux-x86-64.so.2`) to
`/tmp/.renweb/.so/<sha256-prefix>.so`.  The symlink created here makes that
path resolve to the bundled linker.

**Why `PT_INTERP` needs patching at all:** when the kernel `exec()`s an ELF binary
it reads `PT_INTERP` directly and invokes that path as the program interpreter
before doing anything else.  On Alpine, the kernel would find `/lib/ld-musl-x86_64.so.1`
at the glibc `PT_INTERP` path — a musl linker trying to load a glibc binary, which fails
immediately.  Patching to `/tmp/.renweb/.so/<hash>.so` bypasses this.

**Why `/tmp/`:** it is writable by all users on all Linux systems with no
privilege required.

**Why a content hash:** the first 16 hex digits of the SHA-256 of the linker
binary uniquely identify the exact linker version.  Two different RenWeb
installations with the same linker produce the same path → no conflict.  Two
installations with different linker builds produce different paths → full
isolation.

**`chmod +t` (sticky bit):** prevents one user from deleting or overwriting a
symlink created by another user in the shared `/tmp/.renweb/.so/` directory.
Each user's symlinks remain under their own ownership.

All operations use `|| true` to ensure a permission failure (e.g. `/tmp/` is
`noexec` or the user lacks write access) does not abort startup.  In that case
the `BUNDLED_LD --library-path` invocation at the end still runs correctly as
long as the shell script wrapper invocations are used (which do not rely on
`PT_INTERP`).

---

## Final exec

```sh
export RENWEB_EXECUTABLE_PATH="$EXE"
[ -n "$BUNDLED_LD" ] && exec "$BUNDLED_LD" --library-path "$LIB_DIR" "$EXE" "$@"
exec "$EXE" "$@"
```

**`RENWEB_EXECUTABLE_PATH`** — exports the resolved binary path so the running
application can introspect its own location (e.g. for relative asset resolution).

**`exec "$BUNDLED_LD" --library-path "$LIB_DIR" "$EXE" "$@"`** — when a bundled
linker was found, replaces the shell process with the glibc linker invoked
directly.  `--library-path "$LIB_DIR"` makes the linker search `$LIB_DIR` first
for every `DT_NEEDED` entry before touching the system library paths.  This is
the mechanism that ensures **zero system `.so` files are loaded** on a musl host:
all dependencies are resolved from the bundle.

`exec` (POSIX `execve`) replaces the current process image without forking, so
the final binary runs with PID equal to the shell process and inherits all
signals cleanly.

**Fallback `exec "$EXE" "$@"`** — when no bundled linker is present (e.g. a
debug build or a glibc host where isolation is less critical), the binary is
exec'd normally and the system linker handles resolution.  `LD_LIBRARY_PATH`
still ensures bundled `.so` files take priority on glibc hosts.
