CXX = g++
CXXFLAGS = -fPIC -std=c++17 -Wall -Wextra -I../include -I../external/boost/libs/json/include \
           -I../external/boost/libs/config/include -I../external/boost/libs/assert/include \
           -I../external/boost/libs/throw_exception/include -I../external/boost/libs/container/include \
           -I../external/boost/libs/core/include -I../external/boost/libs/move/include \
           -I../external/boost/libs/static_assert/include -I../external/boost/libs/type_traits/include \
           -I../external/boost/libs/system/include -I../external/boost/libs/mp11/include \
           -I../external/boost/libs/align/include -I../external/boost/libs/intrusive/include

BUILD_DIR = ../build/plugins
UNAME_S := $(shell uname -s)

ifeq ($(UNAME_S),Linux)
    EXT = .so
    LDFLAGS = -shared
endif
ifeq ($(UNAME_S),Darwin)
    EXT = .dylib
    LDFLAGS = -shared -undefined dynamic_lookup
endif

all: $(BUILD_DIR)/example_plugin$(EXT)

$(BUILD_DIR)/example_plugin$(EXT): example_plugin.cpp
	@mkdir -p $(BUILD_DIR)
	@echo "Building plugin -> $@"
	@$(CXX) $(CXXFLAGS) $(LDFLAGS) -o $@ $<

install: all

clean:
	@rm -f $(BUILD_DIR)/example_plugin$(EXT) *.o

.PHONY: all install clean
