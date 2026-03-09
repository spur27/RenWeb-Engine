FROM node:18-bullseye-slim

ENV DEBIAN_FRONTEND=noninteractive

# ── Base archive & build tools ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl wget ca-certificates xz-utils zip unzip tar gzip bzip2 libarchive-tools \
    build-essential git gnupg python3 file \
    # Linux packaging
    dpkg-dev fakeroot rpm squashfs-tools \
    # Windows packaging — NSIS installer builder + MinGW resource compiler
    nsis mingw-w64 icoutils osslsigncode \
    # Windows MSI — msitools provides msibuild/msiextract; wixl provides wixl/wixl-heat
    msitools wixl \
    # macOS DMG — ISO/HFS image tools (user-space, no root/mount needed)
    hfsutils mtools genisoimage xorriso \
    # Extra archive formats
    p7zip-full zstd \
    # Ruby (needed for fpm gem)
    ruby-full ruby-dev rubygems \
    # Flatpak build tools
    flatpak \
 && rm -rf /var/lib/apt/lists/*

# ── Flatpak runtime + SDK — needed to build .flatpak bundles offline ──────────
# --noninteractive skips all prompts; system-level install works in Docker root.
RUN flatpak remote-add --if-not-exists flathub \
    https://dl.flathub.org/repo/flathub.flatpakrepo \
 && flatpak install --noninteractive flathub \
    org.freedesktop.Platform//23.08 \
    org.freedesktop.Sdk//23.08 \
 || true

# ── Wine64 — runs rcedit to patch Windows PE version info + icons ─────────────
# We only need wine64 (no i386 required) since rcedit-x64.exe is a 64-bit PE.
# On Debian bullseye the package installs the binary as wine64-stable; create a
# canonical wine64 symlink so all scripts can use the same name.
RUN apt-get update && apt-get install -y --no-install-recommends \
    wine64 \
 && rm -rf /var/lib/apt/lists/* \
 && ([ -x /usr/bin/wine64 ] || ln -sf /usr/bin/wine64-stable /usr/bin/wine64)

# Download rcedit (electron project) — the standard tool for patching Win PE resources.
RUN curl -fsSL \
    "https://github.com/electron/rcedit/releases/latest/download/rcedit-x64.exe" \
    -o /opt/rcedit-x64.exe \
 && chmod 644 /opt/rcedit-x64.exe

# Pre-initialise the Wine64 prefix so the first rcedit call isn't slow.
# Use /opt/wine (not /root/.wine) so any uid passed via --user can access it.
ENV WINEARCH=win64 \
    WINEPREFIX=/opt/wine \
    WINEDEBUG=-all
RUN mkdir -p /opt/wine \
 && (DISPLAY= wine64 wineboot --init 2>/dev/null || true) \
 && chmod -R 777 /opt/wine

# ── AppImage tool — build AppImages for Linux ─────────────────────────────────
# APPIMAGE_EXTRACT_AND_RUN=1 lets it work inside Docker without FUSE.
RUN curl -fsSL \
    "https://github.com/AppImage/AppImageKit/releases/download/continuous/appimagetool-x86_64.AppImage" \
    -o /opt/appimagetool \
 && chmod +x /opt/appimagetool

ENV APPIMAGE_EXTRACT_AND_RUN=1

# ── makemsix — MSIX / Windows Store package builder (native Linux binary) ────
# bullseye ships cmake 3.18 but msix-packaging requires 3.29+; install from cmake.org.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ninja-build libssl-dev zlib1g-dev libicu-dev \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL https://github.com/Kitware/CMake/releases/download/v3.31.6/cmake-3.31.6-linux-x86_64.sh \
      -o /tmp/cmake.sh \
 && sh /tmp/cmake.sh --prefix=/usr/local --skip-license \
 && rm /tmp/cmake.sh \
 && git clone --depth=1 https://github.com/microsoft/msix-packaging /tmp/msix-packaging \
 && cd /tmp/msix-packaging \
 && cmake -DCMAKE_BUILD_TYPE=MinSizeRel -DMSIX_PACK=on -DUSE_VALIDATION_PARSER=on \
          -DMSIX_SAMPLES=off -DMSIX_TESTS=off -DLINUX=on -B .build -S . \
 && cmake --build .build --target makemsix -j"$(nproc)" \
 && cp .build/bin/makemsix /opt/makemsix && chmod +x /opt/makemsix \
 && find .build -name 'libmsix.so*' -exec cp -P {} /usr/local/lib/ \; \
 && ldconfig \
 && rm -rf /tmp/msix-packaging

# ── fpm — multi-format packager (deb, rpm, pacman, apk, freebsd, etc.) ────────
RUN gem install --no-document fpm || true

# ── Project setup ─────────────────────────────────────────────────────────────
WORKDIR /work
COPY . /work

RUN chmod +x /work/bin/renweb 2>/dev/null || true

RUN cd /work && npm install --no-audit --no-fund --production 2>/dev/null || true

# Default entrypoint — pass a subcommand such as `package`
ENTRYPOINT ["node", "/work/index.js"]
