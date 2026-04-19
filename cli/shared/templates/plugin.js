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
    return `// Compile Boost.JSON implementation in this TU so plugin builds
// without requiring prebuilt Boost stage libraries.
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

extern "C" PLUGIN_EXPORT void destroyPlugin(RenWeb::Plugin* plugin) {
    delete plugin;
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
#   make                          Build for current OS/arch (debug)
#   make TARGET=release           Build in release mode
#   make TOOLCHAIN=<triplet>      Cross-compile (Linux only, same triplets as
#                                 the engine makefile)
#   make ARCH=x86_32              Linux x86_32 via native multilib (-m32)
#   make ARCH=<arch>              Override the arch label in the output filename
#   make clear                    Remove only object files (between arch passes)
#   make clean                    Remove object files and build/plugins/ output
#   make info                     Print build configuration
#   make help                     Show this help
#
# Plugin name and version are read from the RenWeb::Plugin constructor in
# src/*.cpp — the second string param is the internal_name; third is version.
# Output: <internal_name>-<version>-<os>-<arch>.<ext>
# =============================================================================

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
REQUIRED_BOOST_VERSION := 109000

ifneq ($(strip $(TOOLCHAIN)),)
    CROSS_COMPILE := $(TOOLCHAIN)-
endif

# -----------------------------------------------------------------------------
# OS / compiler / architecture detection
# -----------------------------------------------------------------------------
ifeq ($(OS),Windows_NT)
\tSHELL      := C:\\Program Files\\Git\\usr\\bin\\sh.exe
\tOS_NAME    := windows
\tSHARED_EXT := .dll
\tOBJ_EXT    := .obj
\tOBJ_DIR    := src\\\\.build
\t_NON_COMPILE_GOALS := clean clear info help
\t_COMPILE_GOALS_REQ := $(filter-out $(_NON_COMPILE_GOALS), $(if $(MAKECMDGOALS),$(MAKECMDGOALS),all))
\t_SHELL_INIT        := $(shell :)
\tifeq ($(RENWEB_VS_BOOTSTRAPPED),)
\tCL_IN_PATH := $(shell which cl 2>/dev/null)
\tifeq ($(CL_IN_PATH),)
\tifneq ($(_COMPILE_GOALS_REQ),)
\tNEED_VS_BOOTSTRAP := 1
\tendif
\tendif
\tendif
\tCXX      := cl
\tifeq ($(TARGET),debug)
        CXXFLAGS := /std:c++20 /utf-8 /EHsc /W3 /FS /nologo /Od /MT /Zi /DBOOST_ALL_NO_LIB /DRENWEB_EXPECTED_BOOST_VERSION=$(REQUIRED_BOOST_VERSION)
\t\tLDFLAGS  := /DEBUG
\telse
		CXXFLAGS := /std:c++20 /utf-8 /EHsc /W3 /FS /nologo /O2 /GS- /Gy /MT /DBOOST_ALL_NO_LIB /DRENWEB_EXPECTED_BOOST_VERSION=$(REQUIRED_BOOST_VERSION)
\t\tLDFLAGS  := /OPT:REF /OPT:ICF
\tendif
\tifdef VSCMD_ARG_TGT_ARCH
\t\tifeq ($(VSCMD_ARG_TGT_ARCH),x64)
\t\t\tARCH    := x86_64
\t\t\tLDFLAGS += /MACHINE:X64
\t\telse ifeq ($(VSCMD_ARG_TGT_ARCH),x86)
\t\t\tARCH    := x86_32
\t\t\tLDFLAGS += /MACHINE:X86
\t\telse ifeq ($(VSCMD_ARG_TGT_ARCH),arm64)
\t\t\tARCH    := arm64
\t\t\tLDFLAGS += /MACHINE:ARM64
\t\telse
\t\t\tARCH    := x86_64
\t\t\tLDFLAGS += /MACHINE:X64
\t\tendif
	else
		ifndef ARCH
			ARCH := x86_64
		endif
		ifeq ($(ARCH),x86_32)
			LDFLAGS += /MACHINE:X86
		else ifeq ($(ARCH),arm64)
			LDFLAGS += /MACHINE:ARM64
		else
			LDFLAGS += /MACHINE:X64
		endif
\tendif
    # ---- Boost header detection (external-only) ----
    # Plugins use boostorg/boost as a single source of truth.
    ifneq ($(wildcard external/boost/libs/json/include/boost/json/src.hpp),)
        BOOST_JSON_INC := /Iexternal/boost/libs/json/include
    endif
    ifneq ($(wildcard external/boost/libs/config/include/boost/config.hpp),)
        BOOST_TRANSITIVE_INCS := $(foreach d,$(wildcard external/boost/libs/*/include),/I$(d))
    endif
    ifneq ($(BOOST_JSON_INC),)
        CXXFLAGS += $(BOOST_JSON_INC)
        ifneq ($(BOOST_TRANSITIVE_INCS),)
            CXXFLAGS += $(BOOST_TRANSITIVE_INCS)
        else
$(warning [RenWeb] Boost transitive headers not found in external/boost/libs/*/include. Initialize required external/boost submodules.)
        endif
    else
$(warning [RenWeb] Boost.JSON headers not found in external/boost/libs/json/include.)
	endif
else
\tSHELL   := /bin/sh
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
		CXXFLAGS += -O3 -flto -DRENWEB_EXPECTED_BOOST_VERSION=$(REQUIRED_BOOST_VERSION)
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
\t\tBREW_BOOST := $(shell brew --prefix boost 2>/dev/null)
\t\tifdef BREW_BOOST
\t\t\tCXXFLAGS += -isystem $(BREW_BOOST)/include
\t\tendif
\telse
\t\tOS_NAME      := linux
\t\tSHARED_EXT   := .so
\t\tSHARED_FLAGS := -shared
\t\tCXX          := $(CROSS_COMPILE)g++
\t\tCXXFLAGS     := -std=c++20 -MMD -MP -fPIC -D_GNU_SOURCE
		CXXFLAGS += $(SYSROOT) -O3 -flto -DRENWEB_EXPECTED_BOOST_VERSION=$(REQUIRED_BOOST_VERSION)
		ifneq ($(strip $(TOOLCHAIN)),)
\t\t\tCXXFLAGS += -isystem /usr/$(TOOLCHAIN)/usr/local/include
\t\t\tLDFLAGS  := --sysroot=/usr/$(TOOLCHAIN) -L/lib -L/lib64 -L/usr/lib -L/usr/lib64
\t\telse
\t\t\tLDFLAGS  :=
\t\tendif
		ifndef ARCH
			ifeq ($(TOOLCHAIN),arm-linux-gnueabihf)
				ARCH := arm32
			else ifeq ($(TOOLCHAIN),aarch64-linux-gnu)
				ARCH := arm64
			else ifeq ($(TOOLCHAIN),i686-linux-gnu)
				ARCH := x86_32
			else ifeq ($(TOOLCHAIN),mips-linux-gnu)
				ARCH := mips32
			else ifeq ($(TOOLCHAIN),mipsel-linux-gnu)
				ARCH := mips32el
			else ifeq ($(TOOLCHAIN),mips64-linux-gnuabi64)
				ARCH := mips64
			else ifeq ($(TOOLCHAIN),mips64el-linux-gnuabi64)
				ARCH := mips64el
			else ifeq ($(TOOLCHAIN),powerpc-linux-gnu)
				ARCH := powerpc32
			else ifeq ($(TOOLCHAIN),powerpc64-linux-gnu)
				ARCH := powerpc64
			else ifeq ($(TOOLCHAIN),riscv64-linux-gnu)
				ARCH := riscv64
			else ifeq ($(TOOLCHAIN),s390x-linux-gnu)
				ARCH := s390x
			else ifeq ($(TOOLCHAIN),sparc64-linux-gnu)
				ARCH := sparc64
			else ifeq ($(TOOLCHAIN),x86_64-linux-gnu)
				ARCH := x86_64
			endif
		endif
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
# Utility — colored output (matches engine makefile conventions)
# -----------------------------------------------------------------------------
RESET   := \\033[0m
RED     := \\033[31m
GREEN   := \\033[32m
YELLOW  := \\033[33m
MAGENTA := \\033[35m
CYAN    := \\033[36m
BOLD    := \\033[1m
define describe
\t@printf "$(GREEN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET) $(GREEN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET)\\n" "$(1)" "$(2)" "$(3)" "$(4)"
endef
define warn
\t@printf "$(YELLOW)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET) $(YELLOW)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET)\\n" "$(1)" "$(2)" "$(3)" "$(4)"
endef
define step
\t@printf "$(CYAN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET) $(CYAN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET)\\n" "$(1)" "$(2)" "$(3)" "$(4)"
endef

# -----------------------------------------------------------------------------
# Paths and plugin metadata
# Plugin name and version are read from the RenWeb::Plugin() constructor
# in src/*.cpp: the 2nd string param is internal_name; the 3rd is version.
# -----------------------------------------------------------------------------
BUILD_DIR      := build/plugins
SRC            := $(sort $(wildcard src/*.cpp))
OBJ            := $(patsubst src/%.cpp,$(OBJ_DIR)/%$(OBJ_EXT),$(SRC))
HEADERS        := $(sort $(wildcard include/*.hpp))
PLUGIN_NAME    := $(shell grep -hE -A5 ': (RenWeb::)?Plugin\\b' src/*.cpp 2>/dev/null | grep -o '"[^"]*"' | sed -n '2p' | tr -d '"' | xargs)
PLUGIN_VERSION := $(shell grep -hE -A5 ': (RenWeb::)?Plugin\\b' src/*.cpp 2>/dev/null | grep -o '"[^"]*"' | sed -n '3p' | tr -d '"' | xargs)
OUT            := $(BUILD_DIR)/$(PLUGIN_NAME)-$(PLUGIN_VERSION)-$(OS_NAME)-$(ARCH)$(SHARED_EXT)

ifeq ($(strip $(SRC)),)
$(error No C++ source files found in src/*.cpp)
endif

# =============================================================================
# VS auto-bootstrap (Windows only: runs when cl.exe is absent from PATH)
# Locates vcvarsall via vswhere, re-execs make with the VS environment set up.
# RENWEB_VS_BOOTSTRAPPED=1 prevents re-entry.
# =============================================================================
ifdef NEED_VS_BOOTSTRAP
VCVARS_BAT := vcvars64.bat
ifeq ($(ARCH),x86_32)
VCVARS_BAT := vcvars32.bat
else ifeq ($(ARCH),arm64)
VCVARS_BAT := vcvarsamd64_arm64.bat
endif
_VS_GOALS := $(if $(MAKECMDGOALS),$(MAKECMDGOALS),all)
_VS_VARS  := $(strip $(foreach v,TARGET ARCH,\\
               $(if $(filter-out undefined default,$(origin $v)),$v=$($v))))
_vs_bootstrap:
\t@VSWHERE="C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"; \\
\tif [ ! -f "$$VSWHERE" ]; then \\
\t\tprintf "\\033[31;1mError\\033[0m cl.exe not in PATH and vswhere.exe not found.\\n"; \\
\t\texit 1; \\
\tfi; \\
\tTMP_VS="/tmp/_rw_plugin_vs.txt"; \\
\tprintf "\\033[36;1mBootstrapping\\033[0m Locating Visual Studio toolchain...\\n"; \\
\t"$$VSWHERE" -latest -products '*' \\
\t\t-requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 \\
\t\t-find "VC/Auxiliary/Build/$(VCVARS_BAT)" \\
\t\t> "$$TMP_VS" 2>/dev/null; \\
\tif [ ! -s "$$TMP_VS" ]; then \\
\t\tprintf "\\033[31;1mError\\033[0m No VS C++ build tools found.\\n"; \\
\t\texit 1; \\
\tfi; \\
\tVCBAT=$$(tr -d '\\r' < "$$TMP_VS" | head -1); \\
\trm -f "$$TMP_VS"; \\
\tprintf "\\033[36;1mBootstrapping\\033[0m Using: %s\\n" "$$VCBAT"; \\
\t_esc=$$(printf '%s' "$$VCBAT" | sed 's/[^0-9A-Za-z]/^&/g'); \\
\tENV_OUT=$$(MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' \\
\t\tcmd.exe /s /c " ; $$_esc && set" </dev/null 2>/dev/null | tr -d '\\r'); \\
\tif [ -z "$$ENV_OUT" ]; then \\
\t\tprintf "\\033[31;1mError\\033[0m cmd.exe returned empty output.\\n"; \\
\t\texit 1; \\
\tfi; \\
\t_vs_path=$$(printf '%s\\n' "$$ENV_OUT" | grep -i '^Path=' | head -1 | cut -d= -f2-); \\
\t_vs_lib=$$(printf '%s\\n' "$$ENV_OUT" | grep -i '^LIB=' | head -1 | cut -d= -f2-); \\
\t_vs_include=$$(printf '%s\\n' "$$ENV_OUT" | grep -i '^INCLUDE=' | head -1 | cut -d= -f2-); \\
\tif [ -n "$$_vs_path" ]; then \\
\t\t_posix_path=$$(cygpath --path --unix "$$_vs_path" 2>/dev/null); \\
\t\t[ -n "$$_posix_path" ] && export PATH="$$_posix_path:$$PATH"; \\
\tfi; \\
\t[ -n "$$_vs_include" ] && export INCLUDE="$$_vs_include"; \\
\t[ -n "$$_vs_lib" ]     && export LIB="$$_vs_lib"; \\
\tprintf "\\033[36;1mBootstrapping\\033[0m VS environment ready. Re-running make...\\n"; \\
\texport RENWEB_VS_BOOTSTRAPPED=1; \\
\t$(MAKE) $(_VS_GOALS) $(_VS_VARS)
$(_VS_GOALS): _vs_bootstrap
.PHONY: _vs_bootstrap $(_VS_GOALS)
else
# =============================================================================
# Build targets
# =============================================================================
.PHONY: all clear clean info help

all: $(OUT)

# ── Link ──────────────────────────────────────────────────────────────────────
ifeq ($(OS_NAME),windows)
$(OUT): $(OBJ) | $(BUILD_DIR)
\t$(call step,Linking,$(PLUGIN_NAME))
	$(CXX) $(OBJ) /LD /Fe:$(OUT) /link $(LDFLAGS) /IMPLIB:$(OBJ_DIR)/$(PLUGIN_NAME).lib /PDB:$(OBJ_DIR)/$(PLUGIN_NAME).pdb
else
$(OUT): $(OBJ) | $(BUILD_DIR)
\t$(call step,Linking,$(PLUGIN_NAME))
	$(CXX) $(CXXFLAGS) $(SHARED_FLAGS) $(LDFLAGS) -o $@ $^
endif

$(BUILD_DIR):
ifeq ($(OS_NAME),windows)
\tmkdir "$(BUILD_DIR)" 2>/dev/null || exit 0
else
\tmkdir -p $(BUILD_DIR)
endif

# ── Compile ───────────────────────────────────────────────────────────────────
ifeq ($(OS_NAME),windows)
$(OBJ_DIR)/%$(OBJ_EXT): src/%.cpp $(HEADERS) | $(OBJ_DIR)
	$(call step,Compiling,$<)
	$(CXX) $(CXXFLAGS) /Fd$(subst \\\\,/,$(OBJ_DIR))/ /I include/ /c $< /Fo$@
else
$(OBJ_DIR)/%$(OBJ_EXT): src/%.cpp $(HEADERS) | $(OBJ_DIR)
	$(call step,Compiling,$<)
	$(CXX) $(CXXFLAGS) -I include/ -c $< -o $@
endif
$(OBJ_DIR):
ifeq ($(OS_NAME),windows)
\tmkdir "$@" 2>/dev/null || exit 0
else
\tmkdir -p $@
endif

# ── Utility ───────────────────────────────────────────────────────────────────
clear:
\t$(call step,Clearing,object files)
\trm -rf $(OBJ_DIR)

clean:
\t$(call step,Cleaning,all build outputs)
\trm -rf $(OBJ_DIR) $(BUILD_DIR)

info:
\t$(call describe,Plugin,$(PLUGIN_NAME),Version,$(PLUGIN_VERSION))
\t$(call describe,OS,$(OS_NAME),Arch,$(ARCH))
\t$(call describe,Target,$(TARGET),Compiler,$(CXX))
\t$(call step,Output,$(OUT))

help:
\t@echo ""
\t@echo "Usage: make [TARGET=debug|release] [TOOLCHAIN=<triplet>]"
\t@echo ""
\t@echo "  all     Build the plugin shared library (default)"
\t@echo "  clear   Remove object files only (useful between cross-compile passes)"
\t@echo "  clean   Remove object files and build/plugins/ output"
\t@echo "  info    Print plugin name, version, compiler, and output path"
\t@echo "  help    Show this message"
\t@echo ""
\t@echo "Tip: run ./build_all_archs.sh to build for all supported architectures."
\t@echo ""

# ── Dependency tracking (gcc/clang only) ─────────────────────────────────────
ifneq ($(OS_NAME),windows)
-include $(OBJ:.o=.d)
endif
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
# build_all_archs.sh — build plugin for all supported architectures
#
# Usage:
#   ./build_all_archs.sh [--arch <arch>] ...
#
# On Linux:   builds all architectures; x86_32 uses native multilib (-m32)
#             by default and falls back to i686 toolchain if needed
# On macOS:   builds arm64 + x86_64, then creates a universal .dylib via lipo
# On Windows: builds x64 + x86 + arm64 via MSVC (requires VS 2022)

set -e

RESET=$(printf '\\033[0m')
RED=$(printf '\\033[31m')
GREEN=$(printf '\\033[32m')
YELLOW=$(printf '\\033[33m')
MAGENTA=$(printf '\\033[35m')
CYAN=$(printf '\\033[36m')
BOLD=$(printf '\\033[1m')

LINUX_TOOLCHAINS="x86_64-linux-gnu i686-linux-gnu aarch64-linux-gnu arm-linux-gnueabihf mips-linux-gnu mipsel-linux-gnu mips64-linux-gnuabi64 mips64el-linux-gnuabi64 powerpc-linux-gnu powerpc64-linux-gnu riscv64-linux-gnu s390x-linux-gnu sparc64-linux-gnu"

PLUGIN_NAME_DISPLAY=$(grep -hE -A5 ': (RenWeb::)?Plugin\\b' src/*.cpp 2>/dev/null | grep -o '"[^"]*"' | sed -n '2p' | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -z "$PLUGIN_NAME_DISPLAY" ]; then
    PLUGIN_NAME_DISPLAY=$(basename "$PWD")
fi

print_header()  { echo "\${CYAN}\${BOLD}========================================\${RESET}"; echo "\${CYAN}\${BOLD}$1\${RESET}"; echo "\${CYAN}\${BOLD}========================================\${RESET}"; }
print_info()    { echo "\${GREEN}\${BOLD}[INFO]\${RESET} $1"; }
print_warning() { echo "\${YELLOW}\${BOLD}[WARN]\${RESET} $1"; }
print_error()   { echo "\${RED}\${BOLD}[ERROR]\${RESET} $1"; }
print_success() { echo "\${GREEN}\${BOLD}[SUCCESS]\${RESET} $1"; }
print_building(){ echo "\${MAGENTA}\${BOLD}[BUILD]\${RESET} Building for \${CYAN}$1\${RESET} (\${YELLOW}$2\${RESET})"; }

command_exists()  { command -v "$1" >/dev/null 2>&1; }
toolchain_exists(){ command_exists "$1-gcc" && command_exists "$1-g++"; }

normalize_arch() {
    case "$1" in
        x86_64|x64|amd64)              echo "x86_64"    ;;
        x86_32|x86|i686|i386|ia32)    echo "x86_32"    ;;
        arm64|aarch64)                 echo "arm64"     ;;
        arm32|armhf|armv7|armv7l)     echo "arm32"     ;;
        mips32|mips)                   echo "mips32"    ;;
        mips32el|mipsel)               echo "mips32el"  ;;
        mips64)                        echo "mips64"    ;;
        mips64el)                      echo "mips64el"  ;;
        powerpc32|ppc|ppc32)           echo "powerpc32" ;;
        powerpc64|ppc64)               echo "powerpc64" ;;
        riscv64)                       echo "riscv64"   ;;
        s390x)                         echo "s390x"     ;;
        sparc64)                       echo "sparc64"   ;;
        *)                             echo "$1"        ;;
    esac
}
FILTER_ARCHS=""
arch_matches() {
    [ -z "$FILTER_ARCHS" ] && return 0
    for _fa in $FILTER_ARCHS; do [ "$_fa" = "$1" ] && return 0; done
    return 1
}
toolchain_to_arch() {
    case "$1" in
        arm-linux-gnueabihf)         echo "arm32"     ;;
        aarch64-linux-gnu)           echo "arm64"     ;;
        i686-linux-gnu)              echo "x86_32"    ;;
        x86_64-linux-gnu)            echo "x86_64"    ;;
        mips-linux-gnu)              echo "mips32"    ;;
        mipsel-linux-gnu)            echo "mips32el"  ;;
        mips64-linux-gnuabi64)       echo "mips64"    ;;
        mips64el-linux-gnuabi64)     echo "mips64el"  ;;
        powerpc-linux-gnu)           echo "powerpc32" ;;
        powerpc64-linux-gnu)         echo "powerpc64" ;;
        riscv64-linux-gnu)           echo "riscv64"   ;;
        s390x-linux-gnu)             echo "s390x"     ;;
        sparc64-linux-gnu)           echo "sparc64"   ;;
        *)                           echo "$1"        ;;
    esac
}

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

build_linux_x86_32_multilib() {
    print_building "x86_32" "native gcc/clang -m32"
    if make clear TARGET=release ARCH=x86_32; then
        if make TARGET=release ARCH=x86_32 -j\$(nproc 2>/dev/null || echo 4); then
            print_success "Built x86_32 via native -m32 multilib"; return 0
        else
            print_error "Failed x86_32 multilib build (install gcc-multilib/libc6-dev-i386 or equivalent)"; return 1
        fi
    else
        print_error "Failed to clear for x86_32 multilib build"; return 1
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
    print_header "Building \${PLUGIN_NAME_DISPLAY} for Linux (13 architectures)"
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

    local native_arch
    native_arch=\$(normalize_arch "$HOST_ARCH")
    if arch_matches "$native_arch"; then
        total_count=\$((total_count + 1))
        if build_native "native ($HOST_ARCH)"; then
            success_count=\$((success_count + 1))
        else
            fail_count=\$((fail_count + 1))
        fi
        echo ""
    else
        print_info "Skipping native ($HOST_ARCH) — not in arch filter"
        echo ""
    fi

    for toolchain in $LINUX_TOOLCHAINS; do
        if [ "$toolchain" = "$host_toolchain" ]; then
            print_info "Skipping $toolchain (already built natively)"
            continue
        fi
        local tc_arch
        tc_arch=\$(toolchain_to_arch "$toolchain")
        if ! arch_matches "$tc_arch"; then
            print_info "Skipping $toolchain ($tc_arch) — not in arch filter"
            echo ""
            continue
        fi
        total_count=\$((total_count + 1))
        if [ "$tc_arch" = "x86_32" ]; then
            if build_linux_x86_32_multilib; then
                success_count=\$((success_count + 1))
            else
                if toolchain_exists "$toolchain"; then
                    print_warning "native -m32 build failed, trying i686 toolchain fallback"
                    if build_for_toolchain "$toolchain" "$toolchain"; then
                        success_count=\$((success_count + 1))
                    else
                        fail_count=\$((fail_count + 1))
                    fi
                else
                    print_warning "native -m32 build failed and $toolchain is unavailable"
                    fail_count=\$((fail_count + 1))
                fi
            fi
            echo ""
            continue
        fi

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
    echo "\${GREEN}Successful: \${BOLD}\${success_count}\${RESET}  \${RED}Failed: \${BOLD}\${fail_count}\${RESET}  \${CYAN}Total: \${BOLD}\${total_count}\${RESET}"
    if [ \$success_count -gt 0 ]; then
        print_info "Output: ./build/plugins/"
        ls -lh build/plugins/ 2>/dev/null | grep '\\.so$' || true
    fi
}

build_macos() {
    local success_count=0 fail_count=0
    print_header "Building \${PLUGIN_NAME_DISPLAY} for macOS (arm64 + x86_64)"
    echo ""

    command_exists clang++ || { print_error "clang++ not found"; return 1; }
    local ncpu=\$(sysctl -n hw.ncpu 2>/dev/null || echo 4)

    for arch in arm64 x86_64; do
        if ! arch_matches "$arch"; then
            print_info "Skipping $arch — not in arch filter"
            echo ""
            continue
        fi
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
    echo "\${GREEN}Successful: \${BOLD}\${success_count}\${RESET}  \${RED}Failed: \${BOLD}\${fail_count}\${RESET}"
    if [ \$success_count -gt 0 ]; then
        print_info "Output: ./build/plugins/"
        ls -lh build/plugins/ 2>/dev/null | grep '\\.dylib$' || true
    fi
}

build_windows() {
    local success_count=0 fail_count=0
    print_header "Building \${PLUGIN_NAME_DISPLAY} for Windows (x86_64 + x86_32 + arm64)"
    echo ""

    local vswhere="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    [ -f "$vswhere" ] || vswhere="/c/Program Files/Microsoft Visual Studio/Installer/vswhere.exe"

    local vs_path=""
    [ -f "$vswhere" ] && vs_path=\$("$vswhere" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>/dev/null | head -1)
    [ -z "$vs_path" ] && vs_path="/c/Program Files/Microsoft Visual Studio/2022/Community"
    [ -d "$vs_path" ] || { print_error "Visual Studio 2022 not found"; return 1; }

    local vcvars_path="$vs_path/VC/Auxiliary/Build"
    [ -d "$vcvars_path" ] || { print_error "vcvars path not found: $vcvars_path"; return 1; }

    for arch_spec in "x86_64:vcvars64.bat" "x86_32:vcvars32.bat" "arm64:vcvarsamd64_arm64.bat"; do
        IFS=':' read -r make_arch vcvars <<< "$arch_spec"
        if ! arch_matches "$make_arch"; then
            print_info "Skipping $make_arch — not in arch filter"
            echo ""
            continue
        fi
        print_building "$make_arch" "$vcvars"
        local vcvars_win=\$(cygpath -w "$vcvars_path/$vcvars" 2>/dev/null || echo "$vcvars_path\\\\$vcvars")
        rm -rf src/.build
        local temp_bat=\$(mktemp --suffix=.bat)
        cat > "$temp_bat" <<BATEOF
@echo off
call "$vcvars_win" >nul 2>&1
if errorlevel 1 exit /b 1
make ARCH=$make_arch TARGET=release -j4
BATEOF
        if cmd //c "\$(cygpath -w "$temp_bat" 2>/dev/null || echo "$temp_bat")" 2>&1; then
            print_success "Built $make_arch"
            success_count=\$((success_count + 1))
        else
            print_error "Failed $make_arch"
            fail_count=\$((fail_count + 1))
        fi
        rm -f "$temp_bat"
        echo ""
    done

    print_header "Build Summary"
    echo "\${GREEN}Successful: \${BOLD}\${success_count}\${RESET}  \${RED}Failed: \${BOLD}\${fail_count}\${RESET}"
    if [ \$success_count -gt 0 ]; then
        print_info "Output: ./build/plugins/"
        ls -lh build/plugins/ 2>/dev/null | grep '\\.dll$' || true
    fi
    if [ \$fail_count -gt 0 ]; then
        print_warning "ARM64 failures may need: MSVC v143 ARM64 build tools (via VS Installer)"
    fi
}

main() {
    while [ $# -gt 0 ]; do
        case $1 in
            --arch|-a)
                if [ -z "\${2:-}" ] || [ "\${2#-}" != "$2" ]; then
                    print_error "--arch requires an architecture name"; exit 1
                fi
                _fa=\$(normalize_arch "$2")
                FILTER_ARCHS="\${FILTER_ARCHS:+$FILTER_ARCHS }$_fa"
                shift 2 ;;
            --help|-h)
                echo "Usage: $0 [--arch <arch>]..."
                echo "Builds the \${PLUGIN_NAME_DISPLAY} plugin for all architectures on the current OS."
                echo "  --arch <arch>  Only build for the specified architecture (repeatable)"
                echo "  Linux:   all supported .so targets; x86_32 uses native -m32 by default, then i686 toolchain as fallback"
                echo "  macOS:   arm64 + x86_64 .dylib files + universal binary"
                echo "  Windows: x86_64 + x86_32 + arm64 .dll files (requires VS 2022)"
                exit 0 ;;
            *) print_error "Unknown option: $1"; exit 1 ;;
        esac
    done

    detect_os
    print_header "\${PLUGIN_NAME_DISPLAY} Plugin — Multi-Architecture Build"
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
// ─── build_for_release.sh ─────────────────────────────────────────────────────────────────────

/**
 * Generate `build_for_release.sh` content.
 * Cleans ./release/, runs build_all_archs.sh, then moves build/plugins/*
 * to ./release/.
 * @returns {string}
 */
function makePluginBuildForRelease() {
    return `#!/usr/bin/env bash
# build_for_release.sh — collect all plugin binaries into ./release/
#
# Usage: ./build_for_release.sh [--arch <arch>] ...
#
# 1. Removes and recreates ./release/
# 2. Runs ./build_all_archs.sh (builds build/plugins/ for all platforms)
# 3. Moves every file from build/plugins/ into ./release/

set -e

RESET=$(printf '\\033[0m')
RED=$(printf '\\033[31m')
GREEN=$(printf '\\033[32m')
YELLOW=$(printf '\\033[33m')
CYAN=$(printf '\\033[36m')
BOLD=$(printf '\\033[1m')

normalize_arch() {
    case "$1" in
        x86_64|x64|amd64)              echo "x86_64"    ;;
        x86_32|x86|i686|i386|ia32)     echo "x86_32"    ;;
        arm64|aarch64)                  echo "arm64"     ;;
        arm32|armhf|armv7|armv7l)       echo "arm32"     ;;
        mips32|mips)                    echo "mips32"    ;;
        mips32el|mipsel)                echo "mips32el"  ;;
        mips64)                         echo "mips64"    ;;
        mips64el)                       echo "mips64el"  ;;
        powerpc32|ppc|ppc32)            echo "powerpc32" ;;
        powerpc64|ppc64)                echo "powerpc64" ;;
        riscv64)                        echo "riscv64"   ;;
        s390x)                          echo "s390x"     ;;
        sparc64)                        echo "sparc64"   ;;
        *)                              echo "$1"        ;;
    esac
}

RELEASE_DIR="./release"
PLUGINS_DIR="./build/plugins"
PLUGIN_NAME_DISPLAY=$(grep -hE -A5 ': (RenWeb::)?Plugin\\b' src/*.cpp 2>/dev/null | grep -o '"[^"]*"' | sed -n '2p' | tr -d '"' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
if [ -z "$PLUGIN_NAME_DISPLAY" ]; then
    PLUGIN_NAME_DISPLAY=$(basename "$PWD")
fi

print_header()  { echo "\${CYAN}\${BOLD}========================================\${RESET}"; echo "\${CYAN}\${BOLD}$1\${RESET}"; echo "\${CYAN}\${BOLD}========================================\${RESET}"; }
print_info()    { echo "\${GREEN}\${BOLD}[INFO]\${RESET} $1"; }
print_warning() { echo "\${YELLOW}\${BOLD}[WARN]\${RESET} $1"; }
print_error()   { echo "\${RED}\${BOLD}[ERROR]\${RESET} $1" >&2; }
print_success() { echo "\${GREEN}\${BOLD}[SUCCESS]\${RESET} $1"; }

ARCH_FLAGS=""
while [ $# -gt 0 ]; do
    case $1 in
        --arch|-a)
            if [ -z "$2" ] || [ "\${2#-}" != "$2" ]; then
                print_error "--arch requires an architecture name"
                exit 1
            fi
            _fa=$(normalize_arch "$2")
            ARCH_FLAGS="\${ARCH_FLAGS:+$ARCH_FLAGS }--arch $_fa"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--arch <arch>] ..."
            echo ""
            echo "  --arch <arch>, -a    Build only the specified architecture (repeatable)."
            echo "                       Accepts canonical names or common aliases."
            echo "                       Default: all architectures."
            exit 0 ;;
        *)
            print_error "Unknown option: $1"
            exit 1 ;;
    esac
done

print_header "\${PLUGIN_NAME_DISPLAY} — Cleaning release directory"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
print_info "Ready: $RELEASE_DIR/"

print_header "\${PLUGIN_NAME_DISPLAY} — Building all architectures"
# shellcheck disable=SC2086
bash ./build_all_archs.sh $ARCH_FLAGS

print_header "\${PLUGIN_NAME_DISPLAY} — Collecting plugins"
plugin_count=0
if [ -d "$PLUGINS_DIR" ]; then
    for f in "$PLUGINS_DIR"/*; do
        [ -f "$f" ] || continue
        mv "$f" "$RELEASE_DIR/"
        print_info "$(basename "$f")"
        plugin_count=$((plugin_count + 1))
    done
else
    print_warning "build/plugins/ not found — build_all_archs.sh may have failed"
fi

echo ""
if [ $plugin_count -gt 0 ]; then
    print_success "$plugin_count plugin(s) ready in $RELEASE_DIR/"
    ls -lh "$RELEASE_DIR/"
else
    print_error "No plugins collected — check build_all_archs.sh output above"
    exit 1
fi
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
│   └── plugins/                      # compiled plugin output (per arch)
├── release/                          # output from build_for_release.sh
├── external/
│   └── boost/                        # pinned Boost submodule (boost-1.90.0)
├── include/
│   ├── plugin.hpp          # RenWeb Plugin base class (fetched from engine)
│   └── ${pluginName}.hpp   # Plugin class declaration
├── src/
│   └── ${pluginName}.cpp   # Plugin implementation (defines name + version)
├── build_all_archs.sh      # Build for all OS/arch targets
├── build_for_release.sh    # Build all arches, collect binaries into release/
└── makefile
\`\`\`

## Dependencies

Requires a C++20-capable compiler. This template vendors required Boost headers
as pinned git submodules under \`external/\`.

Boost.JSON is compiled into the plugin via \`BOOST_JSON_SOURCE\`, so no prebuilt
Boost libraries are required for plugin builds.

This template pins the expected Boost ABI to **Boost 1.90.0**
(\`BOOST_VERSION=109000\`) to avoid runtime crashes from mismatched C++ ABI.
If you intentionally need another Boost version, override
\`REQUIRED_BOOST_VERSION\` in the make invocation and ensure the RenWeb engine
was compiled against the same version.

| Platform | Command |
|----------|---------|
| **All platforms** | \`git -C external/boost submodule update --init --depth 1 libs/json libs/assert libs/config libs/container libs/container_hash libs/core libs/describe libs/endian libs/mp11 libs/predef libs/preprocessor libs/static_assert libs/system libs/throw_exception libs/type_traits libs/variant2 libs/winapi libs/move libs/intrusive libs/compat\` |

## Building

\`\`\`sh
# Linux / macOS — release
make

# Linux / macOS — debug
make TARGET=debug

# Cross-compile for ARM64 on Linux
make TOOLCHAIN=aarch64-linux-gnu

# Linux x86_32 via native multilib (-m32)
make ARCH=x86_32

# Windows (MinGW or MSVC Developer Prompt)
make

# Intentional override (only if engine uses the same Boost version)
make REQUIRED_BOOST_VERSION=109000
\`\`\`

Output: \`<internal_name>-<version>-<os>-<arch>.so\` (or \`.dll\` / \`.dylib\`)

Run \`make info\` to see the resolved build configuration.

### Multi-architecture builds

\`\`\`sh
./build_all_archs.sh         # build all supported OS/arch targets
./build_for_release.sh       # build all arches and collect output into ./release/
\`\`\`

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

# Release output
release/

# Test environment (fetched at project creation time)
build/content/
build/plugins/
build/renweb-*
build/*.exe
build/log*.txt
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
                with:
                    submodules: true

            - name: Initialize required Boost modules
                shell: bash
                run: |
                    git -C external/boost submodule update --init --depth 1 \\
                        libs/json libs/assert libs/config libs/container libs/container_hash \\
                        libs/core libs/describe libs/endian libs/mp11 libs/predef \\
                        libs/preprocessor libs/static_assert libs/system \\
                        libs/throw_exception libs/type_traits libs/variant2 libs/winapi \\
                        libs/move libs/intrusive libs/compat

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


module.exports = {
    makePluginHpp,
    makePluginCpp,
    makePluginMakefile,
    makePluginBuildAllArchs,
    makePluginBuildForRelease,
    makePluginReadme,
    makePluginGitignore,
    makePluginWorkflow,
    makePluginTestInfoJson,
    makePluginTestConfigJson,
    makePluginTestHarnessHtml,
};
