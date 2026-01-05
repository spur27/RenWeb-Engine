#!/usr/bin/env bash

# =============================================================================
# build_all_archs.sh - Build RenWeb for all supported architectures
# =============================================================================
# This script builds the RenWeb executable for all supported architectures
# based on the detected operating system and available cross-compilers.
# =============================================================================

set -e  # Exit on error

# Color codes for output
RESET='\033[0m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BLUE='\033[34m'
MAGENTA='\033[35m'
CYAN='\033[36m'
BOLD='\033[1m'

# =============================================================================
# Supported Toolchains and Architectures
# =============================================================================

# Linux toolchains (simple list - bash 3.2 compatible)
LINUX_TOOLCHAINS="x86_64-linux-gnu i686-linux-gnu aarch64-linux-gnu arm-linux-gnueabihf mips-linux-gnu mipsel-linux-gnu mips64-linux-gnuabi64 mips64el-linux-gnuabi64 powerpc-linux-gnu powerpc64-linux-gnu riscv64-linux-gnu s390x-linux-gnu sparc64-linux-gnu"

# macOS architectures
MACOS_ARCHITECTURES="arm64 x86_64"

# Windows architectures  
WINDOWS_ARCHITECTURES="x64 x86 arm64 arm"

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

print_warning() {
    echo -e "${YELLOW}${BOLD}[WARN]${RESET} $1"
}

print_error() {
    echo -e "${RED}${BOLD}[ERROR]${RESET} $1"
}

print_success() {
    echo -e "${GREEN}${BOLD}[SUCCESS]${RESET} $1"
}

print_building() {
    echo -e "${MAGENTA}${BOLD}[BUILD]${RESET} Building for ${CYAN}$1${RESET} (${YELLOW}$2${RESET})"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if a cross-compiler toolchain exists
toolchain_exists() {
    command_exists "$1-gcc" && command_exists "$1-g++"
}

# Build for a specific toolchain
build_for_toolchain() {
    local toolchain=$1
    local arch_name=$2
    
    print_building "$arch_name" "$toolchain"
    
    if make clear TOOLCHAIN="$toolchain" TARGET=release; then
        if make TOOLCHAIN="$toolchain" TARGET=release -j$(nproc 2>/dev/null || echo 4); then
            print_success "Built for $arch_name successfully"
            return 0
        else
            print_error "Failed to build for $arch_name"
            return 1
        fi
    else
        print_error "Failed to clear for $arch_name"
        return 1
    fi
}

# Build native (no cross-compilation)
build_native() {
    local arch_name=$1
    
    print_building "$arch_name" "native"
    
    if make clear TARGET=release; then
        if make TARGET=release -j$(nproc 2>/dev/null || echo 4); then
            print_success "Built native for $arch_name successfully"
            return 0
        else
            print_error "Failed to build native"
            return 1
        fi
    else
        print_error "Failed to clear native build"
        return 1
    fi
}

# =============================================================================
# Detect Operating System and Architecture
# =============================================================================

detect_os() {
    case "$(uname -s)" in
        Linux*)
            OS_NAME="Linux"
            HOST_ARCH=$(uname -m)
            ;;
        Darwin*)
            OS_NAME="macOS"
            HOST_ARCH=$(uname -m)
            ;;
        CYGWIN*|MINGW*|MSYS*)
            OS_NAME="Windows"
            # On Windows, detect architecture from environment or processor
            if [ -n "$VSCMD_ARG_TGT_ARCH" ]; then
                HOST_ARCH="$VSCMD_ARG_TGT_ARCH"
            elif [ -n "$PROCESSOR_ARCHITECTURE" ]; then
                case "$PROCESSOR_ARCHITECTURE" in
                    AMD64) HOST_ARCH="x86_64" ;;
                    x86) HOST_ARCH="x86" ;;
                    ARM64) HOST_ARCH="arm64" ;;
                    *) HOST_ARCH="$PROCESSOR_ARCHITECTURE" ;;
                esac
            else
                HOST_ARCH="x86_64"  # Default assumption
            fi
            ;;
        *)
            print_error "Unknown operating system: $(uname -s)"
            exit 1
            ;;
    esac
}

# =============================================================================
# Build Functions by OS
# =============================================================================

build_linux() {
    local success_count=0
    local fail_count=0
    local total_count=0
    
    print_header "Building for Linux - All Architectures (13 total)"
    print_info "Host architecture: $HOST_ARCH"
    echo ""
    
    # Map host architecture to toolchain name to skip it later
    local host_toolchain=""
    case "$HOST_ARCH" in
        x86_64) host_toolchain="x86_64-linux-gnu" ;;
        i686|i386) host_toolchain="i686-linux-gnu" ;;
        aarch64|arm64) host_toolchain="aarch64-linux-gnu" ;;
        armv7l|armhf) host_toolchain="arm-linux-gnueabihf" ;;
        mips) host_toolchain="mips-linux-gnu" ;;
        mipsel) host_toolchain="mipsel-linux-gnu" ;;
        mips64) host_toolchain="mips64-linux-gnuabi64" ;;
        mips64el) host_toolchain="mips64el-linux-gnuabi64" ;;
        ppc) host_toolchain="powerpc-linux-gnu" ;;
        ppc64) host_toolchain="powerpc64-linux-gnu" ;;
        riscv64) host_toolchain="riscv64-linux-gnu" ;;
        s390x) host_toolchain="s390x-linux-gnu" ;;
        sparc64) host_toolchain="sparc64-linux-gnu" ;;
    esac
    
    # First, try to build native (host architecture)
    print_info "Building native (host architecture: $HOST_ARCH)..."
    total_count=$((total_count + 1))
    if build_native "native ($HOST_ARCH)"; then
        success_count=$((success_count + 1))
    else
        fail_count=$((fail_count + 1))
    fi
    echo ""
    
    # Build for each available cross-compiler toolchain (skip host toolchain)
    for toolchain in $LINUX_TOOLCHAINS; do
        # Skip the host toolchain since we already built it natively
        if [ "$toolchain" = "$host_toolchain" ]; then
            print_info "Skipping $toolchain (already built natively)"
            continue
        fi
        
        total_count=$((total_count + 1))
        
        if toolchain_exists "$toolchain"; then
            if build_for_toolchain "$toolchain" "$toolchain"; then
                success_count=$((success_count + 1))
            else
                fail_count=$((fail_count + 1))
            fi
        else
            print_warning "Toolchain $toolchain not found, skipping"
            fail_count=$((fail_count + 1))
        fi
        echo ""
    done
    
    # Print summary
    print_header "Build Summary"
    echo -e "${GREEN}Successful builds: ${BOLD}$success_count${RESET}"
    echo -e "${RED}Failed builds: ${BOLD}$fail_count${RESET}"
    echo -e "${CYAN}Total attempts: ${BOLD}$total_count${RESET}"
    
    if [ $success_count -gt 0 ]; then
        print_info "Built executables are located in: ./build/"
        ls -lh ./build/ 2>/dev/null | grep -E "renweb-.*-linux-" || true
    fi
}

build_macos() {
    local success_count=0
    local fail_count=0
    local total_count=0
    
    print_header "Building for macOS - Multiple Architectures"
    print_info "Host architecture: $HOST_ARCH"
    echo ""
    
    if ! command_exists "clang++"; then
        print_error "clang++ not found!"
        return 1
    fi
    
    # Check if Xcode Command Line Tools are installed
    if ! xcode-select -p >/dev/null 2>&1; then
        print_error "Xcode Command Line Tools not installed!"
        print_info "Installing Xcode Command Line Tools..."
        if xcode-select --install 2>&1; then
            print_info "Please wait for installation to complete, then run this script again"
            return 1
        fi
    fi
    
    local ncpu=$(sysctl -n hw.ncpu 2>/dev/null || echo 4)
    
    # Supported macOS architectures for cross-compilation
    # arm64: Apple Silicon (M1, M2, M3, etc.)
    # x86_64: Intel 64-bit
    # Both can be cross-compiled with Xcode SDK
    local SUPPORTED_ARCHS="arm64 x86_64"
    
    print_info "Supported architectures: $SUPPORTED_ARCHS"
    print_info "Note: macOS cross-compilation uses -arch flag with Xcode SDK"
    echo ""
    
    # Build for each supported architecture
    for arch in $SUPPORTED_ARCHS; do
        total_count=$((total_count + 1))
        
        print_building "$arch" "clang++ -arch $arch"
        
        # Clear object files but keep binaries from previous arch builds
        # Use 'make clear' which only removes objects, not executables
        make clear >/dev/null 2>&1
        
        # Pass ARCH to makefile for filename and ARCH_FLAGS for compilation
        # The makefile will use ARCH in the output name and append ARCH_FLAGS to CXXFLAGS/LDFLAGS
        if ARCH="$arch" ARCH_FLAGS="-arch $arch" make TARGET=release -j$ncpu 2>&1; then
            print_success "Built for $arch successfully"
            success_count=$((success_count + 1))
        else
            print_error "Failed to build for $arch"
            fail_count=$((fail_count + 1))
        fi
        echo ""
    done
    
    # If we built both architectures successfully, offer to create universal binary
    if [ $success_count -eq 2 ]; then
        print_info "Creating universal binary (arm64 + x86_64)..."
        
        # Find the two binaries
        local arm64_bin=$(ls ./build/renweb-*-apple-arm64 2>/dev/null | head -1)
        local x86_64_bin=$(ls ./build/renweb-*-apple-x86_64 2>/dev/null | head -1)
        
        if [ -n "$arm64_bin" ] && [ -n "$x86_64_bin" ]; then
            # Extract version from info.json
            local version=$(grep -o '"version"[^"]*"[^"]*"' info.json | cut -d'"' -f4)
            local universal_bin="./build/renweb-${version}-apple-universal"
            
            if lipo -create "$arm64_bin" "$x86_64_bin" -output "$universal_bin" 2>/dev/null; then
                print_success "Universal binary created: $universal_bin"
                success_count=$((success_count + 1))
                
                # Verify the universal binary contains both architectures
                print_info "Universal binary architectures:"
                lipo -info "$universal_bin"
            else
                print_warning "Could not create universal binary (lipo failed)"
            fi
        else
            print_warning "Could not find both architecture binaries to create universal binary"
        fi
    fi
    
    # Print summary
    print_header "Build Summary"
    echo -e "${GREEN}Successful builds: ${BOLD}$success_count${RESET}"
    echo -e "${RED}Failed builds: ${BOLD}$fail_count${RESET}"
    echo -e "${CYAN}Total attempts: ${BOLD}$total_count${RESET}"
    
    if [ $success_count -gt 0 ]; then
        print_info "Built executables are located in: ./build/"
        ls -lh ./build/ 2>/dev/null | grep -E "renweb-.*-apple-" || true
    fi
}

build_windows() {
    local success_count=0
    local fail_count=0
    local total_count=3
    
    print_header "Building for Windows - All Architectures (3 total)"
    print_info "Detected Windows environment"
    echo ""
    
    # Find Visual Studio installation
    local vswhere="/c/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    if [ ! -f "$vswhere" ]; then
        vswhere="/c/Program Files/Microsoft Visual Studio/Installer/vswhere.exe"
    fi
    
    local vs_path=""
    if [ -f "$vswhere" ]; then
        vs_path=$("$vswhere" -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>/dev/null | head -1)
    fi
    
    if [ -z "$vs_path" ]; then
        # Try common locations
        if [ -d "/c/Program Files/Microsoft Visual Studio/2022/Community" ]; then
            vs_path="/c/Program Files/Microsoft Visual Studio/2022/Community"
        elif [ -d "/c/Program Files/Microsoft Visual Studio/2022/Professional" ]; then
            vs_path="/c/Program Files/Microsoft Visual Studio/2022/Professional"
        fi
    fi
    
    if [ -z "$vs_path" ]; then
        print_error "Could not find Visual Studio installation"
        print_info "Please install Visual Studio 2022 with C++ tools"
        return 1
    fi
    
    print_info "Visual Studio: $vs_path"
    
    local vcvars_path="$vs_path/VC/Auxiliary/Build"
    if [ ! -d "$vcvars_path" ]; then
        print_error "Could not find vcvars at: $vcvars_path"
        return 1
    fi
    
    # Build each architecture
    local architectures="x64:x86_64:vcvars64.bat x86:x86_32:vcvars32.bat arm64:arm64:vcvarsamd64_arm64.bat"
    
    for arch_spec in $architectures; do
        IFS=':' read -r win_arch make_arch vcvars <<< "$arch_spec"
        
        echo ""
        print_building "$win_arch" "$vcvars"
        
        # Convert paths for Windows cmd
        local vcvars_win=$(cygpath -w "$vcvars_path/$vcvars" 2>/dev/null || echo "$vcvars_path\\$vcvars")
        
        # Create a temporary batch file for this build
        local temp_bat=$(mktemp --suffix=.bat)
        cat > "$temp_bat" <<EOF
@echo off
call "$vcvars_win" >nul 2>&1
if errorlevel 1 exit /b 1
make clear ARCH=$make_arch TARGET=release >nul 2>&1
if errorlevel 1 exit /b 1
make ARCH=$make_arch TARGET=release -j4
EOF
        
        # Run the batch file
        if cmd //c "$(cygpath -w "$temp_bat" 2>/dev/null || echo "$temp_bat")" 2>&1; then
            print_success "Built $win_arch successfully"
            success_count=$((success_count + 1))
        else
            print_error "Build failed for $win_arch"
            fail_count=$((fail_count + 1))
        fi
        
        # Clean up temp file
        rm -f "$temp_bat"
    done
    
    # Print summary
    echo ""
    print_header "Build Summary"
    echo -e "${GREEN}Successful builds: ${BOLD}$success_count${RESET}"
    echo -e "${RED}Failed builds: ${BOLD}$fail_count${RESET}"
    echo -e "${CYAN}Total attempts: ${BOLD}$total_count${RESET}"
    
    if [ $success_count -gt 0 ]; then
        print_info "Built executables are located in: ./build/"
        ls -lh ./build/ 2>/dev/null | grep -E "renweb-.*-windows-" || true
    fi
    
    if [ $fail_count -gt 0 ]; then
        print_warning "Failed builds may be due to missing toolchains"
        print_info "Install via Visual Studio Installer: MSVC v143 ARM64 build tools"
    fi
}

# =============================================================================
# Main Script
# =============================================================================

main() {
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --help|-h)
                echo "Usage: $0"
                echo ""
                echo "Description:"
                echo "  Automatically detects your operating system and builds release"
                echo "  versions for all supported architectures on that platform."
                echo ""
                echo "Supported platforms:"
                echo "  - Linux:   13 architectures (x86_64, i686, ARM, MIPS, PowerPC, RISC-V, S390x, SPARC)"
                echo "  - macOS:   2 architectures (x86_64, arm64)"
                echo "  - Windows: 3 architectures (x64, x86, arm64)"
                echo ""
                echo "Example:"
                echo "  $0    # Build all architectures for current OS"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Detect OS and architecture
    detect_os
    
    print_header "RenWeb Multi-Architecture Build Script"
    print_info "Detected OS: $OS_NAME"
    print_info "Host architecture: $HOST_ARCH"
    echo ""
    
    # Check if make is available (not needed for Windows batch file approach)
    if [ "$OS_NAME" != "Windows" ] && ! command_exists make; then
        print_error "make command not found. Please install make."
        exit 1
    fi

    if ! make clean; then
        print_error "Failed to clean previous builds."
        exit 1
    fi
    
    # Build based on detected OS
    case "$OS_NAME" in
        Linux)
            build_linux
            ;;
        macOS)
            build_macos
            ;;
        Windows)
            build_windows
            ;;
        *)
            print_error "Unsupported operating system: $OS_NAME"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
