# -----------------------------------------------------------------------------
# Toolchain prefix
# -		ARM 32-bit (Linux): 		   CROSS_COMPILE := arm-linux-gnueabihf-
# -		ARM 64-bit (Linux): 		   CROSS_COMPILE := aarch64-linux-gnu-
# -		x86_64 (Linux, native 64-bit): CROSS_COMPILE := x86_64-linux-gnu-
# -		x86 32-bit (Linux): 		   CROSS_COMPILE := i386-linux-gnu-
# -		Windows 32-bit (MinGW): 	   CROSS_COMPILE := i686-ws64-mingw32-
# -		Windows 64-bit (MinGW):		   CROSS_COMPILE := x86_64-w64-mingw32-
# -		macOS (native, clang++): 	   CROSS_COMPILE := 
# -		MIPS 32-bit (Linux): 		   CROSS_COMPILE := mipsel-linux-gnu-
# -		MIPS 64-bit (Linux):		   CROSS_COMPILE := mips64el-linux-gnu-
# -		RISC-V 64-bit (Linux): 		   CROSS_COMPILE := riscv64-linux-gnu-
# -		PowerPC (Linux): 			   CROSS_COMPILE := powerpc-linux-gnu-
# -		ARM Android (32-bit): 		   CROSS_COMPILE := arm-linux-androideabi-
# -		Android x86 (32-bit): 		   CROSS_COMPILE := i686-linux-android-
# -		32-bit x86 macOS (if needed):  CROSS_COMPILE := i386-apple-darwin-
# -		64-bit x86 macOS (native): 	   CROSS_COMPILE := x86_64-apple-darwin-
# -----------------------------------------------------------------------------
CROSS_COMPILE :=
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
    OS_NAME := Windows
	EXE_EXT := .exe
	OBJ_EXT := .obj
	CXX := $(CROSS_COMPILE)cl
	CXXFLAGS := /std:c++17 /utf-8 /bigobj
ifneq ($(LINKTYPE),shared)
	CXXFLAGS += /MT 
endif
ifeq ($(TARGET),debug)
	CXXFLAGS += /EHsc /Zi /Od /W3
else
	CXXFLAGS += /EHsc /O2
endif
else
	SHELL := /bin/bash
    UNAME_S := $(shell uname -s)
	EXE_EXT :=
	OBJ_EXT := .o
	CXX := $(CROSS_COMPILE)g++
	CXXFLAGS := -MMD -MP
	ifeq ($(TARGET), debug)
		CXXFLAGS += -g -O0 -Wall -Wextra -Wno-missing-braces -Wcast-qual -Wpointer-arith -Wunused 
	else
		CXXFLAGS += -O3 -flto -s
	endif
    ifeq ($(UNAME_S),Linux)
        OS_NAME := Linux
    else ifeq ($(UNAME_S),Darwin)
        OS_NAME := Apple
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
BUILD_PATH :=  ./build
COPY_PATH := ./build
LIC_PATH :=    ./licenses
CONF_PATH :=   ./config.json
INFO_PATH :=   ./info.json
SRC_PATH :=    ./src
OBJ_PATH :=    $(SRC_PATH)/.build
INC_PATH :=    ./include
EXE := $(shell sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' ./info.json | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]/-/g' | xargs)$(EXE_EXT)
ifeq ($(OS_NAME), Windows)
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
ifeq ($(OS_NAME), Windows)
	LIBS := comdlg32.lib
endif
ifeq ($(OS_NAME), Apple)
	LIBS := -ldl 
endif
ifeq ($(OS_NAME), Linux)
	LIBS := -Llib/boost/stage/lib -lboost_program_options -ldl
endif
# -----------------------------------------------------------------------------
# Dynamic Linked Libraries
# -----------------------------------------------------------------------------
ifeq ($(OS_NAME),Linux)
	PKG_CONFIG := pkg-config
	PKG_CFLAGS := $(shell $(PKG_CONFIG) --cflags gtk+-3.0 webkit2gtk-4.1)
	PKG_LIBS   := $(shell $(PKG_CONFIG) --libs gtk+-3.0   webkit2gtk-4.1)
endif
# -----------------------------------------------------------------------------
# Source and Object files
# -----------------------------------------------------------------------------
SRCS := $(wildcard $(SRC_PATH)/*.cpp)
OBJS := $(patsubst $(SRC_PATH)/%.cpp, $(OBJ_PATH)/%$(OBJ_EXT), $(SRCS))
# -----------------------------------------------------------------------------
# Build target
# -----------------------------------------------------------------------------
all: $(BUILD_PATH)/$(EXE) copy-license copy-config copy-info
# -----------------------------------------------------------------------------
# RULE: Link all object files into executable
# -----------------------------------------------------------------------------
$(BUILD_PATH)/$(EXE): $(OBJS) | $(BUILD_PATH)
	$(call step,Linking Executable,$@,of link type,$(LINKTYPE))
ifeq ($(OS_NAME),Windows)
	npm run script:gen_resource
	$(CXX) $(OBJS) ./src/.build/app.res $(CXXFLAGS) /link $(LIBS) /SUBSYSTEM:WINDOWS /OUT:$@
else 
ifeq ($(LINKTYPE),shared)
	$(call warn,Shared for unix isn't implemented yet! Using static)
	$(CXX) $(CXXFLAGS) $(PKG_CFLAGS) -I$(INC_PATH) $(EXTERN_INC_PATHS) $^ $(LIBS) $(PKG_LIBS) -o $@
else
	$(CXX) $(CXXFLAGS) $(PKG_CFLAGS) -I$(INC_PATH) $(EXTERN_INC_PATHS) $^ $(LIBS) $(PKG_LIBS) -o $@
endif
endif
	$(call step,Linking Executable [DONE],$@)
# -----------------------------------------------------------------------------
# RULE: Compile source files to object files
# -----------------------------------------------------------------------------
$(OBJ_PATH)/%$(OBJ_EXT): $(SRC_PATH)/%.cpp | $(OBJ_PATH)
	$(call step,Compiling,$<)
ifeq ($(OS_NAME),Windows)
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
# COMMAND: Remove build files and exe
# -----------------------------------------------------------------------------
clean:
	$(call step,Cleaning)
	find $(BUILD_PATH) -mindepth 1 \
	-not -path '$(BUILD_PATH)/assets/*' \
	-not -path '$(BUILD_PATH)/assets' \
	-not -path '$(BUILD_PATH)/content/*' \
	-not -path '$(BUILD_PATH)/content' \
	-not -path '$(BUILD_PATH)/resource/*' \
	-not -path '$(BUILD_PATH)/resource' \
	-exec rm -rf {} +
	rm -rf $(OBJ_PATH)/*
	$(call step,Cleaning [DONE])
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
.PHONY: all clean run help copy-license copy-config copy-info
# -----------------------------------------------------------------------------
# PHONY TARGET: Copy license
# -----------------------------------------------------------------------------
copy-license:
	$(call step,Copy License(s), Copying License at $@)
	mkdir -p $(COPY_PATH)
	cp -R $(LIC_PATH) $(COPY_PATH)/licenses
	$(call step,Copy License(s) [DONE] Copying License at $@)
# -----------------------------------------------------------------------------
# PHONY TARGET: Copy config
# -----------------------------------------------------------------------------
copy-config:
	$(call step,Copy Config(s), Copying Config at $@)
	mkdir -p $(COPY_PATH)
	cp $(CONF_PATH) $(COPY_PATH)/config.json
	$(call step,Copy Config(s) [DONE] Copying Config at $@)
# -----------------------------------------------------------------------------
# PHONY TARGET: Copy info
# -----------------------------------------------------------------------------
copy-info:
	$(call step,Copy Info(s), Copying Info at $@)
	mkdir -p $(COPY_PATH)
	cp $(INFO_PATH) $(COPY_PATH)/info.json
	$(call step,Copy Info(s) [DONE] Copying Info at $@)

# -----------------------------------------------------------------------------
# Includes
# -----------------------------------------------------------------------------
ifeq ($(OS_NAME),Windows)
-include
else
-include $(OBJS:.o=.d)
endif
