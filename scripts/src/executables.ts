// add webview stuff
import Path from 'path';
import { LogLevel, Logger } from '../lib/logger.ts';
import Chalk from 'chalk';
import os from 'os';
import { existsSync, mkdirSync, rmdirSync } from 'fs';
import { ChildProcessWithoutNullStreams, exec, execSync, spawn } from 'child_process';
import { getInfo } from '../lib/info.ts';

const logger = new Logger("Builder", false, LogLevel.TRACE, Chalk.bold.magenta);

const throwCriticalError = (msg: any) => {
    logger.critical(msg);
    throw new Error(msg);
}

const project_root_dir = Path.join(import.meta.dirname, "../../");
const build_dir = Path.join(project_root_dir, 'build', 'content');
const executable_dir = Path.join(project_root_dir, 'executables');

// Cross-compilation toolchain prefixes from makefile - split by platform
const TOOLCHAINS: Record<string, Record<string, string>> = {
    "Linux": {
        "x64": "x86_64-linux-gnu-",                              // x86_64 (Linux, native 64-bit)
        // "arm64": "aarch64-linux-gnu-",                           // ARM 64-bit (Linux)
        // "ia32": "i686-linux-gnu-",                               // x86 32-bit (Linux)
        // "armv7l": "arm-linux-gnueabihf-",                        // ARM 32-bit (Linux)
        // "mips": "mipsel-linux-gnu-",                             // MIPS 32-bit (Linux)
        // "mips64": "mips64el-linux-gnu-",                         // MIPS 64-bit (Linux)
        // "riscv64": "riscv64-linux-gnu-",                         // RISC-V 64-bit (Linux)
        // "ppc": "powerpc-linux-gnu-"                              // PowerPC (Linux)
    },
    "Windows_NT": {
        "x64": "/arch:x64",                                      // Windows 64-bit (cl.exe)
        "ia32": "/arch:x86",                                     // Windows 32-bit (cl.exe)
        "arm64": "/arch:arm64"                                   // Windows ARM64 (cl.exe)
    },
    "Darwin": {
        "x64": "x86_64-apple-darwin-",                           // 64-bit x86 macOS
        "arm64": "",                                             // Native Apple Silicon (M1/M2)
        "ia32": "i386-apple-darwin-"                             // 32-bit x86 macOS (legacy)
    }
};

const WINDOWS_TOOLCHAINS: Record<string, string> = {
    "x64": "/arch:x64",                                      // Windows 64-bit (cl.exe)
    "ia32": "/arch:x86",                                     // Windows 32-bit (cl.exe)
    "arm64": "/arch:arm64"                                   // Windows ARM64 (cl.exe)
};

const MACOS_TOOLCHAINS: Record<string, string> = {
    "x64": "x86_64-apple-darwin-",                           // 64-bit x86 macOS
    "arm64": "",                                             // Native Apple Silicon (M1/M2)
    "ia32": "i386-apple-darwin-"                             // 32-bit x86 macOS (legacy)
};

logger.info("Starting builder...");
logger.trace(`Args are ${JSON.stringify(process.argv, null, 2)}`);
logger.debug(`Project root dir is \n\t'${project_root_dir}'`);
logger.debug(`Build dir is \n\t'${build_dir}'`);

const os_type: string = os.type();
const child_processes: ChildProcessWithoutNullStreams[] = [];
const info = getInfo();

(async () => {
    if (existsSync(executable_dir)) {
        rmdirSync(executable_dir, { recursive: true });
    }
    mkdirSync(executable_dir);
    logger.info(`Attempting to build ${TOOLCHAINS[os_type]} executables for ${os_type}...`);
    for (const [arch, prefix] of Object.entries(TOOLCHAINS[os_type])) {
        execSync(`cd ../engine && make clean && make TARGET=release CROSS_COMPILE=${prefix} BUILD_PATH=${executable_dir} EXE=${info.simple_title}-${info.version}-${arch}`, { stdio: 'inherit' });
    }
})();

