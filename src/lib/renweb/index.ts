const DEFAULT_INDENT = 2;
/* 
* -----------------------------------------------
* ------------------Exports----------------------
* -----------------------------------------------
*/ 
export function sync(fn: (...args: []) => Promise<{}>, ...args: []): {} { return (async (args: []) => { return await fn(...args); })(args); }
export namespace Log {
    // ---------------------------------------------  
    export async function trace(msg: {}): Promise<void> 
        { await BIND_log_trace(Util.toUint8array(msg)); }
    export async function debug(msg: {}): Promise<void> 
        { await BIND_log_debug(Util.toUint8array(msg)); }
    export async function info(msg: {}): Promise<void> 
        { await BIND_log_info(Util.toUint8array(msg)); }
    export async function warn(msg: {}): Promise<void> 
        { await BIND_log_warn(Util.toUint8array(msg)); }
    export async function error(msg: {}): Promise<void> 
        { await BIND_log_error(Util.toUint8array(msg)); }
    export async function critical(msg: {}): Promise<void> 
        { await BIND_log_critical(Util.toUint8array(msg)); }
};
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
    // ---------------------------------------------  
    export async function readFile(path: string): Promise<(Uint8Array | null)> 
        { const arr = await BIND_read_file(Util.toUint8array(path)); if (arr == null) return null; else return new Uint8Array(arr as  number[]); }
    export async function writeFile(path: string, contents: {}, settings: FS.WriteSettings={append:false}): Promise<boolean> 
        { return await BIND_write_file(Util.toUint8array(path), Util.toUint8array(contents, 0), settings) as boolean; }
    export async function exists(path: string): Promise<boolean> 
        { return await BIND_exists(Util.toUint8array(path)) as boolean; }
    export async function isDir(path: string): Promise<boolean> 
        { return await BIND_is_dir(Util.toUint8array(path)) as boolean; }
    export async function mkDir(path: string): Promise<boolean> 
        { return await BIND_mk_dir(Util.toUint8array(path)) as boolean; }
    export async function rm(path: string, settings: FS.RmSettings={recursive:false}): Promise<boolean> 
        { return await BIND_rm(Util.toUint8array(path), settings) as boolean; }
    export async function ls(path: string): Promise<(string[] | null)> 
        { const files = (await BIND_ls(Util.toUint8array(path))) as number[][]; if (files == null) return null; else { const uint8arr_files: Uint8Array[] = []; files.forEach((el) => uint8arr_files.push(new Uint8Array(el))); return Util.fromArrayUint8array(uint8arr_files); } }
    export async function rename(orig_path: string, new_path: string, settings: FS.RenameCopySettings={overwrite:false}): Promise<boolean> 
        { return await BIND_rename(Util.toUint8array(orig_path), Util.toUint8array(new_path), settings) as boolean; }
    export async function copy(orig_path: string, new_path: string, settings: FS.RenameCopySettings={overwrite:false}): Promise<boolean> 
        { return await BIND_copy(Util.toUint8array(orig_path), Util.toUint8array(new_path), settings) as boolean; }
    export async function chooseFiles(multi?: boolean, dirs?: boolean, filtration?: string[], initial_dir?: string): Promise<(string[] | null)> 
        { const files = await BIND_choose_files(multi, dirs, (filtration == null) ? null : Util.arrayToUint8array(filtration), (initial_dir == null) ? null : Util.toUint8array(initial_dir)); if (files == null) 
            return null; else { const conv_files: Uint8Array[] = []; (files as []).forEach(el => conv_files.push(new Uint8Array(el))); return Util.fromArrayUint8array(conv_files); } }
    export async function getApplicationDirPath(): Promise<string> 
        { return Util.fromUint8array(new Uint8Array(await BIND_get_application_dir_path() as number[])) ?? "" as string; }
};
export namespace Misc {
    // ---------------------------------------------  
    export async function isFocus(): Promise<boolean> 
        { return await BIND_is_focus() as boolean; }
};
export namespace Page {
    // ---------------------------------------------  
    export async function show(is_window_shown = true): Promise<void> 
        { await BIND_show(is_window_shown); }
    export async function changeTitle(title: string): Promise<void> 
        { await BIND_change_title(Util.toUint8array(title)); }
    export async function resetTitle(): Promise<void> 
        { await BIND_reset_title(); }
    export async function reloadPage(): Promise<void> 
        { await BIND_reload_page(); }
    export async function navigatePage(uri: string): Promise<void> 
        { await BIND_navigate_page(Util.toUint8array(uri)); }
    export async function terminate(): Promise<void> 
        { await BIND_terminate(); }
    export async function openWindow(uri: string, is_single=false): Promise<void> 
        { await BIND_open_window(Util.toUint8array(uri), is_single); }
    export async function openURI(uri: string): Promise<void> 
        { await BIND_open_URI(Util.toUint8array(uri)); }
};
export namespace System {
    // ---------------------------------------------  
    export async function getPID(): Promise<number> 
        { return await BIND_get_PID() as number; }
    export async function getOS(): Promise<string> 
        { return await BIND_get_OS() as string; }
    export async function sendNotif(title: string, message?: string, icon_path?: string): Promise<void> 
        { await BIND_send_notif(Util.toUint8array(title), (message == null) ? Util.toUint8array("") : Util.toUint8array(message), (icon_path == null) ? null : Util.toUint8array(icon_path)); }
}
export namespace Settings {
    // ---------------------------------------------  
    export async function getConfig(): Promise<{}> 
        { return await BIND_get_config() as {}; }
    export async function saveConfig(): Promise<void> 
        { await BIND_save_config(); }
    export async function setConfigProperty(key: string, value: {}): Promise<void> 
        { await BIND_set_config_property(Util.toUint8array(key), value); }
    export async function resetSettingsToDefaults(): Promise<void> 
        { await BIND_reset_settings_to_defaults(); }
}
export namespace General {
    // ---------------------------------------------  
    export async function getSize(): Promise<{width: number, height: number}> 
        { return await BIND_get_size() as {width: number, height: number}; }
    export async function setSize(width: number, height: number): Promise<void> 
        { await BIND_set_size({ "width": width, "height": height }); }

    export async function getPosition(): Promise<{x: number, y: number}> 
        { return await BIND_get_position() as {x: number, y: number}; }
    export async function setPosition(x: number, y: number): Promise<void> 
        { await BIND_set_position({ "x": x, "y": y }); }

    export async function getDecorated(): Promise<boolean> 
        { return await BIND_get_decorated() as boolean; }
    export async function setDecorated(is_decorated: boolean): Promise<void> 
        { await BIND_set_decorated(is_decorated); }

    export async function getResizable(): Promise<boolean> 
        { return await BIND_get_resizable() as boolean; }
    export async function setResizable(is_resizable: boolean): Promise<void> 
        { await BIND_set_resizable(is_resizable); }

    export async function getKeepAbove(): Promise<boolean> 
        { return await BIND_get_keepabove() as boolean; }
    export async function setKeepAbove(is_keepabove: boolean): Promise<void> 
        { await BIND_set_keepabove(is_keepabove); }

    export async function getMinimize(): Promise<boolean> 
        { return await BIND_get_minimize() as boolean; }
    export async function setMinimize(is_minimze: boolean): Promise<void> 
        { await BIND_set_minimize(is_minimze); }

    export async function getMaximize(): Promise<boolean> 
        { return await BIND_get_maximize() as boolean; }
    export async function setMaximize(is_maximize: boolean): Promise<void> 
        { await BIND_set_maximize(is_maximize); }

    export async function getFullscreen(): Promise<boolean> 
        { return await BIND_get_fullscreen() as boolean; }
    export async function setFullscreen(is_fullscreen: boolean): Promise<void> 
        { await BIND_set_fullscreen(is_fullscreen); }
    
    export async function getTaskbarShow(): Promise<boolean> 
        { return await BIND_get_taskbar_show() as boolean; }
    export async function setTaskbarShow(is_taskbar_show: boolean): Promise<void> 
        { await BIND_set_taskbar_show(is_taskbar_show); }

    export async function getOpacity(): Promise<number> 
        { return await BIND_get_opacity() as number; }
    export async function setOpacity(opacity: number): Promise<void> 
        { await BIND_set_opacity(opacity); }
}

export namespace Util {
    // -------------------NON BINDINGS--------------------------        
    export function isNullish(variable: {}): boolean 
        { return (variable == null || variable == undefined); }
    export function isString(variable: {}): boolean 
        { return (typeof variable == 'string'); }
    export function arrayToUint8array(variable: {}[], indent=2): Uint8Array[] 
        { const encoded_arr: Uint8Array[] = []; variable.forEach((el) => encoded_arr.push(Util.toUint8array(el, indent))); return encoded_arr}
    export function toUint8array(variable: {}, indent=2): Uint8Array 
        { return ((new TextEncoder()).encode((isString(variable)) ? variable as string : JSON.stringify(variable, null, indent))); }
    export function fromArrayUint8array(uint8arrays: Uint8Array[]): (string[] | null) 
        { try { const decoded_arr: string[] = []; uint8arrays.forEach((el) => { const result = Util.fromUint8array(el); if (result != null) decoded_arr.push(result); }); return decoded_arr; } catch (e) { Log.error((e as Error).message); return null } }
    export function fromUint8array(uint8array: Uint8Array): (string | null) 
        { try { return ((new TextDecoder()).decode(uint8array)) } catch (e) { Log.error((e as Error).message); return null; } }
};

/* 
* -----------------------------------------------
* ------------------Declares---------------------
* -----------------------------------------------
*/ 
declare const BIND_log_trace:    (...args: any[]) => Promise<{}>;
declare const BIND_log_debug:    (...args: any[]) => Promise<{}>;
declare const BIND_log_info:     (...args: any[]) => Promise<{}>;
declare const BIND_log_warn:     (...args: any[]) => Promise<{}>;
declare const BIND_log_error:    (...args: any[]) => Promise<{}>;
declare const BIND_log_critical: (...args: any[]) => Promise<{}>;

declare const BIND_read_file:    (...args: any[]) => Promise<{}>;
declare const BIND_write_file:   (...args: any[]) => Promise<{}>;
declare const BIND_exists:       (...args: any[]) => Promise<{}>;
declare const BIND_is_dir:       (...args: any[]) => Promise<{}>;
declare const BIND_mk_dir:       (...args: any[]) => Promise<{}>;
declare const BIND_rm:           (...args: any[]) => Promise<{}>;
declare const BIND_ls:           (...args: any[]) => Promise<{}>;
declare const BIND_rename:       (...args: any[]) => Promise<{}>;
declare const BIND_copy:         (...args: any[]) => Promise<{}>;
declare const BIND_choose_files: (...args: any[]) => Promise<{}>;
declare const BIND_get_application_dir_path: (...args: any[]) => Promise<{}>;

declare const BIND_is_focus: (...args: any[]) => Promise<{}>;

declare const BIND_show:          (...args: any[]) => Promise<{}>;
declare const BIND_change_title:  (...args: any[]) => Promise<{}>;
declare const BIND_reset_title:   (...args: any[]) => Promise<{}>;
declare const BIND_reload_page:   (...args: any[]) => Promise<{}>;
declare const BIND_navigate_page: (...args: any[]) => Promise<{}>;
declare const BIND_terminate:     (...args: any[]) => Promise<{}>;
declare const BIND_open_window:   (...args: any[]) => Promise<{}>;
declare const BIND_open_URI:      (...args: any[]) => Promise<{}>;

declare const BIND_get_PID:                  (...args: any[]) => Promise<{}>;
declare const BIND_get_OS:                   (...args: any[]) => Promise<{}>;
declare const BIND_send_notif:               (...args: any[]) => Promise<{}>;

declare const BIND_get_config:                 (...args: any[]) => Promise<{}>;
declare const BIND_save_config:                (...args: any[]) => Promise<{}>;
declare const BIND_set_config_property:        (...args: any[]) => Promise<{}>;
declare const BIND_reset_settings_to_defaults: (...args: any[]) => Promise<{}>;


declare const BIND_get_size: (...args: any[]) => Promise<{}>;
declare const BIND_set_size: (...args: any[]) => Promise<{}>;

declare const BIND_get_position: (...args: any[]) => Promise<{}>;
declare const BIND_set_position: (...args: any[]) => Promise<{}>;

declare const BIND_get_decorated: (...args: any[]) => Promise<{}>;
declare const BIND_set_decorated: (...args: any[]) => Promise<{}>;

declare const BIND_get_resizable: (...args: any[]) => Promise<{}>;
declare const BIND_set_resizable: (...args: any[]) => Promise<{}>;

declare const BIND_get_keepabove: (...args: any[]) => Promise<{}>;
declare const BIND_set_keepabove: (...args: any[]) => Promise<{}>;

declare const BIND_get_minimize: (...args: any[]) => Promise<{}>;
declare const BIND_set_minimize: (...args: any[]) => Promise<{}>;

declare const BIND_get_maximize: (...args: any[]) => Promise<{}>;
declare const BIND_set_maximize: (...args: any[]) => Promise<{}>;

declare const BIND_get_fullscreen: (...args: any[]) => Promise<{}>;
declare const BIND_set_fullscreen: (...args: any[]) => Promise<{}>;

declare const BIND_get_taskbar_show: (...args: any[]) => Promise<{}>;
declare const BIND_set_taskbar_show: (...args: any[]) => Promise<{}>;

declare const BIND_get_opacity: (...args: any[]) => Promise<{}>;
declare const BIND_set_opacity: (...args: any[]) => Promise<{}>;
