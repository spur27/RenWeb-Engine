#!/usr/bin/env bash
# =============================================================================
# build_for_release.sh - Automated release build script for RenWeb
# =============================================================================
# Creates a complete release with example archives, executables, and bundles
# =============================================================================

set -e  # Exit on error

# =============================================================================
# Color codes for output
# =============================================================================
RESET='\033[0m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
MAGENTA='\033[35m'
CYAN='\033[36m'
BOLD='\033[1m'

# =============================================================================
# Helper Functions
# =============================================================================

print_header() {
    echo -e "${CYAN}${BOLD}========================================${RESET}"
    echo -e "${CYAN}${BOLD}$1${RESET}"
    echo -e "${CYAN}${BOLD}========================================${RESET}"
}

print_info() {
    echo -e "${GREEN}${BOLD}[INFO]${RESET} $1"
}

print_error() {
    echo -e "${RED}${BOLD}[ERROR]${RESET} $1"
}

print_warning() {
    echo -e "${YELLOW}${BOLD}[WARN]${RESET} $1"
}

print_step() {
    echo -e "${BLUE}${BOLD}[STEP]${RESET} $1"
}

# Get version from info.json
get_version() {
    grep -o '"version"[^"]*"[^"]*"' info.json | cut -d'"' -f4 | xargs
}

# Get exe name from info.json
get_exe_name() {
    sed -n 's/.*"title"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' ./info.json | tr '[:upper:]' '[:lower:]' | sed 's/[[:space:]]/-/g' | xargs
}

# Generate bundle_exec script for a specific executable
generate_bundle_exec() {
    local exe_name=$1
    local version=$2
    local os_name=$3
    local output_file=$4
    
    if [ "$os_name" = "windows" ]; then
        # Generate .bat file
        cat > "$output_file" <<'EOF'
@echo off
setlocal

:: Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

:: Add the lib folder to PATH if it exists
if exist "%SCRIPT_DIR%lib" (
    set "PATH=%SCRIPT_DIR%lib;%PATH%"
)

:: Run the RenWeb executable with all passed arguments
"%SCRIPT_DIR%@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-*.exe" %*

endlocal
EOF
    else
        # Generate .sh file
        cat > "$output_file" <<'EOF'
#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Set library path based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    if [ -d "$SCRIPT_DIR/lib" ]; then
        export DYLD_LIBRARY_PATH="$SCRIPT_DIR/lib:$DYLD_LIBRARY_PATH"
    fi
else
    # Linux
    if [ -d "$SCRIPT_DIR/lib" ]; then
        export LD_LIBRARY_PATH="$SCRIPT_DIR/lib:$LD_LIBRARY_PATH"
    fi
fi

# Run the RenWeb executable with all passed arguments
"$SCRIPT_DIR/@EXE_NAME@-@EXE_VERSION@-@OS_NAME@-"* "$@"
EOF
        chmod +x "$output_file"
    fi
    
    # Replace placeholders
    sed -i.bak "s/@EXE_NAME@/$exe_name/g" "$output_file"
    sed -i.bak "s/@EXE_VERSION@/$version/g" "$output_file"
    sed -i.bak "s/@OS_NAME@/$os_name/g" "$output_file"
    rm -f "${output_file}.bak"
}

# =============================================================================
# Main Script
# =============================================================================

main() {
    print_header "RenWeb Release Build Script"
    
    # Verify we're in the right directory
    if [ ! -f "info.json" ]; then
        print_error "info.json not found. Please run this script from the project root."
        exit 1
    fi
    
    # Get version and exe name
    VERSION=$(get_version)
    EXE_NAME=$(get_exe_name)
    
    if [ -z "$VERSION" ]; then
        print_error "Could not extract version from info.json"
        exit 1
    fi
    
    print_info "Project: $EXE_NAME"
    print_info "Version: $VERSION"
    echo ""
    
    # ==========================================================================
    # Step 1: Prepare release directory
    # ==========================================================================
    print_step "1. Preparing release directory"
    if [ -d "./release" ]; then
        print_info "Clearing existing release directory"
        rm -rf ./release
    fi
    mkdir -p ./release
    print_info "Created: ./release"
    echo ""
    
    # ==========================================================================
    # Step 2: Clear build directory
    # ==========================================================================
    print_step "2. Clearing build directory"
    if [ -d "./build" ]; then
        print_info "Removing existing build contents"
        rm -rf ./build/*
    else
        mkdir -p ./build
    fi
    print_info "Build directory cleared"
    echo ""
    
    # ==========================================================================
    # Step 3: Create build/content directory
    # ==========================================================================
    print_step "3. Creating build/content directory"
    mkdir -p ./build/content
    print_info "Created: ./build/content"
    echo ""
    
    # ==========================================================================
    # Step 4: Copy example pages
    # ==========================================================================
    print_step "4. Copying example pages from web/example/pages"
    if [ -d "./web/example/pages" ]; then
        page_count=0
        for page_dir in ./web/example/pages/*; do
            if [ -d "$page_dir" ]; then
                page_name=$(basename "$page_dir")
                print_info "Copying page: $page_name"
                cp -r "$page_dir" "./build/content/$page_name"
                page_count=$((page_count + 1))
            fi
        done
        print_info "Copied $page_count pages"
    else
        print_error "web/example/pages directory not found"
        exit 1
    fi
    echo ""
    
    # ==========================================================================
    # Step 5: Copy API files to each page directory
    # ==========================================================================
    print_step "5. Copying API files (index.js, index.js.map, index.d.ts) to each page"
    if [ ! -d "./web/api" ]; then
        print_warning "web/api directory not found, skipping API files"
    else
        for page_dir in ./build/content/*; do
            if [ -d "$page_dir" ]; then
                page_name=$(basename "$page_dir")
                copied=0
                for file in index.js index.js.map index.d.ts; do
                    if [ -f "./web/api/$file" ]; then
                        cp "./web/api/$file" "$page_dir/"
                        copied=$((copied + 1))
                    fi
                done
                print_info "$page_name: copied $copied API files"
            fi
        done
    fi
    echo ""
    
    # ==========================================================================
    # Step 6: Copy directories and files to build
    # ==========================================================================
    print_step "6. Copying resources to build directory"
    
    if [ -d "./licenses" ]; then
        print_info "Copying: ./licenses → ./build/licenses"
        cp -r ./licenses ./build/
    else
        print_warning "licenses directory not found"
    fi
    
    if [ -d "./resource" ]; then
        print_info "Copying: ./resource → ./build/resource"
        cp -r ./resource ./build/
    else
        print_warning "resource directory not found"
    fi
    
    if [ -d "./web/example/assets" ]; then
        print_info "Copying: ./web/example/assets → ./build/assets"
        cp -r ./web/example/assets ./build/assets
    else
        print_warning "web/example/assets directory not found"
    fi
    
    if [ -f "./config.json" ]; then
        print_info "Copying: ./config.json"
        cp ./config.json ./build/
    else
        print_warning "config.json not found"
    fi
    
    if [ -f "./info.json" ]; then
        print_info "Copying: ./info.json"
        cp ./info.json ./build/
    else
        print_error "info.json not found"
        exit 1
    fi
    echo ""
    
    # ==========================================================================
    # Step 7: Create empty directories
    # ==========================================================================
    print_step "7. Creating empty directories"
    mkdir -p ./build/custom
    mkdir -p ./build/backup
    mkdir -p ./build/plugins
    mkdir -p ./build/lib
    print_info "Created: custom, backup, plugins, lib"
    echo ""
    
    # ==========================================================================
    # Step 8: Compress build directory to example archives
    # ==========================================================================
    print_step "8. Creating example archives"
    
    print_info "Creating: example-${VERSION}.zip"
    (cd ./build && zip -q -r "../release/example-${VERSION}.zip" .)
    
    print_info "Creating: example-${VERSION}.tar.gz"
    tar -czf "./release/example-${VERSION}.tar.gz" -C ./build .
    
    print_info "Example archives created successfully"
    echo ""
    
    # ==========================================================================
    # Step 9: Build all architectures with bundling
    # ==========================================================================
    print_step "9. Building all architectures (this may take a while)"
    print_warning "Running: ./build_all_archs.sh --bundle"
    echo ""
    
    if [ ! -f "./build_all_archs.sh" ]; then
        print_error "build_all_archs.sh not found"
        exit 1
    fi
    
    if ! ./build_all_archs.sh --bundle; then
        print_error "Build failed - check output above"
        exit 1
    fi
    
    echo ""
    print_info "All executables built successfully"
    echo ""
    
    # ==========================================================================
    # Step 10: Copy executables to release
    # ==========================================================================
    print_step "10. Copying executables to release directory"
    
    exe_count=0
    for exe in ./build/${EXE_NAME}-*; do
        if [ -f "$exe" ] && [ ! -d "$exe" ]; then
            # Exclude directories like lib-x86_64
            exe_name=$(basename "$exe")
            # Make sure it's an executable, not a library directory
            if [[ "$exe_name" == "${EXE_NAME}-"* ]]; then
                print_info "Copying: $exe_name"
                cp "$exe" "./release/"
                exe_count=$((exe_count + 1))
            fi
        fi
    done
    
    if [ $exe_count -eq 0 ]; then
        print_error "No executables found in ./build"
        exit 1
    fi
    
    print_info "Copied $exe_count executables"
    echo ""
    
    # ==========================================================================
    # Step 11: Create bundle archives for each executable
    # ==========================================================================
    print_step "11. Creating bundle archives for each executable"
    echo ""
    
    bundle_count=0
    for exe in ./build/${EXE_NAME}-*; do
        if [ -f "$exe" ] && [ ! -d "$exe" ]; then
            exe_name=$(basename "$exe")
            
            # Skip if not an executable
            if [[ "$exe_name" != "${EXE_NAME}-"* ]]; then
                continue
            fi
            
            print_info "Processing: $exe_name"
            
            # Extract components from executable name
            # Format: renweb-<version>-<os>-<arch>[.exe]
            # Remove executable name prefix and version
            name_without_prefix="${exe_name#${EXE_NAME}-}"
            name_without_prefix="${name_without_prefix#${VERSION}-}"
            
            # Remove .exe extension if present
            name_without_ext="${name_without_prefix%.exe}"
            
            # Extract OS and arch
            # Format should now be: <os>-<arch>
            os="${name_without_ext%%-*}"
            arch="${name_without_ext##*-}"
            
            print_info "  Detected: OS=$os, Arch=$arch"
            
            # Create tmp directory
            mkdir -p ./build/tmp
            
            # Copy executable
            cp "$exe" "./build/tmp/$exe_name"
            print_info "  ✓ Copied executable"
            
            # Copy lib directory if exists (rename lib-<arch> to lib)
            if [ -d "./build/lib-${arch}" ]; then
                print_info "  ✓ Copying lib-${arch} → ./build/tmp/lib"
                cp -r "./build/lib-${arch}" "./build/tmp/lib"
            else
                print_warning "  ⚠ No lib-${arch} directory found (may not be needed)"
            fi
            
            # Generate and copy bundle_exec script
            if [ "$os" = "windows" ]; then
                print_info "  ✓ Generating bundle_exec.bat"
                generate_bundle_exec "$EXE_NAME" "$VERSION" "$os" "./build/tmp/bundle_exec.bat"
            else
                print_info "  ✓ Generating bundle_exec.sh"
                generate_bundle_exec "$EXE_NAME" "$VERSION" "$os" "./build/tmp/bundle_exec.sh"
            fi
            
            # Create archives
            bundle_name="bundle-${VERSION}-${os}-${arch}"
            
            print_info "  → Creating ${bundle_name}.zip"
            (cd ./build/tmp && zip -q -r "../../release/${bundle_name}.zip" .)
            
            print_info "  → Creating ${bundle_name}.tar.gz"
            tar -czf "./release/${bundle_name}.tar.gz" -C ./build/tmp .
            
            # Clean up tmp
            rm -rf ./build/tmp
            
            bundle_count=$((bundle_count + 1))
            print_info "  ✓ Bundle ${bundle_count} complete"
            echo ""
        fi
    done
    
    if [ $bundle_count -eq 0 ]; then
        print_warning "No bundle archives created"
    else
        print_info "Created $bundle_count bundle archives (each as .zip and .tar.gz)"
    fi
    echo ""
    
    # ==========================================================================
    # Summary
    # ==========================================================================
    print_header "Release Build Complete!"
    
    print_info "Release directory: ./release"
    print_info ""
    print_info "Contents:"
    print_info "  • Example archives: example-${VERSION}.{zip,tar.gz}"
    print_info "  • Executables: ${exe_count} files"
    print_info "  • Bundle archives: ${bundle_count} × 2 (zip + tar.gz) = $((bundle_count * 2)) files"
    echo ""
    
    # Display release directory size
    if command -v du >/dev/null 2>&1; then
        release_size=$(du -sh ./release 2>/dev/null | cut -f1)
        print_info "Total release size: $release_size"
    fi
    
    echo ""
    print_info "Release files:"
    ls -lh ./release 2>/dev/null || ls ./release
}

# =============================================================================
# Script Entry Point
# =============================================================================

# Handle help flag
if [[ "$1" == "--help" ]] || [[ "$1" == "-h" ]]; then
    echo "Usage: $0"
    echo ""
    echo "Description:"
    echo "  Automated release build script for RenWeb that creates:"
    echo "  - Example content archives (zip + tar.gz)"
    echo "  - Executables for all supported architectures"
    echo "  - Bundle archives with libraries for each architecture"
    echo ""
    echo "Requirements:"
    echo "  - build_all_archs.sh script"
    echo "  - zip and tar utilities"
    echo "  - Cross-compilers for target architectures"
    echo ""
    echo "Output:"
    echo "  All release artifacts are placed in ./release/"
    exit 0
fi

# Run main function
main "$@"
