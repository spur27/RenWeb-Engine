// add webview stuff
import { rmSync, lstatSync, existsSync, mkdirSync, writeFileSync, copyFile, cpSync, mkdir, copyFileSync, chmodSync, readFileSync, writeFile } from 'fs';
import Path from 'path';
import os from 'os';
import { LogLevel, Logger } from '../lib/logger.ts';
import Chalk from 'chalk';
import { execSync, spawn, spawnSync } from 'child_process';
import { getInfo, Info } from '../lib/info.ts';

const logger = new Logger("Generate Resource", false, LogLevel.TRACE, Chalk.bold.magenta);

const throwCriticalError = (msg: any) => {
    logger.critical(msg);
    throw new Error(msg);
}

const project_root_dir = Path.join(import.meta.dirname, "../../");

const os_type: string = os.type();

if (os_type != "Windows_NT") {
    throwCriticalError("Only windows can generate resource files!!");
}

const info: Info = getInfo();
const rc_path = Path.join(project_root_dir, 'engine', `resource`);
const rc_file_path = Path.join(rc_path, `app.rc`);

if (!existsSync(rc_path)) {
    logger.warn(`${rc_path} wasn't found. Making...`);
    mkdirSync(rc_path);
}

const split_arr = info.version.split('.');
const formatted_version = 
`${split_arr[0] ?? '0'},${split_arr[1] ?? '0'},${split_arr[2] ?? '0'},${split_arr[3] ?? '0'}`;

writeFileSync(rc_file_path, 
`${(existsSync(Path.join(rc_path, 'app.ico')))
    ? 'IDI_ICON1 ICON "app.ico"'
    : ''
}
// Version info
1 VERSIONINFO
FILEVERSION     ${formatted_version}
PRODUCTVERSION  ${formatted_version}
FILEFLAGSMASK   0x3fL
FILEFLAGS       0x0L     
FILEOS          0x40004L
FILETYPE        0x1L    
FILESUBTYPE     0x0L
BEGIN
    BLOCK "StringFileInfo"
    BEGIN
        BLOCK "040904b0"  // Unicode
        BEGIN
            VALUE "CompanyName",      "${info.author}"
            VALUE "FileDescription",  "${info.description}"
            VALUE "FileVersion",      "${info.version}"
            VALUE "InternalName",     "${info.simple_title}.exe"
            VALUE "OriginalFilename", "${info.simple_title}.exe"
            VALUE "ProductName",      "${info.title}"
            VALUE "ProductVersion",   "${info.version}"
        END
    END
    BLOCK "VarFileInfo"
    BEGIN
        VALUE "Translation", 0x0409, 1200  // Unicode
    END
END
`
);
try {
    execSync("rc /fo ..\\engine\\src\\.build\\app.res ..\\engine\\resource\\app.rc", { stdio: 'inherit' });
} catch (e) {
    logger.error(e);
}
