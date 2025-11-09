// add webview stuff
import { rmSync, lstatSync, existsSync, mkdirSync, writeFileSync, copyFile, cpSync, mkdir, copyFileSync, readFileSync, renameSync, createWriteStream } from 'fs';
import Path from 'path';
import os from 'os';
import { LogLevel, Logger } from '../lib/logger.ts';
import Chalk from 'chalk';
import { execSync, spawn } from 'child_process';
import { getInfo, getLinuxPMType, Info } from '../lib/info.ts';
import archiver from 'archiver';

const logger = new Logger("Installer", false, LogLevel.TRACE, Chalk.bold.magenta);

const throwCriticalError = (msg: any) => {
    logger.critical(msg);
    throw new Error(msg);
}



const project_root_dir = Path.join(import.meta.dirname, "../../");
const installer_dir = Path.join(project_root_dir, 'installers');
if (!existsSync(installer_dir)) {
    logger.warn(`Installer dir not found at "${installer_dir}". Making one...`);
    mkdirSync(installer_dir);
}

logger.info("Starting install creator...");
logger.trace(`Args are ${JSON.stringify(process.argv, null, 2)}`);
logger.debug(`Project root dir is \n\t'${project_root_dir}'`);
logger.debug(`Install dir is \n\t'${installer_dir}'`);

const skip = process.argv.includes("skip");

const os_type: string = os.type();
const os_machine: string = os.machine();

logger.info(`OS is of type ${Chalk.bold(os_type)} of machine ${Chalk.bold(os_machine)}`);

const info: Info = getInfo();

const deb = () => {
    const linux_installer_dir = Path.join(installer_dir, "linux");
    const icon_path = Path.join(project_root_dir, "engine", "resource", `app.ico`);
    const debian_path = Path.join(linux_installer_dir, "debian");
    const debian_package_path = Path.join(debian_path,  info.simple_title);
    const debian_lib_path = Path.join(debian_package_path, "usr", "local", "lib", info.simple_title);
    const debian_app_path = Path.join(debian_package_path, "usr", "share", "applications");
    const debian_dir_path = Path.join(debian_package_path, "DEBIAN");
    const debian_icon_path = Path.join(debian_package_path, "usr", "share", "icons", `${info.simple_title}.ico`);
    const debian_bin_path = Path.join(debian_package_path, "usr", "local", "bin");
    if (existsSync(linux_installer_dir)) {
        logger.warn(`Linux installer dir already exist at '${linux_installer_dir}'. Clearing...`);
        rmSync(linux_installer_dir, { recursive: true });
    }
    mkdirSync(linux_installer_dir);
  // DEBIAN
    logger.info("Creating debian package...");
    if (existsSync(debian_path)) {
        logger.warn(`path '${debian_path}' already exists. Removing...`);
        rmSync(debian_path, { recursive: true });
    }
    // see if you can change this to install locally rather than for all users (would make more sense)where
    // idk if this is even being installed in the right place
    mkdirSync(debian_lib_path, { recursive: true });
    mkdirSync(debian_dir_path);
    writeFileSync(Path.join(debian_dir_path, "control"), 
        `Package: ${info.simple_title}\nVersion: ${info.version}\nArchitecture: all\nMaintainer: ${info.author}\nDescription: ${info.description}\n`
    );
    mkdirSync(debian_app_path, { recursive: true });
    writeFileSync(Path.join(debian_app_path, `${info.simple_title}.desktop`), 
`[Desktop Entry]
Encoding=UTF-8
Version=${info.version}
Comment=${info.description}
Type=Application
Terminal=false
Exec=/usr/local/lib/${info.simple_title}/${info.simple_title}
Name=${info.title}
Icon=/usr/local/lib/${info.simple_title}/resource/app.ico`
    )
    mkdirSync(debian_bin_path, { recursive: true });
    writeFileSync(Path.join(debian_bin_path, info.simple_title), `exec ${Path.join("/", "usr", "local", "lib", info.simple_title, info.simple_title).toString()} "$@"`);
    execSync(`chmod +x ${Path.join(debian_bin_path, info.simple_title).toString()}`);
    // chmodSync(Path.join(debian_path, "renweb", "usr", "local", "bin", "renweb"), 755);
    cpSync(Path.join(project_root_dir, "build"), debian_lib_path, { recursive: true });
    try {
        execSync(`dpkg-deb --build ${debian_package_path} ${Path.join(linux_installer_dir, `${info.simple_title}-${info.version}.${os_machine}.deb`)}`, { stdio: 'inherit' });
    } catch (e) {
        logger.critical(e);
    }
    rmSync(debian_path, { recursive: true });
    let output = createWriteStream(Path.join(linux_installer_dir, `${info.simple_title}-${info.version}.${os_machine}.zip`));
    let archive = archiver('zip');
    output.on('close', () => {
        logger.info(`Saved ${archive.pointer()} bytes to ./linux/${info.simple_title}-${info.version}.${os_machine}.zip`);
    });
    archive.on('error', (err: Error) => {throw err});
    archive.pipe(output);
    archive.directory(Path.join(project_root_dir, 'build'), false);
    archive.finalize();
}

const rpm = () => {
    const linux_installer_dir = Path.join(installer_dir, "linux");
    const icon_path = Path.join(project_root_dir, "engine", "resource", `app.ico`);
    const rpm_path = Path.join(linux_installer_dir, "rpmbuild");
    const rpm_build = Path.join(rpm_path, "BUILD");
    const rpm_rpms = Path.join(rpm_path, "RPMS");
    const rpm_sources = Path.join(rpm_path, "SOURCES");
    const rpm_specs = Path.join(rpm_path, "SPECS");
    const rpm_srpms = Path.join(rpm_path, "SRPMS");

    if (existsSync(linux_installer_dir)) {
        logger.warn(`Linux installer dir already exist at '${linux_installer_dir}'. Clearing...`);
        rmSync(linux_installer_dir, { recursive: true });
    }
    mkdirSync(linux_installer_dir);

    // RPM
    logger.info("Creating rpm package...");
    if (existsSync(rpm_path)) {
        logger.warn(`path '${rpm_path}' already exists. Removing...`);
        rmSync(rpm_path, { recursive: true });
    }
    mkdirSync(rpm_path);
    mkdirSync(rpm_build);
    mkdirSync(rpm_rpms);
    mkdirSync(Path.join(rpm_rpms, 'x86_64'));
    mkdirSync(rpm_sources);
    mkdirSync(rpm_specs);
    mkdirSync(rpm_srpms);

    // copy icon to SOURCES
    cpSync(icon_path, Path.join(rpm_sources, `${info.simple_title}.ico`));

    try {
        execSync(
        `tar czf ${Path.join(rpm_sources, `${info.simple_title}-${info.version}.tar.gz`)} --transform "s,^,${info.simple_title}-${info.version}/," -C ${project_root_dir} build`,
        { stdio: 'inherit' }
        );
    } catch (e) {
        logger.critical(`Failed to create source tarball: ${e}`);
        return;
    }

    writeFileSync(Path.join(rpm_specs, `${info.simple_title}.spec`),
`Name:          ${info.simple_title}
Version:        ${info.version}
Release:        1%{?dist}
Summary:        ${info.description}
License:        ${info.license}
# URL:          
Source0:        ${info.simple_title}-${info.version}.tar.gz
BuildArch:      ${os_machine}
Requires:       /bin/sh

%global debug_package %{nil}

%description
${info.description}

%prep
%setup -q

%build
# nothing to build

%preun
# Remove per-user copy for the user who installed the package
if [ "$SUDO_USER" != "root" ] && [ -n "$SUDO_USER" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    if [ -n "$USER_HOME" ]; then
        rm -rf "$USER_HOME/.local/share/${info.simple_title}"
        rm -f  "$USER_HOME/.local/share/applications/${info.simple_title}.desktop"
        rm -f  "$USER_HOME/.local/share/icons/${info.simple_title}.ico"
        rm -f  "%{buildroot}/usr/share/applications/${info.simple_title}.desktop"
    fi
fi

%install
# system-wide reference copy
mkdir -p %{buildroot}/usr/share/${info.simple_title}
cp -r build/* %{buildroot}/usr/share/${info.simple_title}/

# launcher in PATH
mkdir -p %{buildroot}/usr/bin
cat > %{buildroot}/usr/bin/${info.simple_title} <<'EOF'
#!/usr/bin/env bash
# Ensure local copy exists
if [ ! -d "$HOME/.local/share/${info.simple_title}" ]; then
    mkdir -p "$HOME/.local/share"
    cp -r /usr/share/${info.simple_title} "$HOME/.local/share/"
fi
exec "$HOME/.local/share/${info.simple_title}/${info.simple_title}" "$@"
EOF
chmod +x %{buildroot}/usr/bin/${info.simple_title}

%post
if [ "$SUDO_USER" != "root" ] && [ -n "$SUDO_USER" ]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
    if [ -n "$USER_HOME" ]; then
        mkdir -p "$USER_HOME/.local/share/${info.simple_title}"
        cp -rn /usr/share/${info.simple_title}/* "$USER_HOME/.local/share/${info.simple_title}/"
        chown -R "$SUDO_USER":"$SUDO_USER" "$USER_HOME/.local/share/${info.simple_title}"
        mkdir -p %{buildroot}/usr/share/applications
        cat > %{buildroot}/usr/share/applications/${info.simple_title}.desktop <<EOF
        [Desktop Entry]
        Encoding=UTF-8
        Version=${info.version}
        Comment=${info.description}
        Type=Application
        Terminal=false
        Exec=/usr/bin/${info.simple_title}
        Name=${info.title}
        Icon=$USER_HOME/.local/share/${info.simple_title}/resource/app.ico
        EOF
    fi
fi

%files
/usr/bin/${info.simple_title}
/usr/share/${info.simple_title}

%changelog
`);

    try {
        execSync(`rpmbuild --define "_topdir ${rpm_path}" -bb ${Path.join(rpm_specs, `${info.simple_title}.spec`)}`, { stdio: 'inherit' });
    } catch (e) {
        logger.critical(e);
    }
    cpSync(Path.join(rpm_rpms, os_machine), linux_installer_dir, { recursive: true });
    rmSync(rpm_path, {recursive: true});

    let output = createWriteStream(Path.join(linux_installer_dir, `${info.simple_title}-${info.version}.${os_machine}.zip`));
    let archive = archiver('zip');
    output.on('close', () => {
        logger.info(`Saved ${archive.pointer()} bytes to ./linux/${info.simple_title}-${info.version}.${os_machine}.zip`);
    });
    archive.on('error', (err: Error) => {throw err});
    archive.pipe(output);
    archive.directory(Path.join(project_root_dir, 'build'), false);
    archive.finalize();
};

const windows = () => {
    const windows_installer_dir = Path.join(installer_dir, "windows");
    const nsis_dir = Path.join(windows_installer_dir, "nsis");
    if (existsSync(windows_installer_dir)) {
        logger.warn(`Windows installer dir already exist at '${windows_installer_dir}'. Clearing...`);
        rmSync(windows_installer_dir, { recursive: true });
    }
    mkdirSync(windows_installer_dir);
    mkdirSync(nsis_dir);
    logger.info(`Writing setup wizard to '${Path.join(nsis_dir, 'setup_wizard.nsi')}`);
writeFileSync(Path.join(nsis_dir, 'setup_wizard.nsi'),
`
;--------------------------------
; ${info.title} NSIS Setup Wizard
;--------------------------------

${(existsSync(Path.join(project_root_dir, 'engine', 'resource', 'app.ico')))
    ?
`
!define MUI_ICON "../../../engine/resource/app.ico"       ; Installer icon
!define MUI_UNICON "../../../engine/resource/app.ico"     ; Uninstaller icon
`
    : ""}

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

Var MAIN_EXE 
Var CREATE_DESKTOP_SHORTCUT

Name "${info.title}"
OutFile "${info.simple_title}-installer.exe"
InstallDir "$LOCALAPPDATA\\${info.title}"
RequestExecutionLevel user
!insertmacro MUI_PAGE_WELCOME
${(existsSync(Path.join(project_root_dir, 'engine', 'resource', 'LICENSE.txt')))
    ? `"!insertmacro MUI_PAGE_LICENSE "../../../engine/resource/LICENSE.txt"` : ""
}
!insertmacro MUI_PAGE_DIRECTORY
Page custom DesktopShortcutPage DesktopShortcutPageLeave
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\\${info.simple_title}.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Run ${info.title}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Function DesktopShortcutPage
  nsDialogs::Create 1018
  Pop $0
  \${If} $0 == error
    Abort
  \${EndIf}
  !insertmacro MUI_HEADER_TEXT "Shortcut Options" "Choose which shortcuts to create"
  \${NSD_CreateCheckBox} 0u 0u 100% 12u "Create a desktop shortcut"
  Pop $CREATE_DESKTOP_SHORTCUT
  \${NSD_SetState} $CREATE_DESKTOP_SHORTCUT \${BST_CHECKED}
  nsDialogs::Show
FunctionEnd
Function DesktopShortcutPageLeave
    \${NSD_GetState} $CREATE_DESKTOP_SHORTCUT $CREATE_DESKTOP_SHORTCUT
FunctionEnd

; ----------------------------
Section "Install"
  StrCpy $MAIN_EXE "${info.simple_title}.exe"

  SetOutPath "$INSTDIR"

  File /r "../../../build\\*.*"

  CreateDirectory "$SMPROGRAMS\\${info.title}"
  \${If} $CREATE_DESKTOP_SHORTCUT == \${BST_CHECKED}
    CreateShortCut "$DESKTOP\\${info.title}.lnk" "$INSTDIR\\$MAIN_EXE" "" "" "" SW_SHOWNORMAL "" "${info.simple_author}.${info.simple_title}"
  \${EndIf}

  CreateShortCut "$SMPROGRAMS\\${info.title}\\${info.title}.lnk" "$INSTDIR\\$MAIN_EXE" "" "" "" SW_SHOWNORMAL "" "${info.simple_author}.${info.simple_title}"

  WriteUninstaller "$INSTDIR\\uninstall.exe"

  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.simple_title}" "DisplayName" "${info.title}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.simple_title}" "DisplayVersion" "${info.version}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.simple_title}" "Publisher" "${info.author}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.simple_title}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.simple_title}" "UninstallString" "$INSTDIR\\uninstall.exe"

SectionEnd
; ----------------------------
Section "Uninstall"

  ; Remove all installed files and folders
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\\${info.title}.lnk"
  Delete "$SMPROGRAMS\\${info.title}\\${info.title}.lnk"
  RMDir "$SMPROGRAMS\\${info.title}"

  ; Remove registry uninstall info
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${info.simple_title}"

SectionEnd
; ----------------------------

!define MUI_ABORTWARNING
`
);
    execSync("makensis ../installers/windows/nsis/setup_wizard.nsi", { stdio: 'inherit' });
    renameSync(Path.join(nsis_dir, `${info.simple_title}-installer.exe`), Path.join(windows_installer_dir, `${info.simple_title}-installer.exe`));
    rmSync(nsis_dir, { recursive: true });
    let output = createWriteStream(Path.join(windows_installer_dir, `${info.simple_title}-${info.version}.${os_machine}.zip`));
    let archive = archiver('zip');
    output.on('close', () => {
        logger.info(`Saved ${archive.pointer()} bytes to ./linux/${info.simple_title}-${info.version}.${os_machine}.zip`);
    });
    archive.on('error', (err: Error) => {throw err});
    archive.pipe(output);
    archive.directory(Path.join(project_root_dir, 'build'), false);
    archive.finalize();
}

try {
    switch (os_type) {
        case "Linux":
            if (!skip) {
                execSync("cd ../ && npm run script:build && npm run make clean && npm run make TARGET=release", { stdio: 'inherit' });
            }
            switch (getLinuxPMType()) {
                case "deb":
                    deb();
                    break;
                case "rpm":
                    rpm();
                    break;
                default:
                    throwCriticalError("You're using a version of linux with an unsupported package manager! RenWeb currently only supports debian and rpm.");
            }
            break;
        case "Darwin":
            break;
        case "Windows_NT":
            if (!skip) {
                execSync("cd ..\\ && npm run script:build && npm run make clean && npm run make TARGET=release", { stdio: 'inherit' });
            }
            windows();
            break;
        default:
            throw new Error(`unknown OS type: ${os_type}`);
            break;
    }
} catch (e) {
    logger.critical(e);
}

