---
description: "Best practices for authoring GNU Make Makefiles"
applyTo: "**/Makefile, **/makefile, **/*.mk, **/GNUmakefile"
---

# Makefile Development Instructions

Instructions for writing clean, maintainable, and portable GNU Make Makefiles. These instructions are based on the [GNU Make manual](https://www.gnu.org/software/make/manual/).

## General Principles

- Write clear and maintainable makefiles that follow GNU Make conventions
- Use descriptive target names that clearly indicate their purpose
- Keep the default goal (first target) as the most common build operation
- Prioritize readability over brevity when writing rules and recipes
- Add comments to explain complex rules, variables, or non-obvious behavior

## Naming Conventions

- Name your makefile `Makefile` (recommended for visibility) or `makefile`
- Use `GNUmakefile` only for GNU Make-specific features incompatible with other make implementations
- Use standard variable names: `objects`, `OBJECTS`, `objs`, `OBJS`, `obj`, or `OBJ` for object file lists
- Use uppercase for built-in variable names (e.g., `CC`, `CFLAGS`, `LDFLAGS`)
- Use descriptive target names that reflect their action (e.g., `clean`, `install`, `test`)

## File Structure

- Place the default goal (primary build target) as the first rule in the makefile
- Group related targets together logically
- Define variables at the top of the makefile before rules
- Use `.PHONY` to declare targets that don't represent files
- Structure makefiles with: variables, then rules, then phony targets

```makefile
# Variables
CC = gcc
CFLAGS = -Wall -g
objects = main.o utils.o

# Default goal
all: program

# Rules
program: $(objects)
	$(CC) -o program $(objects)

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

# Phony targets
.PHONY: clean all
clean:
	rm -f program $(objects)
```

## Variables and Substitution

- Use variables to avoid duplication and improve maintainability
- Define variables with `:=` (simple expansion) for immediate evaluation, `=` for recursive expansion
- Use `?=` to set default values that can be overridden
- Use `+=` to append to existing variables
- Reference variables with `$(VARIABLE)` not `$VARIABLE` (unless single character)
- Use automatic variables (`$@`, `$<`, `$^`, `$?`, `$*`) in recipes to make rules more generic

```makefile
# Simple expansion (evaluates immediately)
CC := gcc

# Recursive expansion (evaluates when used)
CFLAGS = -Wall $(EXTRA_FLAGS)

# Conditional assignment
PREFIX ?= /usr/local

# Append to variable
CFLAGS += -g
```

## Rules and Prerequisites

- Separate targets, prerequisites, and recipes clearly
- Use implicit rules for standard compilations (e.g., `.c` to `.o`)
- List prerequisites in logical order (normal prerequisites before order-only)
- Use order-only prerequisites (after `|`) for directories and dependencies that shouldn't trigger rebuilds
- Include all actual dependencies to ensure correct rebuilds
- Avoid circular dependencies between targets

```makefile
# Normal prerequisites
program: main.o utils.o
	$(CC) -o $@ $^

# Order-only prerequisites (directory creation)
obj/%.o: %.c | obj
	$(CC) $(CFLAGS) -c $< -o $@

obj:
	mkdir -p obj
```

## Recipes and Commands

- Start every recipe line with a **tab character** (not spaces) unless `.RECIPEPREFIX` is changed
- Use `@` prefix to suppress command echoing when appropriate
- Use `-` prefix to ignore errors for specific commands (use sparingly)
- Combine related commands with `&&` or `;` on the same line when they must execute together
- Keep recipes readable; break long commands across multiple lines with backslash continuation

```makefile
# Silent command
clean:
	@echo "Cleaning up..."
	@rm -f $(objects)

# Ignore errors
.PHONY: clean-all
clean-all:
	-rm -rf build/

# Multi-line recipe with proper continuation
install: program
	install -d $(PREFIX)/bin && \
		install -m 755 program $(PREFIX)/bin
```

## Phony Targets

- Always declare phony targets with `.PHONY` to avoid conflicts with files of the same name
- Use phony targets for actions like `clean`, `install`, `test`, `all`
- Place phony target declarations near their rule definitions or at the end of the makefile

## Pattern Rules and Implicit Rules

- Use pattern rules (`%.o: %.c`) for generic transformations
- Leverage built-in implicit rules when appropriate
- Override implicit rule variables (like `CC`, `CFLAGS`) rather than rewriting the rules
- Define custom pattern rules only when built-in rules are insufficient

## Conditional Directives

- Use conditional directives (`ifeq`, `ifneq`, `ifdef`, `ifndef`) for platform or configuration-specific rules
- Use `ifndef VAR` / `VAR := value` pattern for variables that should be overridable by the environment
- Place conditionals at the makefile level, not within recipes (use shell conditionals in recipes)

```makefile
# Platform-specific settings
ifeq ($(OS),Windows_NT)
    EXE_EXT = .exe
else
    EXE_EXT =
endif

# Overridable default (environment variable takes precedence)
ifndef BUNDLE
    BUNDLE := false
endif
```

## Automatic Prerequisites

- Generate header dependencies automatically rather than maintaining them manually
- Use compiler flags like `-MMD` and `-MP` to generate `.d` files with dependencies
- Include generated dependency files with `-include $(deps)` to avoid errors if they don't exist

```makefile
objects = main.o utils.o
deps = $(objects:.o=.d)

-include $(deps)

%.o: %.c
	$(CC) $(CFLAGS) -MMD -MP -c $< -o $@
```

## Error Handling and Debugging

- Use `$(error text)` or `$(warning text)` functions for build-time diagnostics
- Test makefiles with `make -n` (dry run) to see commands without executing
- Validate required variables and tools at the beginning of the makefile

```makefile
# Check for required tools
ifeq ($(shell which gcc),)
    $(error "gcc is not installed or not in PATH")
endif

# Validate required variables
ifndef VERSION
    $(error VERSION is not defined)
endif
```

## Clean Targets

- Always provide a `clean` target to remove generated files
- Declare `clean` as phony to avoid conflicts with a file named "clean"
- Use `-` prefix with `rm` commands to ignore errors if files don't exist

```makefile
.PHONY: clean distclean

clean:
	-rm -f $(objects)
	-rm -f $(deps)

distclean: clean
	-rm -f program
```

## Performance Optimization

- Use `:=` for variables that don't need recursive expansion (faster)
- Avoid unnecessary use of `$(shell ...)` which creates subprocesses
- Use parallel builds (`make -j`) safely by ensuring targets don't conflict

## Documentation and Comments

- Add a header comment explaining the makefile's purpose
- Document non-obvious variable settings and their effects
- Include usage examples in comments

```makefile
# Makefile for building the example application
#
# Usage:
#   make          - Build the program
#   make clean    - Remove generated files
#   make install  - Install to $(PREFIX)
#
# Variables:
#   CC       - C compiler (default: gcc)
#   PREFIX   - Installation prefix (default: /usr/local)
```

## Special Targets

- Use `.PHONY` for non-file targets
- Use `.DELETE_ON_ERROR` to remove targets if recipe fails
- Use `.PRECIOUS` to preserve intermediate files

```makefile
.DELETE_ON_ERROR:
.PRECIOUS: %.o
```
