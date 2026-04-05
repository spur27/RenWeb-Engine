'use strict';


// ─── C++ header ───────────────────────────────────────────────────────────────

/**
 * Generate `include/<pluginName>.hpp`.
 * @param {object} info        - Project metadata
 * @param {string} pluginName  - Snake-case plugin identifier
 * @param {string} pluginClass - PascalCase C++ class name
 * @returns {string}
 */
function makePluginHpp(info, pluginName, pluginClass) {
    return `#pragma once
#include "plugin.hpp"

namespace json = boost::json;

// ${info.title}
// ${info.description || 'A RenWeb plugin.'}
class ${pluginClass} : public RenWeb::Plugin {
public:
    explicit ${pluginClass}(std::shared_ptr<RenWeb::ILogger> logger);
    ~${pluginClass}() override = default;

private:
    // Registers all callable functions into the \`functions\` map.
    // JS-side names follow the pattern: BIND_plugin_${pluginName}_<function_name>
    void registerFunctions();
};
`;
}

// ─── C++ implementation ───────────────────────────────────────────────────────

/**
 * Generate `src/<pluginName>.cpp`.
 * @param {object} info        - Project metadata
 * @param {string} pluginName  - Snake-case plugin identifier
 * @param {string} pluginClass - PascalCase C++ class name
 * @returns {string}
 */
function makePluginCpp(info, pluginName, pluginClass) {
    return `// Compile Boost.JSON's implementation directly into this translation unit so
// no external libboost_json is needed at runtime — the plugin is self-contained.
#define BOOST_JSON_SOURCE
#include <boost/json/src.hpp>

#include "../include/${pluginName}.hpp"

#include <cmath>      // std::tgamma
#include <stdexcept>
#include <string>

#if defined(_WIN32) || defined(_WIN64)
    #define PLUGIN_EXPORT __declspec(dllexport)
#elif defined(__GNUC__) || defined(__clang__)
    #define PLUGIN_EXPORT __attribute__((visibility("default")))
#else
    #define PLUGIN_EXPORT
#endif

// ─── Constructor ─────────────────────────────────────────────────────────────

${pluginClass}::${pluginClass}(std::shared_ptr<RenWeb::ILogger> logger)
    : RenWeb::Plugin(
        "${info.title}",
        "${pluginName}",
        "${info.version}",
        "${info.description}",
        "${info.repository}",
        logger)
{
    logger->info("[${pluginName}] Initializing plugin...");
    registerFunctions();
    logger->info("[${pluginName}] Plugin initialized successfully!");
}

// ─── Functions ───────────────────────────────────────────────────────────────

void ${pluginClass}::registerFunctions() {
    // Square a number.
    // JS: const result = await BIND_plugin_${pluginName}_square(4);  // → 16
    functions["square"] = [this](const json::value& req) -> json::value {
        try {
            const json::value param = req.as_array()[0];
            if (param.is_int64()) {
                return json::value(param.as_int64() * param.as_int64());
            } else if (param.is_uint64()) {
                return json::value(param.as_uint64() * param.as_uint64());
            } else if (param.is_double()) {
                return json::value(param.as_double() * param.as_double());
            } else {
                throw std::runtime_error("Invalid parameter type. Expected a number.");
            }
        } catch (const std::exception& e) {
            this->logger->error(e.what());
            return json::value(nullptr);
        }
    };

    // Calculate factorial (uses tgamma; also accepts non-integer inputs).
    // JS: const result = await BIND_plugin_${pluginName}_factorial(5);  // → 120
    functions["factorial"] = [this](const json::value& req) -> json::value {
        try {
            const json::value param = req.as_array()[0];
            double n = 0;
            if (param.is_int64())       n = static_cast<double>(param.as_int64());
            else if (param.is_uint64()) n = static_cast<double>(param.as_uint64());
            else if (param.is_double()) n = param.as_double();
            else throw std::runtime_error("Invalid parameter type. Expected a number.");
            return json::value(std::tgamma(n + 1.0));
        } catch (const std::exception& e) {
            this->logger->error(e.what());
            return json::value(nullptr);
        }
    };

    // Reverse a string.
    // Strings must be encoded with Utils.encode() on the JS side;
    // processInput() decodes the base64 representation automatically.
    // JS: const result = await BIND_plugin_${pluginName}_reverse_string(Utils.encode("Hello"));  // → "olleH"
    functions["reverse_string"] = [this](const json::value& req) -> json::value {
        try {
            const json::value param = req.as_array()[0];
            const std::string input = this->processInput(param).as_string().c_str();
            std::string reversed(input.rbegin(), input.rend());
            return this->formatOutput(json::value(reversed));
        } catch (const std::exception& e) {
            this->logger->error(e.what());
            return json::value(nullptr);
        }
    };
}

// ─── Factory — keep this exact signature so RenWeb can load the plugin ────────

extern "C" PLUGIN_EXPORT RenWeb::Plugin* createPlugin(std::shared_ptr<RenWeb::ILogger> logger) {
    return new ${pluginClass}(logger);
}
`;
}

// ─── Makefile ─────────────────────────────────────────────────────────────────

/**
 * Generate the plugin `makefile`.
 * @param {object} info       - Project metadata (title, version)
 * @param {string} pluginName - Snake-case plugin identifier
 * @returns {string}
 */
function makePluginMakefile(info, pluginName) {
    return `# =============================================================================
# ${info.title} — RenWeb Plugin Makefile
# =============================================================================
# Usage:
#   make                          Build for current OS/arch (release)
#   make TARGET=debug             Build in debug mode
#   make TOOLCHAIN=<triplet>      Cross-compile (Linux only, same triplets as
#                                 the engine makefile)
#   make ARCH=<arch>              Override the arch label in the output filename
#   make clean                    Remove build outputs and object files
#   make info                     Print build configuration
#
# Output filename: <name>-<version>-<os>-<arch>.<ext>
#   e.g.  ${pluginName}-${info.version}-linux-x86_64.so
#         ${pluginName}-${info.version}-windows-x86_64.dll
#         ${pluginName}-${info.version}-macos-arm64.dylib
# =============================================================================

# -----------------------------------------------------------------------------
# Metadata (override on the command line: make PLUGIN_NAME=foo PLUGIN_VERSION=1.2.3)
# -----------------------------------------------------------------------------
PLUGIN_NAME    := ${pluginName}
PLUGIN_VERSION := ${info.version}

# -----------------------------------------------------------------------------
# Cross-compilation toolchain (Linux only)
# Supported triplets (same as engine makefile):
#   arm-linux-gnueabihf   aarch64-linux-gnu   i686-linux-gnu
#   mips-linux-gnu        mipsel-linux-gnu
#   mips64-linux-gnuabi64 mips64el-linux-gnuabi64
#   powerpc-linux-gnu     powerpc64-linux-gnu
#   riscv64-linux-gnu     s390x-linux-gnu     sparc64-linux-gnu
# -----------------------------------------------------------------------------
TOOLCHAIN :=
ifdef TOOLCHAIN
\tCROSS_COMPILE := $(TOOLCHAIN)-
\tSYSROOT       := --sysroot=/usr/$(TOOLCHAIN)
\tifeq ($(TOOLCHAIN),arm-linux-gnueabihf)
\t\tARCH := arm32
\telse ifeq ($(TOOLCHAIN),aarch64-linux-gnu)
\t\tARCH := arm64
\telse ifeq ($(TOOLCHAIN),i686-linux-gnu)
\t\tARCH := x86_32
\telse ifeq ($(TOOLCHAIN),mips-linux-gnu)
\t\tARCH := mips32
\telse ifeq ($(TOOLCHAIN),mipsel-linux-gnu)
\t\tARCH := mips32el
\telse ifeq ($(TOOLCHAIN),mips64-linux-gnuabi64)
\t\tARCH := mips64
\telse ifeq ($(TOOLCHAIN),mips64el-linux-gnuabi64)
\t\tARCH := mips64el
\telse ifeq ($(TOOLCHAIN),powerpc-linux-gnu)
\t\tARCH := powerpc32
\telse ifeq ($(TOOLCHAIN),powerpc64-linux-gnu)
\t\tARCH := powerpc64
\telse ifeq ($(TOOLCHAIN),riscv64-linux-gnu)
\t\tARCH := riscv64
\telse ifeq ($(TOOLCHAIN),s390x-linux-gnu)
\t\tARCH := s390x
\telse ifeq ($(TOOLCHAIN),sparc64-linux-gnu)
\t\tARCH := sparc64
\telse ifeq ($(TOOLCHAIN),x86_64-linux-gnu)
\t\tARCH := x86_64
\telse
\t\tARCH := unknown
\tendif
else
\tCROSS_COMPILE :=
\tSYSROOT       :=
endif

# -----------------------------------------------------------------------------
# Build target
# -----------------------------------------------------------------------------
ifndef TARGET
\tTARGET := release
endif

# -----------------------------------------------------------------------------
# OS / compiler / architecture detection
# -----------------------------------------------------------------------------
ifeq ($(OS),Windows_NT)
\tOS_NAME    := windows
\tSHARED_EXT := .dll
\tOBJ_EXT    := .obj
\tOBJ_DIR    := src\\\\.build
\t# Prefer MSVC (cl.exe) when available; fall back to MinGW (g++)
\tifdef VSCMD_ARG_TGT_ARCH
\t\tCXX            := cl
\t\tWINDOWS_CXX    := msvc
\t\tCXXFLAGS       := /std:c++17 /utf-8 /EHsc /W3 /FS /nologo
\t\tifneq ($(TARGET),debug)
\t\t\tCXXFLAGS   += /O2 /GL /GS- /Gy /MT
\t\t\tLDFLAGS    := /LTCG /OPT:REF /OPT:ICF
\t\telse
\t\t\tCXXFLAGS   += /Zi /Od /MTd
\t\t\tLDFLAGS    := /DEBUG
\t\tendif
\t\tifeq ($(VSCMD_ARG_TGT_ARCH),x64)
\t\t\tARCH := x86_64
\t\t\tLDFLAGS += /MACHINE:X64
\t\telse ifeq ($(VSCMD_ARG_TGT_ARCH),x86)
\t\t\tARCH := x86_32
\t\t\tLDFLAGS += /MACHINE:X86
\t\telse ifeq ($(VSCMD_ARG_TGT_ARCH),arm64)
\t\t\tARCH := arm64
\t\t\tLDFLAGS += /MACHINE:ARM64
\t\telse
\t\t\tARCH := x86_64
\t\tendif
\telse
\t\tCXX          := g++
\t\tWINDOWS_CXX  := mingw
\t\tCXXFLAGS     := -std=c++17 -fPIC -Wall
\t\tifneq ($(TARGET),debug)
\t\t\tCXXFLAGS += -O3 -flto
\t\telse
\t\t\tCXXFLAGS += -g -O0
\t\tendif
\t\tSHARED_FLAGS := -shared
\t\tifndef ARCH
\t\t\tARCH := x86_64
\t\tendif
\tendif
else
\tSHELL   := /bin/bash
\tUNAME_S := $(shell uname -s)
\tOBJ_EXT := .o
\tOBJ_DIR := src/.build
\tifeq ($(UNAME_S),Darwin)
\t\tOS_NAME      := macos
\t\tSHARED_EXT   := .dylib
\t\tSHARED_FLAGS := -dynamiclib
\t\tCXX          := clang++
\t\tCXXFLAGS     := -std=c++17 -MMD -MP -fPIC -mmacosx-version-min=10.15
\t\tLDFLAGS      := -mmacosx-version-min=10.15
\t\tifeq ($(TARGET),debug)
\t\t\tCXXFLAGS += -g -O0 -Wall -Wextra -Wno-missing-braces
\t\telse
\t\t\tCXXFLAGS += -O3 -flto
\t\tendif
\t\tifdef ARCH_FLAGS
\t\t\tCXXFLAGS += $(ARCH_FLAGS)
\t\t\tLDFLAGS  += $(ARCH_FLAGS)
\t\tendif
\t\tifndef ARCH
\t\t\tUNAME_M := $(shell uname -m)
\t\t\tifeq ($(UNAME_M),arm64)
\t\t\t\tARCH := arm64
\t\t\telse
\t\t\t\tARCH := x86_64
\t\t\tendif
\t\tendif
\telse
\t\tOS_NAME      := linux
\t\tSHARED_EXT   := .so
\t\tSHARED_FLAGS := -shared
\t\tCXX          := $(CROSS_COMPILE)g++
\t\tCXXFLAGS     := -std=c++17 -MMD -MP -fPIC -D_GNU_SOURCE
\t\tifeq ($(TARGET),debug)
\t\t\tCXXFLAGS += $(SYSROOT) -g -O0 -Wall -Wextra -Wno-missing-braces
\t\telse
\t\t\tCXXFLAGS += $(SYSROOT) -O3 -flto
\t\tendif
\t\tifdef TOOLCHAIN
\t\t\tCXXFLAGS += -isystem /usr/$(TOOLCHAIN)/usr/local/include
\t\tendif
\t\tifndef ARCH
\t\t\tUNAME_M := $(shell uname -m)
\t\t\tifeq ($(UNAME_M),x86_64)
\t\t\t\tARCH := x86_64
\t\t\telse ifeq ($(UNAME_M),i686)
\t\t\t\tARCH := x86_32
\t\t\telse ifeq ($(UNAME_M),aarch64)
\t\t\t\tARCH := arm64
\t\t\telse ifeq ($(UNAME_M),armv7l)
\t\t\t\tARCH := arm32
\t\t\telse
\t\t\t\tARCH := $(UNAME_M)
\t\t\tendif
\t\tendif
\tendif
endif

# -----------------------------------------------------------------------------
# Paths and output filename
# -----------------------------------------------------------------------------
BUILD_DIR := build/plugins
SRC       := src/${pluginName}.cpp
OBJ       := $(OBJ_DIR)/${pluginName}$(OBJ_EXT)
OUT       := $(BUILD_DIR)/$(PLUGIN_NAME)-$(PLUGIN_VERSION)-$(OS_NAME)-$(ARCH)$(SHARED_EXT)

# -----------------------------------------------------------------------------
# Build targets
# -----------------------------------------------------------------------------
.PHONY: all clear clean info help

all: $(OUT)

# ── Link ──────────────────────────────────────────────────────────────────────
ifeq ($(OS_NAME),windows)
ifeq ($(WINDOWS_CXX),msvc)
$(OUT): $(OBJ) | $(BUILD_DIR)
\t$(CXX) $(OBJ) /LD /Fe:$(OUT) /link $(LDFLAGS)
else
$(OUT): $(OBJ) | $(BUILD_DIR)
\t$(CXX) $(SHARED_FLAGS) $(LDFLAGS) -o $@ $^
endif
else
$(OUT): $(OBJ) | $(BUILD_DIR)
\t$(CXX) $(CXXFLAGS) $(SHARED_FLAGS) $(LDFLAGS) -o $@ $^
endif

$(BUILD_DIR):
ifeq ($(OS_NAME),windows)
\tmkdir "$(BUILD_DIR)" 2>nul || exit 0
else
\tmkdir -p $(BUILD_DIR)
endif

# ── Compile ───────────────────────────────────────────────────────────────────
ifeq ($(OS_NAME),windows)
ifeq ($(WINDOWS_CXX),msvc)
$(OBJ): $(SRC) include/${pluginName}.hpp include/plugin.hpp | $(OBJ_DIR)
\t$(CXX) $(CXXFLAGS) /I include/ /c $(SRC) /Fo$@
else
$(OBJ): $(SRC) include/${pluginName}.hpp include/plugin.hpp | $(OBJ_DIR)
\t$(CXX) $(CXXFLAGS) -I include/ -c $< -o $@
endif
else
$(OBJ): $(SRC) include/${pluginName}.hpp include/plugin.hpp | $(OBJ_DIR)
\t$(CXX) $(CXXFLAGS) -I include/ -c $< -o $@
endif

$(OBJ_DIR):
ifeq ($(OS_NAME),windows)
\tmkdir "$@" 2>nul || exit 0
else
\tmkdir -p $@
endif

# ── Utility ───────────────────────────────────────────────────────────────────
# clear: remove only object files (used between cross-compile builds)
clear:
ifeq ($(OS_NAME),windows)
\t-rmdir /s /q "$(OBJ_DIR)" 2>nul
else
\trm -rf $(OBJ_DIR)
endif

# clean: remove object files AND build/plugins output
clean:
ifeq ($(OS_NAME),windows)
\t-rmdir /s /q "$(OBJ_DIR)" 2>nul
\t-rmdir /s /q "$(BUILD_DIR)" 2>nul
else
\trm -rf $(OBJ_DIR) $(BUILD_DIR)
endif

info:
\t@echo "Plugin:   $(PLUGIN_NAME)"
\t@echo "Version:  $(PLUGIN_VERSION)"
\t@echo "OS:       $(OS_NAME)"
\t@echo "Arch:     $(ARCH)"
\t@echo "Target:   $(TARGET)"
\t@echo "Compiler: $(CXX)"
\t@echo "Output:   $(OUT)"

help:
\t@echo ""
\t@echo "Usage: make [TARGET=release|debug] [CROSS_COMPILE=<prefix>]"
\t@echo ""
\t@echo "  all     Build the plugin shared library (default)"
\t@echo "  clear   Remove object files only (useful between cross-compile passes)"
\t@echo "  clean   Remove object files and build/plugins/ output"
\t@echo "  info    Print plugin name, version, compiler, and output path"
\t@echo "  help    Show this message"
\t@echo ""
\t@echo "Tip: run ./build_all_archs.sh to build for all supported architectures."
\t@echo ""

# ── Dependency tracking (gcc/clang only) ──────────────────────────────────────
ifneq ($(OS_NAME),windows)
-include $(OBJ:.o=.d)
endif
`;
}

// ─── build_all_archs.sh ───────────────────────────────────────────────────────

/**
 * Generate `build_all_archs.sh` content.
 * @param {string} pluginName - Snake-case plugin identifier
 * @returns {string}
 */
function makePluginBuildAllArchs(pluginName) {
    return `#!/usr/bin/env bash
# build_all_archs.sh — build ${pluginName} plugin for all supported architectures
#
# Usage:
#   ./build_all_archs.sh
#
# On Linux:   builds all 13 toolchain architectures (requires cross-compilers)
# On macOS:   builds arm64 + x86_64, then creates a universal .dylib via lipo
# On Windows: builds x64 + x86 + arm64 via MSVC (requires VS 2022)

set -e

RESET='\\033[0m'
RED='\\033[31m'
GREEN='\\033[32m'
YELLOW='\\033[33m'
MAGENTA='\\033[35m'
CYAN='\\033[36m'
BOLD='\\033[1m'

LINUX_TOOLCHAINS="x86_64-linux-gnu i686-linux-gnu aarch64-linux-gnu arm-linux-gnueabihf mips-linux-gnu mipsel-linux-gnu mips64-linux-gnuabi64 mips64el-linux-gnuabi64 powerpc-linux-gnu powerpc64-linux-gnu riscv64-linux-gnu s390x-linux-gnu sparc64-linux-gnu"

print_header()  { echo -e "$CYAN$BOLD========================================$RESET"; echo -e "$CYAN$BOLD$1$RESET"; echo -e "$CYAN$BOLD========================================$RESET"; }
print_info()    { echo -e "$GREEN$BOLD[INFO]$RESET $1"; }
print_warning() { echo -e "$YELLOW$BOLD[WARN]$RESET $1"; }
print_error()   { echo -e "$RED$BOLD[ERROR]$RESET $1"; }
print_success() { echo -e "$GREEN$BOLD[SUCCESS]$RESET $1"; }
print_building(){ echo -e "$MAGENTA$BOLD[BUILD]$RESET Building for $CYAN$1$RESET ($YELLOW$2$RESET)"; }

command_exists()  { command -v "$1" >/dev/null 2>&1; }
toolchain_exists(){ command_exists "$1-gcc" && command_exists "$1-g++"; }

build_for_toolchain() {
    local toolchain=$1 arch_name=$2
    print_building "$arch_name" "$toolchain"
    if make clear TOOLCHAIN="$toolchain" TARGET=release; then
        if make TOOLCHAIN="$toolchain" TARGET=release -j\$(nproc 2>/dev/null || echo 4); then
            print_success "Built $arch_name"; return 0
        else
            print_error "Failed to build $arch_name"; return 1
        fi
    else
        print_error "Failed to clear for $arch_name"; return 1
    fi
}

build_native() {
    local arch_name=$1
    print_building "$arch_name" "native"
    if make clear TARGET=release; then
        if make TARGET=release -j\$(nproc 2>/dev/null || echo 4); then
            print_success "Built native $arch_name"; return 0
        else
            print_error "Failed to build native"; return 1
        fi
    else
        print_error "Failed to clear native build"; return 1
    fi
}

detect_os() {
    case "\$(uname -s)" in
        Linux*)          OS_NAME="Linux";   HOST_ARCH="\$(uname -m)" ;;
        Darwin*)         OS_NAME="macOS";   HOST_ARCH="\$(uname -m)" ;;
        CYGWIN*|MINGW*|MSYS*) OS_NAME="Windows" ;;
        *) print_error "Unsupported OS: \$(uname -s)"; exit 1 ;;
    esac
}

build_linux() {
    local success_count=0 fail_count=0 total_count=0
    print_header "Building ${pluginName} for Linux (13 architectures)"
    print_info "Host: $HOST_ARCH"
    echo ""

    local host_toolchain=""
    case "$HOST_ARCH" in
        x86_64)        host_toolchain="x86_64-linux-gnu" ;;
        i686|i386)     host_toolchain="i686-linux-gnu" ;;
        aarch64|arm64) host_toolchain="aarch64-linux-gnu" ;;
        armv7l|armhf)  host_toolchain="arm-linux-gnueabihf" ;;
        mips)          host_toolchain="mips-linux-gnu" ;;
        mipsel)        host_toolchain="mipsel-linux-gnu" ;;
        mips64)        host_toolchain="mips64-linux-gnuabi64" ;;
        mips64el)      host_toolchain="mips64el-linux-gnuabi64" ;;
        ppc)           host_toolchain="powerpc-linux-gnu" ;;
        ppc64)         host_toolchain="powerpc64-linux-gnu" ;;
        riscv64)       host_toolchain="riscv64-linux-gnu" ;;
        s390x)         host_toolchain="s390x-linux-gnu" ;;
        sparc64)       host_toolchain="sparc64-linux-gnu" ;;
    esac

    total_count=\$((total_count + 1))
    if build_native "native ($HOST_ARCH)"; then
        success_count=\$((success_count + 1))
    else
        fail_count=\$((fail_count + 1))
    fi
    echo ""

    for toolchain in $LINUX_TOOLCHAINS; do
        if [ "$toolchain" = "$host_toolchain" ]; then
            print_info "Skipping $toolchain (already built natively)"
            continue
        fi
        total_count=\$((total_count + 1))
        if toolchain_exists "$toolchain"; then
            if build_for_toolchain "$toolchain" "$toolchain"; then
                success_count=\$((success_count + 1))
            else
                fail_count=\$((fail_count + 1))
            fi
        else
            print_warning "Toolchain $toolchain not found, skipping"
            fail_count=\$((fail_count + 1))
        fi
        echo ""
    done

    print_header "Build Summary"
    echo -e "$GREEN Successful: $BOLD$success_count$RESET  $RED Failed: $BOLD$fail_count$RESET  $CYAN Total: $BOLD$total_count$RESET"
    if [ \$success_count -gt 0 ]; then
        print_info "Output: ./build/plugins/"
        ls -lh build/plugins/ 2>/dev/null | grep '\\.so$' || true
    fi
}

build_macos() {
    local success_count=0 fail_count=0
    print_header "Building ${pluginName} for macOS (arm64 + x86_64)"
    echo ""

    command_exists clang++ || { print_error "clang++ not found"; return 1; }
    local ncpu=\$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

    for arch in arm64 x86_64; do
        print_building "$arch" "clang++ -arch $arch"
        make clear >/dev/null 2>&1 || true
        if ARCH="$arch" ARCH_FLAGS="-arch $arch" make TARGET=release -j\$ncpu; then
            print_success "Built $arch"
            success_count=\$((success_count + 1))
        else
            print_error "Failed $arch"
            fail_count=\$((fail_count + 1))
        fi
        echo ""
    done

    if [ \$success_count -eq 2 ]; then
        print_info "Creating universal dylib (arm64 + x86_64)..."
        local arm64_lib=\$(ls build/plugins/*-macos-arm64.dylib 2>/dev/null | head -1)
        local x86_lib=\$(ls build/plugins/*-macos-x86_64.dylib 2>/dev/null | head -1)
        if [ -n "$arm64_lib" ] && [ -n "$x86_lib" ]; then
            local universal="\${arm64_lib/arm64/universal}"
            if lipo -create "$arm64_lib" "$x86_lib" -output "$universal" 2>/dev/null; then
                print_success "Universal dylib: $universal"
                lipo -info "$universal"
            else
                print_warning "lipo failed — universal binary not created"
            fi
        fi
    fi

    print_header "Build Summary"
    echo -e "$GREEN Successful: $BOLD$success_count$RESET  $RED Failed: $BOLD$fail_count$RESET"
    if [ \$success_count -gt 0 ]; then
        print_info "Output: ./build/plugins/"
        ls -lh build/plugins/ 2>/dev/null | grep '\\.dylib$' || true
    fi
}

build_windows() {
    local success_count=0 fail_count=0
    print_header "Building ${pluginName} for Windows (x64 + x86 + arm64)"
    echo ""

    local vswhere="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    [ -f "$vswhere" ] || vswhere="/c/Program Files/Microsoft Visual Studio/Installer/vswhere.exe"

    local vs_path=""
    [ -f "$vswhere" ] && vs_path=\$("$vswhere" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>/dev/null | head -1)
    [ -z "$vs_path" ] && vs_path="/c/Program Files/Microsoft Visual Studio/2022/Community"
    [ -d "$vs_path" ] || { print_error "Visual Studio 2022 not found"; return 1; }

    local vcvars_path="$vs_path/VC/Auxiliary/Build"
    [ -d "$vcvars_path" ] || { print_error "vcvars path not found: $vcvars_path"; return 1; }

    for arch_spec in "x64:x86_64:vcvars64.bat" "x86:x86_32:vcvars32.bat" "arm64:arm64:vcvarsamd64_arm64.bat"; do
        IFS=':' read -r win_arch make_arch vcvars <<< "$arch_spec"
        print_building "$win_arch" "$vcvars"
        local vcvars_win=\$(cygpath -w "$vcvars_path/$vcvars" 2>/dev/null || echo "$vcvars_path\\\\$vcvars")
        local temp_bat=\$(mktemp --suffix=.bat)
        cat > "$temp_bat" <<BATEOF
@echo off
call "$vcvars_win" >nul 2>&1
if errorlevel 1 exit /b 1
make clear ARCH=$make_arch TARGET=release >nul 2>&1
if errorlevel 1 exit /b 1
make ARCH=$make_arch TARGET=release -j4
BATEOF
        if cmd //c "\$(cygpath -w "$temp_bat" 2>/dev/null || echo "$temp_bat")" 2>&1; then
            print_success "Built $win_arch"
            success_count=\$((success_count + 1))
        else
            print_error "Failed $win_arch"
            fail_count=\$((fail_count + 1))
        fi
        rm -f "$temp_bat"
        echo ""
    done

    print_header "Build Summary"
    echo -e "$GREEN Successful: $BOLD$success_count$RESET  $RED Failed: $BOLD$fail_count$RESET"
    if [ \$success_count -gt 0 ]; then
        print_info "Output: ./build/plugins/"
        ls -lh build/plugins/ 2>/dev/null | grep '\\.dll$' || true
    fi
    if [ \$fail_count -gt 0 ]; then
        print_warning "ARM64 failures may need: MSVC v143 ARM64 build tools (via VS Installer)"
    fi
}

main() {
    case "\${1:-}" in
        --help|-h)
            echo "Usage: $0"
            echo "Builds the ${pluginName} plugin for all architectures on the current OS."
            echo "  Linux:   13 cross-compiled .so files (requires toolchains)"
            echo "  macOS:   arm64 + x86_64 .dylib files + universal binary"
            echo "  Windows: x64 + x86 + arm64 .dll files (requires VS 2022)"
            exit 0 ;;
        "") ;;
        *) print_error "Unknown option: $1"; exit 1 ;;
    esac

    detect_os
    print_header "${pluginName} Plugin — Multi-Architecture Build"
    print_info "OS: $OS_NAME"
    echo ""

    command_exists make || { print_error "make not found"; exit 1; }
    make clean

    case "$OS_NAME" in
        Linux)   build_linux ;;
        macOS)   build_macos ;;
        Windows) build_windows ;;
    esac
}

main "$@"
`;
}

// ─── README.md ────────────────────────────────────────────────────────────────

/**
 * Generate `README.md` for the plugin project.
 * @param {object} info       - Project metadata
 * @param {string} pluginName - Snake-case plugin identifier
 * @returns {string}
 */
function makePluginReadme(info, pluginName) {
    return `# ${info.title}

${info.description || 'A RenWeb plugin.'}

## Source layout

\`\`\`
${pluginName}/
├── build/
│   ├── renweb-<version>-<os>-<arch>  # downloaded engine executable
│   ├── info.json                     # minimal launch config
│   ├── config.json
│   ├── content/test/index.html       # plugin test harness page
│   └── plugins/                      # drop your built .so/.dll/.dylib here
├── include/
│   ├── plugin.hpp          # RenWeb Plugin base class (fetched from engine)
│   └── ${pluginName}.hpp   # Plugin class declaration
├── src/
│   └── ${pluginName}.cpp   # Plugin implementation
├── build_all_archs.sh  # Build for all OS/arch targets
└── makefile
\`\`\`

## Dependencies

Requires a C++17-capable compiler and the **Boost** development headers  
(Boost.JSON is compiled statically into the plugin via \`#include <boost/json/src.hpp>\` —
no separate \`libboost_json\` needed at runtime).

| Platform | Command |
|----------|---------|
| **Ubuntu / Debian** | \`sudo apt install libboost-dev\` |
| **Fedora / RHEL** | \`sudo dnf install boost-devel\` |
| **Arch Linux** | \`sudo pacman -S boost\` |
| **openSUSE** | \`sudo zypper install boost-devel\` |
| **Alpine Linux** | \`apk add boost-dev\` |
| **macOS (Homebrew)** | \`brew install boost\` |
| **Windows (vcpkg)** | \`vcpkg install boost-json:x64-windows\` then add the vcpkg include path |
| **Windows (manual)** | Download from [boost.org](https://www.boost.org/users/download/) and add the extracted folder to \`CPATH\` or your IDE include paths |

## Building

\`\`\`sh
# Linux / macOS — release
make

# Linux / macOS — debug
make TARGET=debug

# Cross-compile for ARM64 on Linux
make TOOLCHAIN=aarch64-linux-gnu

# Windows (MinGW or MSVC Developer Prompt)
make
\`\`\`

Output: \`${pluginName}-${info.version}-<os>-<arch>.so\` (or \`.dll\` / \`.dylib\`)

Run \`make info\` to see the resolved build configuration.

## Installing

Copy the built library into your RenWeb project's \`build/plugins/\` directory.

## Usage in JavaScript

> Plugin functions are bound as \`BIND_plugin_<internal_name>_<function>\` in the JS engine.

\`\`\`js
// Square a number
const sq = await BIND_plugin_${pluginName}_square(7);   // → 49

// Factorial
const fact = await BIND_plugin_${pluginName}_factorial(5);  // → 120

// Reverse a string (strings must be encoded with Utils.encode)
const rev = await BIND_plugin_${pluginName}_reverse_string(Utils.encode("Hello"));  // → "olleH"
\`\`\`

## API

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| \`square\` | \`number\` | \`number\` | Returns the square of the input |
| \`factorial\` | \`number\` | \`number\` | Returns n! via the gamma function |
| \`reverse_string\` | \`Utils.encode(string)\` | \`string\` | Returns the reversed string |

## License

${info.license || 'BSL-1.0'}
`;
}

// ─── .gitignore ───────────────────────────────────────────────────────────────

/**
 * Generate `.gitignore` content for a plugin project.
 * @returns {string}
 */
function makePluginGitignore() {
    return `# Build outputs
*.so
*.dylib
*.dll
*.o
*.obj
*.a
src/.build/

# Test environment (fetched at project creation time)
build/content/
build/renweb-*
build/*.exe
`;
}

// ─── GitHub Actions workflow ──────────────────────────────────────────────────

/**
 * Generate `.github/workflows/build.yml` content.
 * @param {string} pluginName - Snake-case plugin identifier
 * @returns {string}
 */
function makePluginWorkflow(pluginName) {
    return `name: Build Plugin

on:
  push:
  pull_request:

jobs:
  build:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: \${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Install Boost headers (Linux)
        if: runner.os == 'Linux'
        run: sudo apt-get install -y libboost-dev

      - name: Install Boost headers (macOS)
        if: runner.os == 'macOS'
        run: brew install boost

      - name: Install Boost headers (Windows)
        if: runner.os == 'Windows'
        shell: bash
        run: |
          vcpkg install boost-json:x64-windows
          mkdir -p include
          cp -r "C:/vcpkg/installed/x64-windows/include/boost" include/

      - name: Build (Linux/macOS)
        if: runner.os != 'Windows'
        run: make

      - name: Build (Windows)
        if: runner.os == 'Windows'
        shell: bash
        run: make

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${pluginName}-\${{ matrix.os }}
          path: |
            *.so
            *.dylib
            *.dll
`;
}

// ─── Plugin test environment ──────────────────────────────────────────────────

/**
 * Generate the minimal `build/info.json` for the plugin test environment.
 * @param {object} info       - Project metadata
 * @returns {string} JSON string
 */
function makePluginTestInfoJson(info) {
    return JSON.stringify({
        title:          info.title,
        version:        info.version,
        starting_pages: ['test'],
    }, null, 4);
}

/**
 * Generate the minimal `build/config.json` for the plugin test environment.
 * @param {object} info       - Project metadata
 * @returns {string} JSON string
 */
function makePluginTestConfigJson(info) {
    return JSON.stringify({
        __defaults__: {
            title_bar: true,
            size:      { width: 900, height: 640 },
            resizable: true,
            opacity:   1.0,
        },
        test: { title: `${info.title} — Plugin Test`, merge_defaults: true },
    }, null, 4);
}

/**
 * Generate the plugin test harness `build/content/test/index.html`.
 * @param {object} info       - Project metadata
 * @param {string} pluginName - Snake-case plugin identifier
 * @returns {string}
 */
function makePluginTestHarnessHtml(info, pluginName) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${info.title} — Plugin Test</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 760px; margin: 40px auto; padding: 0 20px; background: #0f0f0f; color: #e0e0e0; }
    h1   { color: #c084fc; margin-bottom: 4px; }
    .subtitle { color: #6b7280; font-size: .9rem; margin-bottom: 28px; }
    pre  { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px; overflow: auto; color: #a5f3fc; font-size: .9rem; line-height: 1.5; }
    .err { color: #f87171; }
  </style>
</head>
<body>
  <h1>${info.title}</h1>
  <p class="subtitle">Plugin test harness &mdash; <code>${pluginName}</code></p>
  <pre id="out">Loading&hellip;</pre>
  <script type="module">
    /// <reference path="./index.d.ts" />
    import { Plugins } from './index.js';
    const out = document.getElementById('out');
    try {
      const list = await Plugins.getPluginsList();
      out.textContent = JSON.stringify(list, null, 2);
    } catch (e) {
      out.className = 'err';
      out.textContent = String(e);
    }
  </script>
</body>
</html>
`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
    makePluginHpp,
    makePluginCpp,
    makePluginMakefile,
    makePluginBuildAllArchs,
    makePluginReadme,
    makePluginGitignore,
    makePluginWorkflow,
    makePluginTestInfoJson,
    makePluginTestConfigJson,
    makePluginTestHarnessHtml,
};
