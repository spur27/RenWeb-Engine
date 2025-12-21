export declare namespace Log {
    function trace(msg: any): Promise<void>;
    function debug(msg: any): Promise<void>;
    function info(msg: any): Promise<void>;
    function warn(msg: any): Promise<void>;
    function error(msg: any): Promise<void>;
    function critical(msg: any): Promise<void>;
}
export declare namespace FS {
    type WriteSettings = {
        append: boolean;
    };
    type RmSettings = {
        recursive: boolean;
    };
    type RenameCopySettings = {
        overwrite: boolean;
    };
    function readFile(path: string): Promise<number[] | null>;
    function writeFile(path: string, contents: number[], settings?: WriteSettings): Promise<boolean>;
    function exists(path: string): Promise<boolean>;
    function isDir(path: string): Promise<boolean>;
    function mkDir(path: string): Promise<boolean>;
    function rm(path: string, settings?: RmSettings): Promise<boolean>;
    function ls(path: string): Promise<string[] | null>;
    function rename(orig_path: string, new_path: string, settings?: RenameCopySettings): Promise<boolean>;
    function copy(orig_path: string, new_path: string, settings?: RenameCopySettings): Promise<boolean>;
    function getApplicationDirPath(): Promise<string>;
    function downloadUri(uri: string, path: string): Promise<void>;
}
export declare namespace Window {
    function isFocus(): Promise<boolean>;
    function show(is_window_shown?: boolean): Promise<void>;
    function changeTitle(title: string): Promise<void>;
    function resetTitle(): Promise<void>;
    function reloadPage(): Promise<void>;
    function closeWindow(): Promise<void>;
    function terminate(): Promise<void>;
    function startWindowDrag(): Promise<void>;
    function printPage(): Promise<void>;
    function zoomIn(): Promise<void>;
    function zoomOut(): Promise<void>;
    function zoomReset(): Promise<void>;
    function getZoomLevel(): Promise<number>;
    function setZoomLevel(level: number): Promise<void>;
    function findInPage(text: string): Promise<void>;
    function findNext(): Promise<void>;
    function findPrevious(): Promise<void>;
    function clearFind(): Promise<void>;
}
export declare namespace System {
    function getPID(): Promise<number>;
    function getOS(): Promise<string>;
}
export declare namespace Config {
    function getConfig(): Promise<any>;
    function saveConfig(): Promise<void>;
    function loadConfig(): Promise<void>;
    function setConfigProperty(key: string, value: any): Promise<void>;
    function resetToDefaults(): Promise<void>;
}
export declare namespace Process {
    function start(process_type: string, key: string, args: string[]): Promise<number>;
    function kill(process_type: string, key: string): Promise<boolean>;
    function has(process_type: string, key: string): Promise<boolean>;
    function hasPid(process_type: string, pid: number): Promise<boolean>;
    function hasRunning(process_type: string, key: string): Promise<boolean>;
    function wait(process_type: string, key: string): Promise<number>;
    function waitPid(process_type: string, pid: number): Promise<number>;
    function duplicate(): Promise<number>;
    function pipeRead(key: string, byte_limit?: number): Promise<string | null>;
    function pipeReadPid(pid: number, byte_limit?: number): Promise<string | null>;
    function openUri(uri: string): Promise<void>;
    function openWindow(uri: string, is_single?: boolean): Promise<void>;
}
export declare namespace Signal {
    function add(signal_num: number, callback_name: string): Promise<void>;
    function remove(signal_num: number): Promise<void>;
    function has(signal_num: number): Promise<boolean>;
    function clear(): Promise<void>;
    function count(): Promise<number>;
    function trigger(signal_num: number): Promise<void>;
}
export declare namespace Debug {
    function clearConsole(): Promise<void>;
    function openDevtools(): Promise<void>;
    function closeDevtools(): Promise<void>;
    function removeAllCss(): Promise<void>;
}
export declare namespace Network {
    function getLoadProgress(): Promise<number>;
    function isLoading(): Promise<boolean>;
}
export declare namespace Navigate {
    function back(): Promise<void>;
    function forward(): Promise<void>;
    function stopLoading(): Promise<void>;
    function canGoBack(): Promise<boolean>;
    function canGoForward(): Promise<boolean>;
}
export declare namespace Properties {
    function getSize(): Promise<{
        width: number;
        height: number;
    }>;
    function setSize(width: number, height: number): Promise<void>;
    function getPosition(): Promise<{
        x: number;
        y: number;
    }>;
    function setPosition(x: number, y: number): Promise<void>;
    function getDecorated(): Promise<boolean>;
    function setDecorated(is_decorated: boolean): Promise<void>;
    function getResizable(): Promise<boolean>;
    function setResizable(is_resizable: boolean): Promise<void>;
    function getKeepAbove(): Promise<boolean>;
    function setKeepAbove(is_keepabove: boolean): Promise<void>;
    function getMinimize(): Promise<boolean>;
    function setMinimize(is_minimize: boolean): Promise<void>;
    function getMaximize(): Promise<boolean>;
    function setMaximize(is_maximize: boolean): Promise<void>;
    function getFullscreen(): Promise<boolean>;
    function setFullscreen(is_fullscreen: boolean): Promise<void>;
    function getTaskbarShow(): Promise<boolean>;
    function setTaskbarShow(is_taskbar_show: boolean): Promise<void>;
    function getOpacity(): Promise<number>;
    function setOpacity(opacity: number): Promise<void>;
}
