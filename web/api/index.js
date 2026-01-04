// Compile:  tsc --target es2020 --module es2020 --declaration --sourceMap --strict --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --forceConsistentCasingInFileNames index.ts
/*
* -----------------------------------------------
* ---------------Helper Functions----------------
* -----------------------------------------------
*/
function decodeObj(dec) {
    for (const key in dec) {
        if (typeof dec[key] === "object" && "__encoding_type__" in dec[key] && "__val__" in dec[key]) {
            dec[key] = decode(dec[key]);
        }
    }
    return dec;
}
function decodeArray(dec) {
    for (let i = 0; i < dec.length; i++) {
        if (typeof dec[i] === "object" && "__encoding_type__" in dec[i] && "__val__" in dec[i]) {
            dec[i] = decode(dec[i]);
        }
    }
    return dec;
}
function decode(dec) {
    switch (dec.__encoding_type__) {
        case "base64":
            return new TextDecoder().decode(new Uint8Array(dec.__val__));
        default:
            return null;
    }
}
function encodeObj(enc) {
    for (const key in enc) {
        if (typeof enc[key] === "object") {
            enc[key] = encode(enc[key]);
        }
    }
    return enc;
}
function encodeArray(enc) {
    for (let i = 0; i < enc.length; i++) {
        if (typeof enc[i] === "object") {
            enc[i] = encode(enc[i]);
        }
    }
    return enc;
}
function encode(enc, enc_type = "base64") {
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
function serialize(obj) {
    return (typeof obj === "string") ? obj : JSON.stringify(obj);
}
/*
* -----------------------------------------------
* ------------------Exports----------------------
* -----------------------------------------------
*/
export var Log;
(function (Log) {
    async function trace(msg) { await BIND_log_trace(encode(serialize(msg))); }
    Log.trace = trace;
    async function debug(msg) { await BIND_log_debug(encode(serialize(msg))); }
    Log.debug = debug;
    async function info(msg) { await BIND_log_info(encode(serialize(msg))); }
    Log.info = info;
    async function warn(msg) { await BIND_log_warn(encode(serialize(msg))); }
    Log.warn = warn;
    async function error(msg) { await BIND_log_error(encode(serialize(msg))); }
    Log.error = error;
    async function critical(msg) { await BIND_log_critical(encode(serialize(msg))); }
    Log.critical = critical;
})(Log || (Log = {}));
export var FS;
(function (FS) {
    async function readFile(path) { return decode(await BIND_read_file(encode(path))); }
    FS.readFile = readFile;
    async function writeFile(path, contents, settings = { append: false }) { return await BIND_write_file(encode(path), encode(contents), settings); }
    FS.writeFile = writeFile;
    async function exists(path) { return await BIND_exists(encode(path)); }
    FS.exists = exists;
    async function isDir(path) { return await BIND_is_dir(encode(path)); }
    FS.isDir = isDir;
    async function mkDir(path) { return await BIND_mk_dir(encode(path)); }
    FS.mkDir = mkDir;
    async function rm(path, settings = { recursive: false }) { return await BIND_rm(encode(path), settings); }
    FS.rm = rm;
    async function ls(path) { const result = await BIND_ls(encode(path)); return result ? result.map((path) => decode(path)) : null; }
    FS.ls = ls;
    async function rename(orig_path, new_path, settings = { overwrite: false }) { return await BIND_rename(encode(orig_path), encode(new_path), settings); }
    FS.rename = rename;
    async function copy(orig_path, new_path, settings = { overwrite: false }) { return await BIND_copy(encode(orig_path), encode(new_path), settings); }
    FS.copy = copy;
    async function getApplicationDirPath() { return decode(await BIND_get_application_dir_path()); }
    FS.getApplicationDirPath = getApplicationDirPath;
    async function downloadUri(uri, path) { await BIND_download_uri(encode(uri), encode(path)); }
    FS.downloadUri = downloadUri;
})(FS || (FS = {}));
export var Window;
(function (Window) {
    async function isFocus() { return await BIND_is_focus(null); }
    Window.isFocus = isFocus;
    async function show(is_window_shown = true) { await BIND_show(is_window_shown); }
    Window.show = show;
    async function changeTitle(title) { await BIND_change_title(encode(title)); }
    Window.changeTitle = changeTitle;
    async function resetTitle() { await BIND_reset_title(null); }
    Window.resetTitle = resetTitle;
    async function currentTitle() { return decode(await BIND_current_title(null)); }
    Window.currentTitle = currentTitle;
    async function reloadPage() { await BIND_reload_page(null); }
    Window.reloadPage = reloadPage;
    async function navigatePage(uri) { await BIND_navigate_page(encode(uri)); }
    Window.navigatePage = navigatePage;
    async function terminate() { await BIND_terminate(null); }
    Window.terminate = terminate;
    async function startWindowDrag() { await BIND_start_window_drag(null); }
    Window.startWindowDrag = startWindowDrag;
    async function printPage() { await BIND_print_page(null); }
    Window.printPage = printPage;
    async function zoomIn() { await BIND_zoom_in(null); }
    Window.zoomIn = zoomIn;
    async function zoomOut() { await BIND_zoom_out(null); }
    Window.zoomOut = zoomOut;
    async function zoomReset() { await BIND_zoom_reset(null); }
    Window.zoomReset = zoomReset;
    async function getZoomLevel() { return await BIND_get_zoom_level(null); }
    Window.getZoomLevel = getZoomLevel;
    async function setZoomLevel(level) { await BIND_set_zoom_level(level); }
    Window.setZoomLevel = setZoomLevel;
    async function findInPage(text) { await BIND_find_in_page(encode(text)); }
    Window.findInPage = findInPage;
    async function findNext() { await BIND_find_next(null); }
    Window.findNext = findNext;
    async function findPrevious() { await BIND_find_previous(null); }
    Window.findPrevious = findPrevious;
    async function clearFind() { await BIND_clear_find(null); }
    Window.clearFind = clearFind;
})(Window || (Window = {}));
export var System;
(function (System) {
    async function getPID() { return await BIND_get_pid(null); }
    System.getPID = getPID;
    async function getOS() { return decode(await BIND_get_OS(null)); }
    System.getOS = getOS;
})(System || (System = {}));
export var Config;
(function (Config) {
    async function getConfig() { return decodeObj(await BIND_get_config(null)); }
    Config.getConfig = getConfig;
    async function saveConfig() { await BIND_save_config(null); }
    Config.saveConfig = saveConfig;
    async function loadConfig() { await BIND_load_config(null); }
    Config.loadConfig = loadConfig;
    async function setConfigProperty(key, value) { await BIND_set_config_property(encode(key), value); }
    Config.setConfigProperty = setConfigProperty;
    async function resetToDefaults() { await BIND_reset_to_defaults(null); }
    Config.resetToDefaults = resetToDefaults;
})(Config || (Config = {}));
export var Process;
(function (Process) {
    async function start(process_type, key, args) { return await BIND_process_start(encode(process_type), encode(key), args.map(arg => encode(arg))); }
    Process.start = start;
    async function kill(process_type, key) { return await BIND_process_kill(encode(process_type), encode(key)); }
    Process.kill = kill;
    async function has(process_type, key) { return await BIND_process_has(encode(process_type), encode(key)); }
    Process.has = has;
    async function hasPid(process_type, pid) { return await BIND_process_has_pid(encode(process_type), pid); }
    Process.hasPid = hasPid;
    async function hasRunning(process_type, key) { return await BIND_process_has_running(encode(process_type), encode(key)); }
    Process.hasRunning = hasRunning;
    async function wait(process_type, key) { return await BIND_process_wait(encode(process_type), encode(key)); }
    Process.wait = wait;
    async function waitPid(process_type, pid) { return await BIND_process_wait_pid(encode(process_type), pid); }
    Process.waitPid = waitPid;
    async function duplicate() { return await BIND_duplicate_process(null); }
    Process.duplicate = duplicate;
    async function pipeRead(key, byte_limit) { const result = await BIND_pipe_read(encode(key), byte_limit ?? null); return result ? decode(result) : null; }
    Process.pipeRead = pipeRead;
    async function pipeReadPid(pid, byte_limit) { const result = await BIND_pipe_read_pid(pid, byte_limit ?? null); return result ? decode(result) : null; }
    Process.pipeReadPid = pipeReadPid;
    async function openUri(uri) { await BIND_open_uri(encode(uri)); }
    Process.openUri = openUri;
    async function openWindow(uri, is_single = false) { await BIND_open_window(encode(uri), is_single); }
    Process.openWindow = openWindow;
})(Process || (Process = {}));
export var Signal;
(function (Signal) {
    async function add(signal_num, callback_name) { await BIND_signal_add(signal_num, encode(callback_name)); }
    Signal.add = add;
    async function remove(signal_num) { await BIND_signal_remove(signal_num); }
    Signal.remove = remove;
    async function has(signal_num) { return await BIND_signal_has(signal_num); }
    Signal.has = has;
    async function clear() { await BIND_signal_clear(null); }
    Signal.clear = clear;
    async function count() { return await BIND_signal_count(null); }
    Signal.count = count;
    async function trigger(signal_num) { await BIND_signal_trigger(signal_num); }
    Signal.trigger = trigger;
})(Signal || (Signal = {}));
export var Debug;
(function (Debug) {
    async function clearConsole() { await BIND_clear_console(null); }
    Debug.clearConsole = clearConsole;
    async function openDevtools() { await BIND_open_devtools(null); }
    Debug.openDevtools = openDevtools;
    async function closeDevtools() { await BIND_close_devtools(null); }
    Debug.closeDevtools = closeDevtools;
})(Debug || (Debug = {}));
export var Network;
(function (Network) {
    async function getLoadProgress() { return await BIND_get_load_progress(null); }
    Network.getLoadProgress = getLoadProgress;
    async function isLoading() { return await BIND_is_loading(null); }
    Network.isLoading = isLoading;
})(Network || (Network = {}));
export var Navigate;
(function (Navigate) {
    async function back() { await BIND_navigate_back(null); }
    Navigate.back = back;
    async function forward() { await BIND_navigate_forward(null); }
    Navigate.forward = forward;
    async function stopLoading() { await BIND_stop_loading(null); }
    Navigate.stopLoading = stopLoading;
    async function canGoBack() { return await BIND_can_go_back(null); }
    Navigate.canGoBack = canGoBack;
    async function canGoForward() { return await BIND_can_go_forward(null); }
    Navigate.canGoForward = canGoForward;
})(Navigate || (Navigate = {}));
export var Properties;
(function (Properties) {
    async function getSize() { return await BIND_get_size(null); }
    Properties.getSize = getSize;
    async function setSize(width, height) { await BIND_set_size({ width, height }); }
    Properties.setSize = setSize;
    async function getPosition() { return await BIND_get_position(null); }
    Properties.getPosition = getPosition;
    async function setPosition(x, y) { await BIND_set_position({ x, y }); }
    Properties.setPosition = setPosition;
    async function getDecorated() { return await BIND_get_decorated(null); }
    Properties.getDecorated = getDecorated;
    async function setDecorated(is_decorated) { await BIND_set_decorated(is_decorated); }
    Properties.setDecorated = setDecorated;
    async function getResizable() { return await BIND_get_resizable(null); }
    Properties.getResizable = getResizable;
    async function setResizable(is_resizable) { await BIND_set_resizable(is_resizable); }
    Properties.setResizable = setResizable;
    async function getKeepAbove() { return await BIND_get_keepabove(null); }
    Properties.getKeepAbove = getKeepAbove;
    async function setKeepAbove(is_keepabove) { await BIND_set_keepabove(is_keepabove); }
    Properties.setKeepAbove = setKeepAbove;
    async function getMinimize() { return await BIND_get_minimize(null); }
    Properties.getMinimize = getMinimize;
    async function setMinimize(is_minimize) { await BIND_set_minimize(is_minimize); }
    Properties.setMinimize = setMinimize;
    async function getMaximize() { return await BIND_get_maximize(null); }
    Properties.getMaximize = getMaximize;
    async function setMaximize(is_maximize) { await BIND_set_maximize(is_maximize); }
    Properties.setMaximize = setMaximize;
    async function getFullscreen() { return await BIND_get_fullscreen(null); }
    Properties.getFullscreen = getFullscreen;
    async function setFullscreen(is_fullscreen) { await BIND_set_fullscreen(is_fullscreen); }
    Properties.setFullscreen = setFullscreen;
    async function getTaskbarShow() { return await BIND_get_taskbar_show(null); }
    Properties.getTaskbarShow = getTaskbarShow;
    async function setTaskbarShow(is_taskbar_show) { await BIND_set_taskbar_show(is_taskbar_show); }
    Properties.setTaskbarShow = setTaskbarShow;
    async function getOpacity() { return await BIND_get_opacity(null); }
    Properties.getOpacity = getOpacity;
    async function setOpacity(opacity) { await BIND_set_opacity(opacity); }
    Properties.setOpacity = setOpacity;
})(Properties || (Properties = {}));
//# sourceMappingURL=index.js.map