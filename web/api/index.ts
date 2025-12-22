/* 
* -----------------------------------------------
* ---------------Helper Functions----------------
* -----------------------------------------------
*/ 

type Encoded = {
    __encoding_type__: string,
    __val__: any[]
}

function decodeObj(dec: any): any {
    for (const key in dec) {
        if (typeof dec[key] === "object" && "__encoding_type__" in dec[key] && "__val__" in dec[key]) {
            dec[key] = decode(dec[key] as Encoded);
        }
    }
    return dec;
}
function decodeArray(dec: any[]): any[] {
    for (let i = 0; i < dec.length; i++) {
        if (typeof dec[i] === "object" && "__encoding_type__" in dec[i] && "__val__" in dec[i]) {
            dec[i] = decode(dec[i] as Encoded);
        }
    }
    return dec;
}

function decode(dec: Encoded): any {
    switch (dec.__encoding_type__) {
        case "base64":
            return new TextDecoder().decode(new Uint8Array(dec.__val__));
        default:
            return null;
    }
}

function encodeObj(enc: any): any {
    for (const key in enc) {
        if (typeof enc[key] === "object") {
            enc[key] = encode(enc[key]);
        }
    }
    return enc;
}
function encodeArray(enc: any[]): any[] {
    for (let i = 0; i < enc.length; i++) {
        if (typeof enc[i] === "object") {
            enc[i] = encode(enc[i]);
        }
    }
    return enc;
}

function encode(enc: any, enc_type="base64"): Encoded {
    switch (enc_type) {
        case "base64":
            return {
                __encoding_type__: "base64",
                __val__: Array.from(new TextEncoder().encode(enc))
            };
        default:
            return {
                __encoding_type__: "none",
                __val__: []
            };
    }
}

function serialize(obj: any): string {
    return (typeof obj === "string") ? obj : JSON.stringify(obj);
}

/* 
* -----------------------------------------------
* ------------------Exports----------------------
* -----------------------------------------------
*/ 
export namespace Log {
    export async function trace(msg: any): Promise<void> 
        { await BIND_log_trace(encode(serialize(msg))); }
    export async function debug(msg: any): Promise<void> 
        { await BIND_log_debug(encode(serialize(msg))); }
    export async function info(msg: any): Promise<void> 
        { await BIND_log_info(encode(serialize(msg))); }
    export async function warn(msg: any): Promise<void> 
        { await BIND_log_warn(encode(serialize(msg))); }
    export async function error(msg: any): Promise<void> 
        { await BIND_log_error(encode(serialize(msg))); }
    export async function critical(msg: any): Promise<void> 
        { await BIND_log_critical(encode(serialize(msg))); }
}

export namespace FS {
    export type WriteSettings = {
        append: boolean
    }
    export type RmSettings = {
        recursive: boolean
    }
    export type RenameCopySettings = {
        overwrite: boolean
    }
    
    export async function readFile(path: string): Promise<string | null> 
        { return decode(await BIND_read_file(encode(path)) as Encoded); }
    export async function writeFile(path: string, contents: string, settings: WriteSettings = { append: false }): Promise<boolean> 
        { return await BIND_write_file(encode(path), encode(contents), settings); }
    export async function exists(path: string): Promise<boolean> 
        { return await BIND_exists(encode(path)); }
    export async function isDir(path: string): Promise<boolean> 
        { return await BIND_is_dir(encode(path)); }
    export async function mkDir(path: string): Promise<boolean> 
        { return await BIND_mk_dir(encode(path)); }
    export async function rm(path: string, settings: RmSettings = { recursive: false }): Promise<boolean> 
        { return await BIND_rm(encode(path), settings); }
    export async function ls(path: string): Promise<string[] | null> 
        { const result = await BIND_ls(encode(path)); return result ? result.map((path: Encoded) => decode(path)) : null; }
    export async function rename(orig_path: string, new_path: string, settings: RenameCopySettings = { overwrite: false }): Promise<boolean> 
        { return await BIND_rename(encode(orig_path), encode(new_path), settings); }
    export async function copy(orig_path: string, new_path: string, settings: RenameCopySettings = { overwrite: false }): Promise<boolean> 
        { return await BIND_copy(encode(orig_path), encode(new_path), settings); }
    export async function getApplicationDirPath(): Promise<string> 
        { return decode(await BIND_get_application_dir_path()); }
    export async function downloadUri(uri: string, path: string): Promise<void> 
        { await BIND_download_uri(encode(uri), encode(path)); }
}

export namespace Window {
    export async function isFocus(): Promise<boolean> 
        { return await BIND_is_focus(null); }
    export async function show(is_window_shown: boolean = true): Promise<void> 
        { await BIND_show(is_window_shown); }
    export async function changeTitle(title: string): Promise<void> 
        { await BIND_change_title(encode(title)); }
    export async function resetTitle(): Promise<void> 
        { await BIND_reset_title(null); }
    export async function currentTitle(): Promise<string> 
        { return decode(await BIND_current_title(null)); }
    export async function reloadPage(): Promise<void> 
        { await BIND_reload_page(null); }
    export async function closeWindow(): Promise<void> 
        { await BIND_close_window(null); }
    export async function terminate(): Promise<void> 
        { await BIND_terminate(null); }
    export async function startWindowDrag(): Promise<void> 
        { await BIND_start_window_drag(null); }
    export async function printPage(): Promise<void> 
        { await BIND_print_page(null); }
    export async function zoomIn(): Promise<void> 
        { await BIND_zoom_in(null); }
    export async function zoomOut(): Promise<void> 
        { await BIND_zoom_out(null); }
    export async function zoomReset(): Promise<void> 
        { await BIND_zoom_reset(null); }
    export async function getZoomLevel(): Promise<number> 
        { return await BIND_get_zoom_level(null); }
    export async function setZoomLevel(level: number): Promise<void> 
        { await BIND_set_zoom_level(level); }
    export async function findInPage(text: string): Promise<void> 
        { await BIND_find_in_page(encode(text)); }
    export async function findNext(): Promise<void> 
        { await BIND_find_next(null); }
    export async function findPrevious(): Promise<void> 
        { await BIND_find_previous(null); }
    export async function clearFind(): Promise<void> 
        { await BIND_clear_find(null); }
}

export namespace System {
    export async function getPID(): Promise<number> 
        { return await BIND_get_pid(null); }
    export async function getOS(): Promise<string> 
        { return decode(await BIND_get_OS(null) as Encoded); }
}

export namespace Config {
    export async function getConfig(): Promise<any> 
        {  return decodeObj(await BIND_get_config(null)); }
    export async function saveConfig(): Promise<void> 
        { await BIND_save_config(null); }
    export async function loadConfig(): Promise<void> 
        { await BIND_load_config(null); }
    export async function setConfigProperty(key: string, value: any): Promise<void> 
        { await BIND_set_config_property(encode(key), value); }
    export async function resetToDefaults(): Promise<void> 
        { await BIND_reset_to_defaults(null); }
}

export namespace Process {
    export async function start(process_type: string, key: string, args: string[]): Promise<number> 
        { return await BIND_process_start(encode(process_type), encode(key), args.map(arg => encode(arg))); }
    export async function kill(process_type: string, key: string): Promise<boolean> 
        { return await BIND_process_kill(encode(process_type), encode(key)); }
    export async function has(process_type: string, key: string): Promise<boolean> 
        { return await BIND_process_has(encode(process_type), encode(key)); }
    export async function hasPid(process_type: string, pid: number): Promise<boolean> 
        { return await BIND_process_has_pid(encode(process_type), pid); }
    export async function hasRunning(process_type: string, key: string): Promise<boolean> 
        { return await BIND_process_has_running(encode(process_type), encode(key)); }
    export async function wait(process_type: string, key: string): Promise<number> 
        { return await BIND_process_wait(encode(process_type), encode(key)); }
    export async function waitPid(process_type: string, pid: number): Promise<number> 
        { return await BIND_process_wait_pid(encode(process_type), pid); }
    export async function duplicate(): Promise<number> 
        { return await BIND_duplicate_process(null); }
    export async function pipeRead(key: string, byte_limit?: number): Promise<string | null> 
        { const result = await BIND_pipe_read(encode(key), byte_limit ?? null); return result ? decode(result as Encoded) : null; }
    export async function pipeReadPid(pid: number, byte_limit?: number): Promise<string | null> 
        { const result = await BIND_pipe_read_pid(pid, byte_limit ?? null); return result ? decode(result as Encoded) : null; }
    export async function openUri(uri: string): Promise<void> 
        { await BIND_open_uri(encode(uri)); }
    export async function openWindow(uri: string, is_single: boolean = false): Promise<void> 
        { await BIND_open_window(encode(uri), is_single); }
}

export namespace Signal {
    export async function add(signal_num: number, callback_name: string): Promise<void> 
        { await BIND_signal_add(signal_num, encode(callback_name)); }
    export async function remove(signal_num: number): Promise<void> 
        { await BIND_signal_remove(signal_num); }
    export async function has(signal_num: number): Promise<boolean> 
        { return await BIND_signal_has(signal_num); }
    export async function clear(): Promise<void> 
        { await BIND_signal_clear(null); }
    export async function count(): Promise<number> 
        { return await BIND_signal_count(null); }
    export async function trigger(signal_num: number): Promise<void> 
        { await BIND_signal_trigger(signal_num); }
}

export namespace Debug {
    export async function clearConsole(): Promise<void> 
        { await BIND_clear_console(null); }
    export async function openDevtools(): Promise<void> 
        { await BIND_open_devtools(null); }
    export async function closeDevtools(): Promise<void> 
        { await BIND_close_devtools(null); }
    export async function removeAllCss(): Promise<void> 
        { await BIND_remove_all_css(null); }
}

export namespace Network {
    export async function getLoadProgress(): Promise<number> 
        { return await BIND_get_load_progress(null); }
    export async function isLoading(): Promise<boolean> 
        { return await BIND_is_loading(null); }
}

export namespace Navigate {
    export async function back(): Promise<void> 
        { await BIND_navigate_back(null); }
    export async function forward(): Promise<void> 
        { await BIND_navigate_forward(null); }
    export async function stopLoading(): Promise<void> 
        { await BIND_stop_loading(null); }
    export async function canGoBack(): Promise<boolean> 
        { return await BIND_can_go_back(null); }
    export async function canGoForward(): Promise<boolean> 
        { return await BIND_can_go_forward(null); }
}

export namespace Properties {
    export async function getSize(): Promise<{ width: number, height: number }> 
        { return await BIND_get_size(null); }
    export async function setSize(width: number, height: number): Promise<void> 
        { await BIND_set_size({ width, height }); }
    
    export async function getPosition(): Promise<{ x: number, y: number }> 
        { return await BIND_get_position(null); }
    export async function setPosition(x: number, y: number): Promise<void> 
        { await BIND_set_position({ x, y }); }
    
    export async function getDecorated(): Promise<boolean> 
        { return await BIND_get_decorated(null); }
    export async function setDecorated(is_decorated: boolean): Promise<void> 
        { await BIND_set_decorated(is_decorated); }
    
    export async function getResizable(): Promise<boolean> 
        { return await BIND_get_resizable(null); }
    export async function setResizable(is_resizable: boolean): Promise<void> 
        { await BIND_set_resizable(is_resizable); }
    
    export async function getKeepAbove(): Promise<boolean> 
        { return await BIND_get_keepabove(null); }
    export async function setKeepAbove(is_keepabove: boolean): Promise<void> 
        { await BIND_set_keepabove(is_keepabove); }
    
    export async function getMinimize(): Promise<boolean> 
        { return await BIND_get_minimize(null); }
    export async function setMinimize(is_minimize: boolean): Promise<void> 
        { await BIND_set_minimize(is_minimize); }
    
    export async function getMaximize(): Promise<boolean> 
        { return await BIND_get_maximize(null); }
    export async function setMaximize(is_maximize: boolean): Promise<void> 
        { await BIND_set_maximize(is_maximize); }
    
    export async function getFullscreen(): Promise<boolean> 
        { return await BIND_get_fullscreen(null); }
    export async function setFullscreen(is_fullscreen: boolean): Promise<void> 
        { await BIND_set_fullscreen(is_fullscreen); }
    
    export async function getTaskbarShow(): Promise<boolean> 
        { return await BIND_get_taskbar_show(null); }
    export async function setTaskbarShow(is_taskbar_show: boolean): Promise<void> 
        { await BIND_set_taskbar_show(is_taskbar_show); }
    
    export async function getOpacity(): Promise<number> 
        { return await BIND_get_opacity(null); }
    export async function setOpacity(opacity: number): Promise<void> 
        { await BIND_set_opacity(opacity); }
}

/* 
* -----------------------------------------------
* ------------------Declares---------------------
* -----------------------------------------------
*/ 
declare const BIND_log_trace: (...args: any[]) => Promise<any>;
declare const BIND_log_debug: (...args: any[]) => Promise<any>;
declare const BIND_log_info: (...args: any[]) => Promise<any>;
declare const BIND_log_warn: (...args: any[]) => Promise<any>;
declare const BIND_log_error: (...args: any[]) => Promise<any>;
declare const BIND_log_critical: (...args: any[]) => Promise<any>;

declare const BIND_read_file: (...args: any[]) => Promise<any>;
declare const BIND_write_file: (...args: any[]) => Promise<any>;
declare const BIND_exists: (...args: any[]) => Promise<any>;
declare const BIND_is_dir: (...args: any[]) => Promise<any>;
declare const BIND_mk_dir: (...args: any[]) => Promise<any>;
declare const BIND_rm: (...args: any[]) => Promise<any>;
declare const BIND_ls: (...args: any[]) => Promise<any>;
declare const BIND_rename: (...args: any[]) => Promise<any>;
declare const BIND_copy: (...args: any[]) => Promise<any>;
declare const BIND_get_application_dir_path: (...args: any[]) => Promise<any>;
declare const BIND_download_uri: (...args: any[]) => Promise<any>;

declare const BIND_is_focus: (...args: any[]) => Promise<any>;
declare const BIND_show: (...args: any[]) => Promise<any>;
declare const BIND_change_title: (...args: any[]) => Promise<any>;
declare const BIND_reset_title: (...args: any[]) => Promise<any>;
declare const BIND_current_title: (...args: any[]) => Promise<any>;
declare const BIND_reload_page: (...args: any[]) => Promise<any>;
declare const BIND_close_window: (...args: any[]) => Promise<any>;
declare const BIND_terminate: (...args: any[]) => Promise<any>;
declare const BIND_start_window_drag: (...args: any[]) => Promise<any>;
declare const BIND_print_page: (...args: any[]) => Promise<any>;
declare const BIND_zoom_in: (...args: any[]) => Promise<any>;
declare const BIND_zoom_out: (...args: any[]) => Promise<any>;
declare const BIND_zoom_reset: (...args: any[]) => Promise<any>;
declare const BIND_get_zoom_level: (...args: any[]) => Promise<any>;
declare const BIND_set_zoom_level: (...args: any[]) => Promise<any>;
declare const BIND_find_in_page: (...args: any[]) => Promise<any>;
declare const BIND_find_next: (...args: any[]) => Promise<any>;
declare const BIND_find_previous: (...args: any[]) => Promise<any>;
declare const BIND_clear_find: (...args: any[]) => Promise<any>;

declare const BIND_get_pid: (...args: any[]) => Promise<any>;
declare const BIND_get_OS: (...args: any[]) => Promise<any>;

declare const BIND_get_config: (...args: any[]) => Promise<any>;
declare const BIND_save_config: (...args: any[]) => Promise<any>;
declare const BIND_load_config: (...args: any[]) => Promise<any>;
declare const BIND_set_config_property: (...args: any[]) => Promise<any>;
declare const BIND_reset_to_defaults: (...args: any[]) => Promise<any>;

declare const BIND_process_start: (...args: any[]) => Promise<any>;
declare const BIND_process_kill: (...args: any[]) => Promise<any>;
declare const BIND_process_has: (...args: any[]) => Promise<any>;
declare const BIND_process_has_pid: (...args: any[]) => Promise<any>;
declare const BIND_process_has_running: (...args: any[]) => Promise<any>;
declare const BIND_process_wait: (...args: any[]) => Promise<any>;
declare const BIND_process_wait_pid: (...args: any[]) => Promise<any>;
declare const BIND_duplicate_process: (...args: any[]) => Promise<any>;
declare const BIND_pipe_read: (...args: any[]) => Promise<any>;
declare const BIND_pipe_read_pid: (...args: any[]) => Promise<any>;
declare const BIND_open_uri: (...args: any[]) => Promise<any>;
declare const BIND_open_window: (...args: any[]) => Promise<any>;

declare const BIND_signal_add: (...args: any[]) => Promise<any>;
declare const BIND_signal_remove: (...args: any[]) => Promise<any>;
declare const BIND_signal_has: (...args: any[]) => Promise<any>;
declare const BIND_signal_clear: (...args: any[]) => Promise<any>;
declare const BIND_signal_count: (...args: any[]) => Promise<any>;
declare const BIND_signal_trigger: (...args: any[]) => Promise<any>;

declare const BIND_clear_console: (...args: any[]) => Promise<any>;
declare const BIND_open_devtools: (...args: any[]) => Promise<any>;
declare const BIND_close_devtools: (...args: any[]) => Promise<any>;
declare const BIND_remove_all_css: (...args: any[]) => Promise<any>;

declare const BIND_get_load_progress: (...args: any[]) => Promise<any>;
declare const BIND_is_loading: (...args: any[]) => Promise<any>;

declare const BIND_navigate_back: (...args: any[]) => Promise<any>;
declare const BIND_navigate_forward: (...args: any[]) => Promise<any>;
declare const BIND_stop_loading: (...args: any[]) => Promise<any>;
declare const BIND_can_go_back: (...args: any[]) => Promise<any>;
declare const BIND_can_go_forward: (...args: any[]) => Promise<any>;

declare const BIND_get_size: (...args: any[]) => Promise<any>;
declare const BIND_set_size: (...args: any[]) => Promise<any>;
declare const BIND_get_position: (...args: any[]) => Promise<any>;
declare const BIND_set_position: (...args: any[]) => Promise<any>;
declare const BIND_get_decorated: (...args: any[]) => Promise<any>;
declare const BIND_set_decorated: (...args: any[]) => Promise<any>;
declare const BIND_get_resizable: (...args: any[]) => Promise<any>;
declare const BIND_set_resizable: (...args: any[]) => Promise<any>;
declare const BIND_get_keepabove: (...args: any[]) => Promise<any>;
declare const BIND_set_keepabove: (...args: any[]) => Promise<any>;
declare const BIND_get_minimize: (...args: any[]) => Promise<any>;
declare const BIND_set_minimize: (...args: any[]) => Promise<any>;
declare const BIND_get_maximize: (...args: any[]) => Promise<any>;
declare const BIND_set_maximize: (...args: any[]) => Promise<any>;
declare const BIND_get_fullscreen: (...args: any[]) => Promise<any>;
declare const BIND_set_fullscreen: (...args: any[]) => Promise<any>;
declare const BIND_get_taskbar_show: (...args: any[]) => Promise<any>;
declare const BIND_set_taskbar_show: (...args: any[]) => Promise<any>;
declare const BIND_get_opacity: (...args: any[]) => Promise<any>;
declare const BIND_set_opacity: (...args: any[]) => Promise<any>;
