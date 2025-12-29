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
    local target=${3:-release}
    
    print_building "$arch_name" "$toolchain"
    
    if make clear TOOLCHAIN="$toolchain" TARGET="$target"; then
        if make TOOLCHAIN="$toolchain" TARGET="$target" -j$(nproc 2>/dev/null || echo 4); then
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
    local target=${2:-release}
    
    print_building "$arch_name" "native"
    
    if make clear TARGET="$target"; then
        if make TARGET="$target" -j$(nproc 2>/dev/null || echo 4); then
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
    local target=${1:-release}
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
    if build_native "native ($HOST_ARCH)" "$target"; then
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
            if build_for_toolchain "$toolchain" "$toolchain" "$target"; then
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
    local target=${1:-release}
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
        if ARCH="$arch" ARCH_FLAGS="-arch $arch" make TARGET="$target" -j$ncpu 2>&1; then
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
    local target=${1:-release}
    local success_count=0
    local fail_count=0
    local total_count=0
    
    print_header "Building for Windows - All Architectures (4 total)"
    print_info "Host architecture: $HOST_ARCH"
    echo ""
    
    # Check if cl.exe is available
    if ! command_exists "cl"; then
        print_error "cl.exe not found in PATH"
        print_warning "Please run this script in Git Bash with Visual Studio environment set up"
        print_info "Setup instructions:"
        echo "  1. Find your Visual Studio installation (usually in C:\\Program Files\\Microsoft Visual Studio\\)"
        echo "  2. In Git Bash, source the vcvars script for your target architecture:"
        echo "     - x64:   cmd //c 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat && bash'"
        echo "     - x86:   cmd //c 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars32.bat && bash'"
        echo "     - ARM64: cmd //c 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvarsamd64_arm64.bat && bash'"
        echo "     - ARM32: cmd //c 'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvarsamd64_arm.bat && bash'"
        echo "  3. Run this script"
        echo ""
        print_info "Alternatively, use build_all_archs_windows.bat to build all architectures sequentially"
        return 1
    fi
    
    print_info "Detected cl.exe compiler"
    
    # Detect which architecture environment is currently active
    local current_arch=""
    local current_arch_name=""
    
    if [ -n "$VSCMD_ARG_TGT_ARCH" ]; then
        current_arch="$VSCMD_ARG_TGT_ARCH"
        print_info "Detected VS target architecture from VSCMD_ARG_TGT_ARCH: $current_arch"
    elif [ -n "$PROCESSOR_ARCHITECTURE" ]; then
        case "$PROCESSOR_ARCHITECTURE" in
            AMD64) current_arch="x64" ;;
            x86) current_arch="x86" ;;
            ARM64) current_arch="arm64" ;;
            ARM) current_arch="arm" ;;
            *) current_arch="$PROCESSOR_ARCHITECTURE" ;;
        esac
        print_info "Detected architecture from PROCESSOR_ARCHITECTURE: $current_arch"
    fi
    
    if [ -z "$current_arch" ]; then
        print_warning "Could not detect target architecture, defaulting to x64"
        current_arch="x64"
    fi
    
    # Build for the current architecture environment
    print_info "Building for $current_arch (VS environment)"
    total_count=$((total_count + 1))
    
    print_building "$current_arch" "cl.exe"
    
    if make clear TARGET="$target" 2>&1 | grep -v "^make"; then
        if make TARGET="$target" -j4 2>&1; then
            print_success "Built for $current_arch successfully"
            success_count=$((success_count + 1))
        else
            print_error "Failed to build for $current_arch"
            fail_count=$((fail_count + 1))
        fi
    else
        print_error "Failed to clear for $current_arch"
        fail_count=$((fail_count + 1))
    fi
    echo ""
    
    # Print summary
    print_header "Build Summary"
    echo -e "${GREEN}Successful builds: ${BOLD}$success_count${RESET}"
    echo -e "${RED}Failed builds: ${BOLD}$fail_count${RESET}"
    echo -e "${CYAN}Total attempts: ${BOLD}$total_count${RESET}"
    
    if [ $success_count -gt 0 ]; then
        print_info "Built executables are located in: ./build/"
        ls -lh ./build/ 2>/dev/null | grep -E "renweb-.*-windows-" || true
    fi
    
    echo ""
    print_info "Note: This script builds for ONE architecture at a time (the active VS environment)"
    print_info "To build all 4 Windows architectures, run build_all_archs_windows.bat instead"
    print_info "Or manually run this script in different VS Developer Command Prompt sessions:"
    echo ""
    echo "  For each architecture:"
    for arch in $WINDOWS_ARCHITECTURES; do
        local vcvars_script=""
        case "$arch" in
            x64) vcvars_script="vcvars64.bat" ;;
            x86) vcvars_script="vcvars32.bat" ;;
            arm64) vcvars_script="vcvarsamd64_arm64.bat" ;;
            arm) vcvars_script="vcvarsamd64_arm.bat" ;;
        esac
        echo "    $arch: Run $vcvars_script then this script"
    done
}

# =============================================================================
# Main Script
# =============================================================================

main() {
    local target="release"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --debug)
                target="debug"
                shift
                ;;
            --release)
                target="release"
                shift
                ;;
            --help|-h)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --debug          Build in debug mode (default: release)"
                echo "  --release        Build in release mode"
                echo "  --help, -h       Show this help message"
                echo ""
                echo "Description:"
                echo "  Automatically detects your operating system and builds for all"
                echo "  supported architectures on that platform."
                echo ""
                echo "Supported platforms:"
                echo "  - Linux:   13 architectures (x86_64, i686, ARM, MIPS, PowerPC, RISC-V, S390x, SPARC)"
                echo "  - macOS:   4 architectures (x86_64, arm64, x86_32, armv7)"
                echo "  - Windows: 4 architectures (x64, x86, arm64, arm)"
                echo ""
                echo "Examples:"
                echo "  $0                    # Build all architectures for current OS in release mode"
                echo "  $0 --debug            # Build all architectures for current OS in debug mode"
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
    print_info "Build target: $target"
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
            build_linux "$target"
            ;;
        macOS)
            build_macos "$target"
            ;;
        Windows)
            build_windows "$target"
            ;;
        *)
            print_error "Unsupported operating system: $OS_NAME"
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
