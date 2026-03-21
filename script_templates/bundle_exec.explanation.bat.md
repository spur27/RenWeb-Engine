# bundle_exec.template.bat — Line-by-line explanation

This document explains every section of `bundle_exec.template.bat`.
The template is processed at bundle time by `make BUNDLE=true` on Windows via
`sed`, substituting three tokens before writing `build/bundle_exec.bat`:

| Token | Replaced with | Example |
|---|---|---|
| `@EXE_NAME@` | application name from `info.json`, lowercased/hyphenated | `renweb` |
| `@EXE_VERSION@` | version string from `info.json` | `0.0.7` |
| `@OS_NAME@` | always `windows` on Windows builds | `windows` |

On Windows the bundle does not deal with musl/glibc isolation — the runtime is
WebView2 (Microsoft Edge's Blink engine), which is a system component.  The
launcher's only jobs are to select the correct architecture executable, put
`lib-<arch>/` on `PATH`, and point WebView2 at its bundled runtime directory.

---

## `@echo off`

Suppresses command echoing for all subsequent lines.  Without this, every line
in the batch file would be printed to the terminal before execution, producing
noisy output.

---

## `setlocal enabledelayedexpansion`

Two important effects:

**`setlocal`** — scopes all variable assignments to this script; they do not
leak into the calling process's environment after the script exits.

**`enabledelayedexpansion`** — allows variables set *inside* `for` loops and
`if` blocks to be read back within the same block using `!VAR!` syntax instead
of `%VAR%`.  Without this, `%VAR%` inside a loop body is expanded once at parse
time (before the loop runs), not at execution time.  All variable reads inside
blocks use `!…!` throughout this script for consistency.

---

## SCRIPT_DIR

```bat
set "SCRIPT_DIR=%~dp0"
```

`%~dp0` is a batch special variable that expands to the **d**rive letter and
**p**ath of argument **0** (the script itself), always including a trailing
backslash.  This gives the absolute directory of `bundle_exec.bat` regardless
of the current working directory when the script is invoked, making the bundle
fully relocatable.

Example: if the script is at `C:\MyApp\bundle_exec.bat`, then
`SCRIPT_DIR` = `C:\MyApp\`.

---

## PATTERN

```bat
set "PATTERN=@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-*.exe"
```

Stores the filename glob pattern used to discover arch-specific executables
(e.g. `renweb-0.0.7-windows-x86_64.exe`, `renweb-0.0.7-windows-arm64.exe`).
Keeping it in a variable avoids repeating the long substituted string in
multiple places.

---

## ARCH_PARAM

```bat
set "ARCH_PARAM=%~1"
```

Captures the first command-line argument, which is the optional architecture
parameter.  `%~1` strips surrounding quotes if present.  This is read before
the `for` loop because `shift` inside a `for` loop does not work reliably in
batch — the argument value is captured first as a plain variable, which
`enabledelayedexpansion` then makes readable inside blocks via `!ARCH_PARAM!`.

---

## Executable count

```bat
set "COUNT=0"
for %%F in ("%SCRIPT_DIR%!PATTERN!") do set /a COUNT+=1
```

Counts the number of executable files matching the pattern.
`for … in (glob)` iterates over all matching files.  `set /a` performs
integer arithmetic, incrementing `COUNT` for each match.

The count drives the branching logic:
- `COUNT == 0` → no executables found; fatal error.
- `COUNT == 1` → single executable; no arch argument needed.
- `COUNT > 1` → multiple executables; arch argument required.

---

## Error: no executables found

```bat
if !COUNT! equ 0 (echo Error: No executables found matching !PATTERN! & exit /b 1)
```

`exit /b 1` exits the batch script (not the entire cmd.exe process) with exit
code 1.  The `& ` operator chains the echo and exit on one line without
requiring a block delimiter.

---

## Multi-executable branch (arch selection)

```bat
if !COUNT! gtr 1 (
    if "!ARCH_PARAM!"=="" (
        echo Error: Multiple executables found. Specify architecture:
        for %%F in ("%SCRIPT_DIR%!PATTERN!") do (
            set "FNAME=%%~nF"
            for /f "tokens=* delims=-" %%A in ("!FNAME:*-=!") do set "ARCH=%%A"
            echo   !ARCH!
        )
        echo Usage: %~nx0 ^<arch^> [args...]
        exit /b 1
    )
    set "EXE=%SCRIPT_DIR%@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-!ARCH_PARAM!.exe"
    if not exist "!EXE!" (echo Error: No executable for arch: !ARCH_PARAM! & exit /b 1)
    shift
)
```

When multiple executables are present and no arch argument was given, the script
enumerates available architectures and prints a usage message.

**Architecture extraction from filename:**

```bat
set "FNAME=%%~nF"
for /f "tokens=* delims=-" %%A in ("!FNAME:*-=!") do set "ARCH=%%A"
```

`%%~nF` gives the filename without path or extension.  The `!FNAME:*-=!`
substitution removes everything up to and including the last `-` character,
leaving only the arch suffix.  The inner `for /f` strips any trailing content
and assigns the result to `ARCH`.  The extracted suffix is printed with leading
spaces for readability.

`%~nx0` in the usage line expands to the script's own name with extension
(e.g. `bundle_exec.bat`) for a clean usage hint.  `^<` and `^>` are
escaped angle brackets (batch treats unescaped `<` and `>` as redirection).

When a valid arch argument is provided:

```bat
set "EXE=%SCRIPT_DIR%@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-!ARCH_PARAM!.exe"
```

Constructs the full expected path of the arch-specific binary.  `if not exist`
validates it before proceeding.

`shift` advances the argument list so `%*` in the final invocation line does
not re-pass the arch parameter to the binary.

---

## Single-executable branch

```bat
else (
    for %%F in ("%SCRIPT_DIR%!PATTERN!") do set "EXE=%%F"
)
```

When exactly one matching executable exists, it is assigned to `EXE` directly.
The `for` loop body executes once; the final value of `EXE` is the single match.

---

## FNAME (unused result)

```bat
for %%F in ("!EXE!") do set "FNAME=%%~nF"
```

Derives the filename stem of the selected executable (without path or
extension).  This variable is available for any downstream logic that might need
the clean name without constructing it from scratch — currently present for
forward compatibility.

---

## LIB_DIR

```bat
set "LIB_DIR=%SCRIPT_DIR%lib"
if not exist "!LIB_DIR!" (echo Error: Library directory not found: lib & exit /b 1)
```

Points at the `lib\` subdirectory of the bundle.  On Windows the lib directory
holds `WebView2Loader.dll` and optionally a `WebView2Runtime\` subdirectory.
Unlike the Linux launcher, Windows does not use a three-tier resolution because
Windows bundles are always uniform (no cross-arch `.dll` sets) and `lib\` is
the single canonical location.  A missing lib directory is a hard error.

---

## WebView2 runtime path

```bat
if exist "!LIB_DIR!\WebView2Runtime" set "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=!LIB_DIR!\WebView2Runtime"
```

`WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` is an official WebView2 environment
variable.  When set, the WebView2 loader uses the provided directory as the
browser executable folder instead of the system-installed Edge.  This enables
a fully self-contained deployment: if `lib\WebView2Runtime\` was populated by
`make BUNDLE=true` (which downloads and extracts the WebView2 standalone
installer), the application runs without requiring Edge or any system WebView2
installation.

If `WebView2Runtime\` does not exist, the variable is not set and WebView2 falls
back to the system Edge installation.  This allows the batch file to work
correctly in both scenarios (bundled runtime and system runtime).

---

## PATH prepend

```bat
set "PATH=!LIB_DIR!;%PATH%"
```

Prepends `lib\` to the DLL search path.  This ensures `WebView2Loader.dll`
(copied into `lib\` by the bundle step) is found before any system-level
`WebView2Loader.dll`.  On Windows, DLL resolution order uses the directories
listed in `PATH`; prepending guarantees the bundled DLL wins.

---

## Final invocation

```bat
"!EXE!" %*
```

Runs the resolved executable, forwarding all command-line arguments via `%*`.
Unlike the Linux launcher there is no `exec` equivalent in batch — the cmd.exe
process remains alive as the parent while the `.exe` runs.  This is normal
Windows behaviour and does not affect functionality.

`%*` expands to all command-line arguments as a single string.  Note that on
Windows `shift` does **not** affect `%*` — if an arch parameter was consumed,
it remains in `%*`.  This is acceptable because the Windows binary's own
argument parser will ignore an unrecognised leading positional that looks like
an arch name, or the application can be designed to call `bundle_exec.bat`
without an arch argument entirely (since `lib\` is arch-neutral).
