#!/bin/bash
set -e
SCRIPT_DIR="$( cd "$( dirname "$0" )" && pwd )"
PATTERN="@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-*"
ARCH_PARAM="$1"
shopt -s nullglob
EXES=($SCRIPT_DIR/$PATTERN)
shopt -u nullglob
[ ${#EXES[@]} -eq 0 ] && echo "Error: No executables found matching $PATTERN" && exit 1
if [ ${#EXES[@]} -gt 1 ]; then
    if [ -z "$ARCH_PARAM" ]; then
        echo "Error: Multiple executables found. Specify architecture:"
        printf '  %s\n' "${EXES[@]##*/}" | sed 's/.*-//'
        echo "Usage: $0 <arch> [args...]"
        exit 1
    fi
    EXE="$SCRIPT_DIR/@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-$ARCH_PARAM"
    [ ! -x "$EXE" ] && echo "Error: No executable for arch: $ARCH_PARAM" && exit 1
    shift
else
    EXE="${EXES[0]}"
fi
ARCH=${EXE##*-}
LIB_DIR="$SCRIPT_DIR/lib-$ARCH"
[ ! -d "$LIB_DIR" ] && echo "Error: Library directory not found: lib-$ARCH" && exit 1
[[ "$OSTYPE" == "darwin"* ]] && export DYLD_LIBRARY_PATH="$LIB_DIR:$DYLD_LIBRARY_PATH" || export LD_LIBRARY_PATH="$LIB_DIR:$LD_LIBRARY_PATH"
exec "$EXE" "$@"
