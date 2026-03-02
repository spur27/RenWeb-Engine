@echo off
setlocal enabledelayedexpansion
set "SCRIPT_DIR=%~dp0"
set "PATTERN=@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-*.exe"
set "ARCH_PARAM=%~1"
set "COUNT=0"
for %%F in ("%SCRIPT_DIR%!PATTERN!") do set /a COUNT+=1
if !COUNT! equ 0 (echo Error: No executables found matching !PATTERN! & exit /b 1)
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
) else (
    for %%F in ("%SCRIPT_DIR%!PATTERN!") do set "EXE=%%F"
)
for %%F in ("!EXE!") do set "FNAME=%%~nF"
set "LIB_DIR=%SCRIPT_DIR%lib"
if not exist "!LIB_DIR!" (echo Error: Library directory not found: lib & exit /b 1)
if exist "!LIB_DIR!\WebView2Runtime" set "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=!LIB_DIR!\WebView2Runtime"
set "PATH=!LIB_DIR!;%PATH%"
"!EXE!" %*
