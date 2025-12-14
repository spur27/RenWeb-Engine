# -----------------------------------------------------------------------------
# Toolchain prefix - Supported Linux cross-compilers
# -		ARM 32-bit (Linux):          TOOLCHAIN := arm-linux-gnueabihf
# -		ARM 64-bit (Linux):          TOOLCHAIN := aarch64-linux-gnu
# -		MIPS 32-bit BE (Linux):      TOOLCHAIN := mips-linux-gnu
# -		MIPS 32-bit LE (Linux):      TOOLCHAIN := mipsel-linux-gnu
# -		MIPS 64-bit BE (Linux):      TOOLCHAIN := mips64-linux-gnuabi64
# -		MIPS 64-bit LE (Linux):      TOOLCHAIN := mips64el-linux-gnuabi64
# -		PowerPC 32-bit (Linux):      TOOLCHAIN := powerpc-linux-gnu
# -		PowerPC 64-bit (Linux):      TOOLCHAIN := powerpc64-linux-gnu
# -		RISC-V 64-bit (Linux):       TOOLCHAIN := riscv64-linux-gnu
# -		S390x (Linux):               TOOLCHAIN := s390x-linux-gnu
# -		SPARC 64-bit (Linux):        TOOLCHAIN := sparc64-linux-gnu
# -		x86_64 (Linux):              TOOLCHAIN := x86_64-linux-gnu (or native)
# -		x86 32-bit (Linux):          TOOLCHAIN := i686-linux-gnu
# -		x86 32-bit (macOS):          Use clang with -m32 flag (no TOOLCHAIN)
# -		Windows (cl.exe):            No TOOLCHAIN - use native cl.exe compiler
# -		macOS (clang):               No TOOLCHAIN - use native clang compiler
# -----------------------------------------------------------------------------
TOOLCHAIN :=
ifdef TOOLCHAIN
	CROSS_COMPILE := $(TOOLCHAIN)-
	SYSROOT := --sysroot=/usr/$(TOOLCHAIN)
	# Set ARCH based on TOOLCHAIN
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
	else
		ARCH := unknown
	endif
else
	CROSS_COMPILE :=
	SYSROOT :=
	ARCH := x86_64
endif
# --sysroot=/usr/$(TOOLCHAIN)
# -----------------------------------------------------------------------------
# Target type
# -----------------------------------------------------------------------------
ifndef TARGET
	TARGET := debug
endif
# -----------------------------------------------------------------------------
# OS info
# -----------------------------------------------------------------------------
ifeq ($(OS),Windows_NT)
	SHELL := C:\Program Files\Git\bin\bash.exe
    OS_NAME := windows
	EXE_EXT := .exe
	OBJ_EXT := .obj
	CXX := cl
	CXXFLAGS := /std:c++17 /utf-8 /bigobj
ifneq ($(LINKTYPE),shared)
	CXXFLAGS += /MT 
endif
ifeq ($(TARGET),debug)
	CXXFLAGS += /EHsc /Zi /Od /W3
else
	CXXFLAGS += /EHsc /O2
endif
	# Detect architecture from cl.exe environment
	# Use VSCMD_ARG_TGT_ARCH if set, otherwise check PROCESSOR_ARCHITECTURE
	ifdef VSCMD_ARG_TGT_ARCH
		ifeq ($(VSCMD_ARG_TGT_ARCH),x86)
			ARCH := x86_32
		else ifeq ($(VSCMD_ARG_TGT_ARCH),x64)
			ARCH := x86_64
		else ifeq ($(VSCMD_ARG_TGT_ARCH),arm)
			ARCH := arm32
		else ifeq ($(VSCMD_ARG_TGT_ARCH),arm64)
			ARCH := arm64
		endif
	else ifdef PROCESSOR_ARCHITECTURE
		ifeq ($(PROCESSOR_ARCHITECTURE),AMD64)
			ARCH := x86_64
		else ifeq ($(PROCESSOR_ARCHITECTURE),x86)
			ARCH := x86_32
		else ifeq ($(PROCESSOR_ARCHITECTURE),ARM64)
			ARCH := arm64
		endif
	endif
else
	SHELL := /bin/bash
    UNAME_S := $(shell uname -s)
	EXE_EXT :=
	OBJ_EXT := .o
    ifeq ($(UNAME_S),Linux)
        OS_NAME := linux
		CXX := $(CROSS_COMPILE)g++
		CXXFLAGS := -MMD -MP -D_GNU_SOURCE
		ifeq ($(TARGET), debug)
			CXXFLAGS += $(SYSROOT) -g -O0 -Wall -Wextra -Wno-missing-braces -Wcast-qual -Wpointer-arith -Wunused 
		else
			CXXFLAGS += $(SYSROOT) -O3 -flto -s
		endif
		# For cross-compilation, add Boost 1.82 include path
		ifdef TOOLCHAIN
			CXXFLAGS += -isystem /usr/$(TOOLCHAIN)/usr/local/include
		else
			# For native builds, also use Boost 1.82 from /usr/local
			CXXFLAGS += -isystem /usr/local/include
		endif
		# For x86_32 builds on Linux, use -m32 flag if TOOLCHAIN not set
		ifeq ($(ARCH),x86_32)
			ifndef TOOLCHAIN
				CXXFLAGS += -m32
			endif
		endif
    else ifeq ($(UNAME_S),Darwin)
        OS_NAME := apple
		CXX := clang++
		CXXFLAGS := -MMD -MP
		ifeq ($(TARGET), debug)
			CXXFLAGS += -g -O0 -Wall -Wextra -Wno-missing-braces -Wcast-qual -Wpointer-arith -Wunused 
		else
			CXXFLAGS += -O3 -flto -s
		endif
		# For x86_32 builds on macOS, use -m32 flag
		ifeq ($(ARCH),x86_32)
			CXXFLAGS += -m32
		endif
    else
        $(error Unknown operating system detected. Don't know how to proceed :/)
    endif
endif
LINKTYPE := static
# -----------------------------------------------------------------------------
# Utility stuff for the makefile
# -----------------------------------------------------------------------------
# ifeq ($(OS_NAME),Windows)
# define describe
# 	@printf "%s %s\n" "$(1)" "$(2)"
# endef
# define step
# 	@printf "%s %s\n" "$(1)" "$(2)"
# endef
# else
RESET   := \033[0m
RED     := \033[31m
GREEN   := \033[32m
YELLOW  := \033[33m
BLUE    := \033[34m
MAGENTA := \033[35m
CYAN    := \033[36m
BOLD    := \033[1m
define describe
	@printf "$(GREEN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET) $(GREEN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET)\n" "$(1)" "$(2)" "$(3)" "$(4)"
endef
define warn
	@printf "$(YELLOW)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET) $(YELLOW)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET)\n" "$(1)" "$(2)" "$(3)" "$(4)"
endef
define step
	@printf "$(CYAN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET) $(CYAN)$(BOLD)%s$(RESET) $(MAGENTA)%s$(RESET)\n" "$(1)" "$(2)" "$(3)" "$(4)"
endef
# endif
# -----------------------------------------------------------------------------
# Paths 
# -----------------------------------------------------------------------------
BUILD_PATH :=  ./programs
COPY_PATH := ./build
LIC_PATH :=    ./licenses
CONF_PATH :=   ./config.json
INFO_PATH :=   ./info.json
SRC_PATH :=    ./src
OBJ_PATH :=    $(SRC_PATH)/.build
INC_PATH :=    ./include
EXE_NAME := $(shell sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' ./info.json | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]/-/g' | xargs)
EXE_VERSION := $(shell sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' ./info.json | xargs)
EXE := $(EXE_NAME)-$(EXE_VERSION)-$(OS_NAME)-$(ARCH)$(EXE_EXT)
ifeq ($(OS_NAME), windows)
EXTERN_INC_PATHS := \
	$(addprefix /I, $(wildcard external/*/)) \
	$(addprefix /I, $(wildcard external/*/include)) \
	$(addprefix /I, $(wildcard external/boost/libs/*/include)) \
	$(addprefix /I, $(wildcard external/boost/libs/*/*/include)) \
	$(addprefix /I, $(wildcard external/boost/libs/*/*/*/include)) \
	$(addprefix /I, external/webview/core/include) 
else 
EXTERN_INC_PATHS := \
	$(addprefix -I, $(wildcard external/*/)) \
	$(addprefix -I, $(wildcard external/*/include)) \
	$(addprefix -I, $(wildcard external/boost/libs/*/include)) \
	$(addprefix -I, $(wildcard external/boost/libs/*/*/include)) \
	$(addprefix -I, $(wildcard external/boost/libs/*/*/*/include)) \
	$(addprefix -I, external/webview/core/include) 
endif
RC_PATH :=    ./src/.build/app.res
# -----------------------------------------------------------------------------
# Static Linked Libraries
# -----------------------------------------------------------------------------
ifeq ($(OS_NAME), windows)
	LIBS := comdlg32.lib
endif
ifeq ($(OS_NAME), apple)
	LIBS := -ldl 
endif
ifeq ($(OS_NAME), linux)
	ifdef TOOLCHAIN
		# For all cross-compilation targets, use explicit sysroot path and link boost statically
		LIBS := -L/usr/$(TOOLCHAIN)/usr/local/lib -Wl,-Bstatic -lboost_program_options -lboost_json -Wl,-Bdynamic -ldl
		LDFLAGS := --sysroot=/usr/$(TOOLCHAIN) -L/lib -L/lib64 -L/usr/lib -L/usr/lib64
	else
		# Native build: use Boost 1.82 from /usr/local/lib
		LIBS := -L/usr/local/lib -Wl,-Bstatic -lboost_program_options -lboost_json -Wl,-Bdynamic -ldl
		LDFLAGS :=
	endif
endif
# -----------------------------------------------------------------------------
# Dynamic Linked Libraries
# -----------------------------------------------------------------------------
ifeq ($(OS_NAME),linux)
    ifdef TOOLCHAIN
        PKG_CONFIG := pkg-config
        # For all cross-compilers, use sysroot-aware pkg-config
        # Include both standard and multiarch paths (i386-linux-gnu for i686, lib for others)
        PKG_CONFIG_PATH := /usr/$(TOOLCHAIN)/usr/local/lib/pkgconfig:/usr/$(TOOLCHAIN)/usr/lib/pkgconfig:/usr/$(TOOLCHAIN)/usr/lib/i386-linux-gnu/pkgconfig:/usr/$(TOOLCHAIN)/usr/share/pkgconfig:/usr/$(TOOLCHAIN)/lib/pkgconfig
        PKG_CONFIG_LIBDIR := /usr/$(TOOLCHAIN)/usr/local/lib/pkgconfig
        PKG_CONFIG_SYSROOT_DIR := /usr/$(TOOLCHAIN)
        PKG_CFLAGS := $(shell PKG_CONFIG_PATH=$(PKG_CONFIG_PATH) PKG_CONFIG_LIBDIR=$(PKG_CONFIG_LIBDIR) PKG_CONFIG_SYSROOT_DIR=$(PKG_CONFIG_SYSROOT_DIR) $(PKG_CONFIG) --cflags gtk+-3.0 webkit2gtk-4.1)
        PKG_LIBS   := $(shell PKG_CONFIG_PATH=$(PKG_CONFIG_PATH) PKG_CONFIG_LIBDIR=$(PKG_CONFIG_LIBDIR) PKG_CONFIG_SYSROOT_DIR=$(PKG_CONFIG_SYSROOT_DIR) $(PKG_CONFIG) --libs gtk+-3.0 webkit2gtk-4.1)
    else
        PKG_CONFIG := pkg-config
        PKG_CFLAGS := $(shell $(PKG_CONFIG) --cflags gtk+-3.0 webkit2gtk-4.1)
        PKG_LIBS   := $(shell $(PKG_CONFIG) --libs gtk+-3.0 webkit2gtk-4.1)
    endif
endif
# -----------------------------------------------------------------------------
# Source and Object files
# -----------------------------------------------------------------------------
SRCS := $(wildcard $(SRC_PATH)/*.cpp)
OBJS := $(patsubst $(SRC_PATH)/%.cpp, $(OBJ_PATH)/%$(OBJ_EXT), $(SRCS))
# -----------------------------------------------------------------------------
# Build target
# -----------------------------------------------------------------------------
all: $(BUILD_PATH)/$(EXE)
# -----------------------------------------------------------------------------
# RULE: Link all object files into executable
# -----------------------------------------------------------------------------
$(BUILD_PATH)/$(EXE): $(OBJS) | $(BUILD_PATH)
	$(call step,Linking Executable,$@,of link type,$(LINKTYPE))
ifeq ($(OS_NAME), windows)
	npm run script:gen_resource
	$(CXX) $(OBJS) ./src/.build/app.res $(CXXFLAGS) /link $(LIBS) /SUBSYSTEM:WINDOWS /OUT:$@
else 
ifeq ($(LINKTYPE),shared)
	$(call warn,Shared for unix isn't implemented yet! Using static)
	$(CXX) $(CXXFLAGS) $(PKG_CFLAGS) -I$(INC_PATH) $(EXTERN_INC_PATHS) $^ $(LDFLAGS) $(LIBS) $(PKG_LIBS) -o $@
else
	$(CXX) $(CXXFLAGS) $(PKG_CFLAGS) -I$(INC_PATH) $(EXTERN_INC_PATHS) $^ $(LDFLAGS) $(LIBS) $(PKG_LIBS) -o $@
endif
endif
	$(call step,Linking Executable [DONE],$@)
# -----------------------------------------------------------------------------
# RULE: Compile source files to object files
# -----------------------------------------------------------------------------
$(OBJ_PATH)/%$(OBJ_EXT): $(SRC_PATH)/%.cpp | $(OBJ_PATH)
	$(call step,Compiling,$<)
ifeq ($(OS_NAME),windows)
ifeq ($(LINKTYPE),shared)
	$(CXX) $(CXXFLAGS) /I$(INC_PATH) /MD /DBOOST_ALL_DYN_LINK $(EXTERN_INC_PATHS) /c $< /Fo$@
else
	$(CXX) $(CXXFLAGS) /I$(INC_PATH) $(EXTERN_INC_PATHS) /c $< /Fo$@
endif
else 
ifeq ($(LINKTYPE),shared)
	$(call warn,Shared for unix isn't implemented yet! Using static)
	$(CXX) $(CXXFLAGS) $(PKG_CFLAGS) -I$(INC_PATH) $(EXTERN_INC_PATHS) -c $< -o $@
else
	$(CXX) $(CXXFLAGS) $(PKG_CFLAGS) -I$(INC_PATH) $(EXTERN_INC_PATHS) -c $< -o $@
endif
endif
	$(call step,Compiling [DONE],$<)
# -----------------------------------------------------------------------------
# RULE: Make sure build directory exists
# -----------------------------------------------------------------------------
$(BUILD_PATH):
	$(call step,Build Path,Making path at $@)
	mkdir -p $@
	$(call step,Build Path [DONE],Making path at $@)
# -----------------------------------------------------------------------------
# RULE: Make sure object directory exists
# -----------------------------------------------------------------------------
$(OBJ_PATH):
	$(call step,Object Path,Making path at $@)
	mkdir -p $@
	$(call step,Object Path [DONE],Making path at $@)

# -----------------------------------------------------------------------------
# COMMAND: Remove build files
# -----------------------------------------------------------------------------
clean:
	$(call step,Cleaning)
	rm -rf $(wildcard $(BUILD_PATH)/$(EXE_NAME)-*)
	rm -rf $(OBJ_PATH)/*
	$(call step,Cleaning [DONE])
# -----------------------------------------------------------------------------
# COMMAND: Remove build files and exe
# -----------------------------------------------------------------------------
clear:
	$(call step,Clearing)
	rm -rf $(OBJ_PATH)/*
	$(call step,Clearing [DONE])
# -----------------------------------------------------------------------------
# COMMAND: Run the program
# -----------------------------------------------------------------------------
run: $(BUILD_PATH)/$(EXE)
	$(call step,Running)
	./$(BUILD_PATH)/$(EXE) $(ARGS)
	$(call step,Running [DONE])
# -----------------------------------------------------------------------------
# COMMAND: Test the program
# additional settings: --leak-check=full --show-leak-kinds=all
# -----------------------------------------------------------------------------
test: $(BUILD_PATH)/$(EXE)
	$(call step,Testing)
	ulimit -n 20000 && valgrind  ./$(BUILD_PATH)/$(EXE) -l0
	$(call step,Testing [DONE])
# -----------------------------------------------------------------------------
# COMMAND: Info about the makefile
# -----------------------------------------------------------------------------
info:
	$(call step,Displaying info)
	$(call describe,OS,$(OS_NAME))
	$(call describe,App Name,$(EXE))
	$(call describe,Compiler,$(CXX))
	$(call describe,Target,$(TARGET))
	$(call describe,Build Path,$(BUILD_PATH))
	$(call describe,Source Path,$(SRC_PATH))
	$(call describe,Object Path,$(OBJ_PATH))
	$(call describe,Include Path,$(INC_PATH))
	$(call step,Displaying info [DONE])

# -----------------------------------------------------------------------------
# COMMAND: Display help info
# -----------------------------------------------------------------------------
help:
	@echo "Usage:"
	@echo "  make TARGET=debug      Build the application in debug mode"
	@echo "  make TARGET=release    Build the application in release mode"
	@echo "  make sub_modules       Builds the submodules"
	@echo "  make clean             Clean up the build directory"
	@echo "  make run               Build and run the application"
	@echo "  make test              Build and test the application"
	@echo "  make info              Displays info set in the makefile"
	@echo "  make help              Display this help message"
# -----------------------------------------------------------------------------
# Phony targets
# -----------------------------------------------------------------------------
# .PHONY: all clean run help copy-license copy-info
# -----------------------------------------------------------------------------
# PHONY TARGET: Copy license
# -----------------------------------------------------------------------------
# copy-license:
# 	$(call step,Copy License(s), Copying License at $@)
# 	mkdir -p $(COPY_PATH)
# 	cp -R $(LIC_PATH) $(COPY_PATH)/licenses
# 	$(call step,Copy License(s) [DONE] Copying License at $@)
# -----------------------------------------------------------------------------
# PHONY TARGET: Copy info
# -----------------------------------------------------------------------------
# copy-info:
# 	$(call step,Copy Info(s), Copying Info at $@)
# 	mkdir -p $(COPY_PATH)
# 	cp $(INFO_PATH) $(COPY_PATH)/info.json
# 	$(call step,Copy Info(s) [DONE] Copying Info at $@)
# -----------------------------------------------------------------------------
# Includes
# -----------------------------------------------------------------------------
ifeq ($(OS_NAME),windows)
-include
else
-include $(OBJS:.o=.d)
endif
