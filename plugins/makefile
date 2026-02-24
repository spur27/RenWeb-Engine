TARGET ?= debug
BUILD_DIR = ../build/plugins

ifeq ($(OS),Windows_NT)
	SHELL := C:\Program Files\Git\bin\bash.exe
    OS_NAME := windows
	EXT := .dll
	CXX := cl
	
	# Base flags for Windows
	CXXFLAGS := /std:c++20 /utf-8 /bigobj /DBOOST_ALL_NO_LIB /experimental:external /external:W0 /LD
	
	# Debug/Release flags
	ifeq ($(TARGET),debug)
		CXXFLAGS += /EHsc /Zi /Od /W3 /FS /MTd
		LDFLAGS := /DEBUG /DLL
	else
		CXXFLAGS += /EHsc /O2 /Ox /Oi /Ot /GL /GS- /Gy /W3 /FS /MT
		LDFLAGS := /LTCG /OPT:REF /OPT:ICF /DLL
	endif
	
	# Boost paths - prefer C:/local, fallback to external/boost
	ifneq ($(wildcard C:/local/boost_1_90_0/boost),)
		BOOST_ROOT := C:/local/boost_1_90_0
		BOOST_INCLUDE := /external:I$(BOOST_ROOT)
	else
		BOOST_ROOT := ../external/boost
		BOOST_INCLUDE := /external:I$(BOOST_ROOT)
	endif
	
	# Include paths
	INCLUDE_PATHS := /I../include $(BOOST_INCLUDE)
	
	# Detect architecture
	ifdef VSCMD_ARG_TGT_ARCH
		ifeq ($(VSCMD_ARG_TGT_ARCH),x86)
			ARCH := x86_32
		else ifeq ($(VSCMD_ARG_TGT_ARCH),x64)
			ARCH := x86_64
		else ifeq ($(VSCMD_ARG_TGT_ARCH),arm64)
			ARCH := arm64
		endif
	else
		ARCH := x86_64
	endif
	
	# Architecture-specific library paths
	ifneq ($(wildcard C:/local/boost_1_90_0/boost),)
		ifeq ($(ARCH), x86_64)
			BOOST_LIB_PATH := $(BOOST_ROOT)/lib64-msvc-14.3-static
			BOOST_LIB_SUFFIX := -vc143-mt-x64-1_90.lib
		else ifeq ($(ARCH), x86_32)
			BOOST_LIB_PATH := $(BOOST_ROOT)/lib32-msvc-14.3-static
			BOOST_LIB_SUFFIX := -vc143-mt-x32-1_90.lib
		else ifeq ($(ARCH), arm64)
			BOOST_LIB_PATH := $(BOOST_ROOT)/lib64-arm-msvc-14.3-static
			BOOST_LIB_SUFFIX := -vc143-mt-a64-1_90.lib
		endif
	else
		BOOST_LIB_PATH := $(BOOST_ROOT)/stage/lib
		ifeq ($(ARCH), x86_64)
			BOOST_LIB_SUFFIX := -vc143-mt-x64-1_90.lib
		else ifeq ($(ARCH), x86_32)
			BOOST_LIB_SUFFIX := -vc143-mt-x32-1_90.lib
		else ifeq ($(ARCH), arm64)
			BOOST_LIB_SUFFIX := -vc143-mt-a64-1_90.lib
		endif
	endif
	
	LIBS := $(BOOST_LIB_PATH)/boost_json$(BOOST_LIB_SUFFIX)
	
else
	SHELL := /bin/bash
    UNAME_S := $(shell uname -s)
    
    ifeq ($(UNAME_S),Linux)
        OS_NAME := linux
		EXT := .so
		CXX := g++
		
		# Base flags
		CXXFLAGS_COMMON := -fPIC -std=c++17 -Wall -Wextra
		
		# Debug/Release flags
		ifeq ($(TARGET),release)
			CXXFLAGS := $(CXXFLAGS_COMMON) -O3 -DNDEBUG -flto -s -ffunction-sections -fdata-sections -fvisibility=hidden
		else
			CXXFLAGS := $(CXXFLAGS_COMMON) -g -O0
		endif
		
		# Include paths
		INCLUDE_PATHS := -I../include -I../external/boost/libs/json/include \
						 -I../external/boost/libs/config/include -I../external/boost/libs/assert/include \
						 -I../external/boost/libs/throw_exception/include -I../external/boost/libs/container/include \
						 -I../external/boost/libs/core/include -I../external/boost/libs/move/include \
						 -I../external/boost/libs/static_assert/include -I../external/boost/libs/type_traits/include \
						 -I../external/boost/libs/system/include -I../external/boost/libs/mp11/include \
						 -I../external/boost/libs/align/include -I../external/boost/libs/intrusive/include
		
		BOOST_STAGE_PATH := ../external/boost/stage/lib
		ifeq ($(TARGET),release)
			LDFLAGS := -shared -flto -Wl,--gc-sections
		else
			LDFLAGS := -shared
		endif
		LIBS := $(BOOST_STAGE_PATH)/libboost_json.a $(BOOST_STAGE_PATH)/libboost_container.a
		
    else ifeq ($(UNAME_S),Darwin)
        OS_NAME := apple
		EXT := .dylib
		CXX := clang++
		
		# Base flags
		CXXFLAGS_COMMON := -fPIC -std=c++17 -Wall -Wextra -mmacosx-version-min=10.15
		
		# Debug/Release flags
		ifeq ($(TARGET),release)
			CXXFLAGS := $(CXXFLAGS_COMMON) -O3 -DNDEBUG -flto -ffunction-sections -fdata-sections -fvisibility=hidden
		else
			CXXFLAGS := $(CXXFLAGS_COMMON) -g -O0
		endif
		
		# Include paths
		INCLUDE_PATHS := -I../include -I../external/boost/libs/json/include \
						 -I../external/boost/libs/config/include -I../external/boost/libs/assert/include \
						 -I../external/boost/libs/throw_exception/include -I../external/boost/libs/container/include \
						 -I../external/boost/libs/core/include -I../external/boost/libs/move/include \
						 -I../external/boost/libs/static_assert/include -I../external/boost/libs/type_traits/include \
						 -I../external/boost/libs/system/include -I../external/boost/libs/mp11/include \
						 -I../external/boost/libs/align/include -I../external/boost/libs/intrusive/include
		
		ifeq ($(TARGET),release)
			LDFLAGS := -shared -undefined dynamic_lookup -mmacosx-version-min=10.15 -flto -Wl,-dead_strip
		else
			LDFLAGS := -shared -undefined dynamic_lookup -mmacosx-version-min=10.15
		endif
		LIBS := -L../external/boost/stage/lib -lboost_json
    else
        $(error Unknown operating system detected)
    endif
endif

all: $(BUILD_DIR)/example_plugin$(EXT)

$(BUILD_DIR)/example_plugin$(EXT): example_plugin.cpp
	@mkdir -p $(BUILD_DIR)
	@echo "Building plugin -> $@"
ifeq ($(OS_NAME),windows)
	@$(CXX) $(CXXFLAGS) $(INCLUDE_PATHS) $< $(LIBS) /link $(LDFLAGS) /out:$@
else
	@$(CXX) $(CXXFLAGS) $(INCLUDE_PATHS) $(LDFLAGS) -o $@ $< $(LIBS)
endif
	@echo "Building plugin [DONE] -> $@"

install: all

clean:
	@rm -f $(BUILD_DIR)/example_plugin$(EXT) $(BUILD_DIR)/example_plugin.pdb $(BUILD_DIR)/example_plugin.exp $(BUILD_DIR)/example_plugin.lib *.o

.PHONY: all install clean
