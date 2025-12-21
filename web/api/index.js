/*
* -----------------------------------------------
* ------------------Exports----------------------
* -----------------------------------------------
*/
export var Log;
(function (Log) {
    async function trace(msg) { await BIND_log_trace(JSON.stringify(msg)); }
    Log.trace = trace;
    async function debug(msg) { await BIND_log_debug(JSON.stringify(msg)); }
    Log.debug = debug;
    async function info(msg) { await BIND_log_info(JSON.stringify(msg)); }
    Log.info = info;
    async function warn(msg) { await BIND_log_warn(JSON.stringify(msg)); }
    Log.warn = warn;
    async function error(msg) { await BIND_log_error(JSON.stringify(msg)); }
    Log.error = error;
    async function critical(msg) { await BIND_log_critical(JSON.stringify(msg)); }
    Log.critical = critical;
})(Log || (Log = {}));
export var FS;
(function (FS) {
    async function readFile(path) { return JSON.parse(await BIND_read_file(JSON.stringify(path))); }
    FS.readFile = readFile;
    async function writeFile(path, contents, settings = { append: false }) { return JSON.parse(await BIND_write_file(JSON.stringify([path, contents, settings]))); }
    FS.writeFile = writeFile;
    async function exists(path) { return JSON.parse(await BIND_exists(JSON.stringify(path))); }
    FS.exists = exists;
    async function isDir(path) { return JSON.parse(await BIND_is_dir(JSON.stringify(path))); }
    FS.isDir = isDir;
    async function mkDir(path) { return JSON.parse(await BIND_mk_dir(JSON.stringify(path))); }
    FS.mkDir = mkDir;
    async function rm(path, settings = { recursive: false }) { return JSON.parse(await BIND_rm(JSON.stringify([path, settings]))); }
    FS.rm = rm;
    async function ls(path) { return JSON.parse(await BIND_ls(JSON.stringify(path))); }
    FS.ls = ls;
    async function rename(orig_path, new_path, settings = { overwrite: false }) { return JSON.parse(await BIND_rename(JSON.stringify([orig_path, new_path, settings]))); }
    FS.rename = rename;
    async function copy(orig_path, new_path, settings = { overwrite: false }) { return JSON.parse(await BIND_copy(JSON.stringify([orig_path, new_path, settings]))); }
    FS.copy = copy;
    async function getApplicationDirPath() { return JSON.parse(await BIND_get_application_dir_path(JSON.stringify(null))); }
    FS.getApplicationDirPath = getApplicationDirPath;
    async function downloadUri(uri, path) { await BIND_download_uri(JSON.stringify([uri, path])); }
    FS.downloadUri = downloadUri;
})(FS || (FS = {}));
export var Window;
(function (Window) {
    async function isFocus() { return JSON.parse(await BIND_is_focus(JSON.stringify(null))); }
    Window.isFocus = isFocus;
    async function show(is_window_shown = true) { await BIND_show(JSON.stringify(is_window_shown)); }
    Window.show = show;
    async function changeTitle(title) { await BIND_change_title(JSON.stringify(title)); }
    Window.changeTitle = changeTitle;
    async function resetTitle() { await BIND_reset_title(JSON.stringify(null)); }
    Window.resetTitle = resetTitle;
    async function reloadPage() { await BIND_reload_page(JSON.stringify(null)); }
    Window.reloadPage = reloadPage;
    async function closeWindow() { await BIND_close_window(JSON.stringify(null)); }
    Window.closeWindow = closeWindow;
    async function terminate() { await BIND_terminate(JSON.stringify(null)); }
    Window.terminate = terminate;
    async function startWindowDrag() { await BIND_start_window_drag(JSON.stringify(null)); }
    Window.startWindowDrag = startWindowDrag;
    async function printPage() { await BIND_print_page(JSON.stringify(null)); }
    Window.printPage = printPage;
    async function zoomIn() { await BIND_zoom_in(JSON.stringify(null)); }
    Window.zoomIn = zoomIn;
    async function zoomOut() { await BIND_zoom_out(JSON.stringify(null)); }
    Window.zoomOut = zoomOut;
    async function zoomReset() { await BIND_zoom_reset(JSON.stringify(null)); }
    Window.zoomReset = zoomReset;
    async function getZoomLevel() { return JSON.parse(await BIND_get_zoom_level(JSON.stringify(null))); }
    Window.getZoomLevel = getZoomLevel;
    async function setZoomLevel(level) { await BIND_set_zoom_level(JSON.stringify(level)); }
    Window.setZoomLevel = setZoomLevel;
    async function findInPage(text) { await BIND_find_in_page(JSON.stringify(text)); }
    Window.findInPage = findInPage;
    async function findNext() { await BIND_find_next(JSON.stringify(null)); }
    Window.findNext = findNext;
    async function findPrevious() { await BIND_find_previous(JSON.stringify(null)); }
    Window.findPrevious = findPrevious;
    async function clearFind() { await BIND_clear_find(JSON.stringify(null)); }
    Window.clearFind = clearFind;
})(Window || (Window = {}));
export var System;
(function (System) {
    async function getPID() { return JSON.parse(await BIND_get_pid(JSON.stringify(null))); }
    System.getPID = getPID;
    async function getOS() { return JSON.parse(await BIND_get_OS(JSON.stringify(null))); }
    System.getOS = getOS;
})(System || (System = {}));
export var Config;
(function (Config) {
    async function getConfig() { return JSON.parse(await BIND_get_config(JSON.stringify(null))); }
    Config.getConfig = getConfig;
    async function saveConfig() { await BIND_save_config(JSON.stringify(null)); }
    Config.saveConfig = saveConfig;
    async function loadConfig() { await BIND_load_config(JSON.stringify(null)); }
    Config.loadConfig = loadConfig;
    async function setConfigProperty(key, value) { await BIND_set_config_property(JSON.stringify([key, value])); }
    Config.setConfigProperty = setConfigProperty;
    async function resetToDefaults() { await BIND_reset_to_defaults(JSON.stringify(null)); }
    Config.resetToDefaults = resetToDefaults;
})(Config || (Config = {}));
export var Process;
(function (Process) {
    async function start(process_type, key, args) { return JSON.parse(await BIND_process_start(JSON.stringify([process_type, key, args]))); }
    Process.start = start;
    async function kill(process_type, key) { return JSON.parse(await BIND_process_kill(JSON.stringify([process_type, key]))); }
    Process.kill = kill;
    async function has(process_type, key) { return JSON.parse(await BIND_process_has(JSON.stringify([process_type, key]))); }
    Process.has = has;
    async function hasPid(process_type, pid) { return JSON.parse(await BIND_process_has_pid(JSON.stringify([process_type, pid]))); }
    Process.hasPid = hasPid;
    async function hasRunning(process_type, key) { return JSON.parse(await BIND_process_has_running(JSON.stringify([process_type, key]))); }
    Process.hasRunning = hasRunning;
    async function wait(process_type, key) { return JSON.parse(await BIND_process_wait(JSON.stringify([process_type, key]))); }
    Process.wait = wait;
    async function waitPid(process_type, pid) { return JSON.parse(await BIND_process_wait_pid(JSON.stringify([process_type, pid]))); }
    Process.waitPid = waitPid;
    async function duplicate() { return JSON.parse(await BIND_duplicate_process(JSON.stringify(null))); }
    Process.duplicate = duplicate;
    async function pipeRead(key, byte_limit) { return JSON.parse(await BIND_pipe_read(JSON.stringify([key, byte_limit]))); }
    Process.pipeRead = pipeRead;
    async function pipeReadPid(pid, byte_limit) { return JSON.parse(await BIND_pipe_read_pid(JSON.stringify([pid, byte_limit]))); }
    Process.pipeReadPid = pipeReadPid;
    async function openUri(uri) { await BIND_open_uri(JSON.stringify(uri)); }
    Process.openUri = openUri;
    async function openWindow(uri, is_single = false) { await BIND_open_window(JSON.stringify([uri, is_single])); }
    Process.openWindow = openWindow;
})(Process || (Process = {}));
export var Signal;
(function (Signal) {
    async function add(signal_num, callback_name) { await BIND_signal_add(JSON.stringify([signal_num, callback_name])); }
    Signal.add = add;
    async function remove(signal_num) { await BIND_signal_remove(JSON.stringify(signal_num)); }
    Signal.remove = remove;
    async function has(signal_num) { return JSON.parse(await BIND_signal_has(JSON.stringify(signal_num))); }
    Signal.has = has;
    async function clear() { await BIND_signal_clear(JSON.stringify(null)); }
    Signal.clear = clear;
    async function count() { return JSON.parse(await BIND_signal_count(JSON.stringify(null))); }
    Signal.count = count;
    async function trigger(signal_num) { await BIND_signal_trigger(JSON.stringify(signal_num)); }
    Signal.trigger = trigger;
})(Signal || (Signal = {}));
export var Debug;
(function (Debug) {
    async function clearConsole() { await BIND_clear_console(JSON.stringify(null)); }
    Debug.clearConsole = clearConsole;
    async function openDevtools() { await BIND_open_devtools(JSON.stringify(null)); }
    Debug.openDevtools = openDevtools;
    async function closeDevtools() { await BIND_close_devtools(JSON.stringify(null)); }
    Debug.closeDevtools = closeDevtools;
    async function removeAllCss() { await BIND_remove_all_css(JSON.stringify(null)); }
    Debug.removeAllCss = removeAllCss;
})(Debug || (Debug = {}));
export var Network;
(function (Network) {
    async function getLoadProgress() { return JSON.parse(await BIND_get_load_progress(JSON.stringify(null))); }
    Network.getLoadProgress = getLoadProgress;
    async function isLoading() { return JSON.parse(await BIND_is_loading(JSON.stringify(null))); }
    Network.isLoading = isLoading;
})(Network || (Network = {}));
export var Navigate;
(function (Navigate) {
    async function back() { await BIND_navigate_back(JSON.stringify(null)); }
    Navigate.back = back;
    async function forward() { await BIND_navigate_forward(JSON.stringify(null)); }
    Navigate.forward = forward;
    async function stopLoading() { await BIND_stop_loading(JSON.stringify(null)); }
    Navigate.stopLoading = stopLoading;
    async function canGoBack() { return JSON.parse(await BIND_can_go_back(JSON.stringify(null))); }
    Navigate.canGoBack = canGoBack;
    async function canGoForward() { return JSON.parse(await BIND_can_go_forward(JSON.stringify(null))); }
    Navigate.canGoForward = canGoForward;
})(Navigate || (Navigate = {}));
export var Properties;
(function (Properties) {
    async function getSize() { return JSON.parse(await BIND_get_size(JSON.stringify(null))); }
    Properties.getSize = getSize;
    async function setSize(width, height) { await BIND_set_size(JSON.stringify([width, height])); }
    Properties.setSize = setSize;
    async function getPosition() { return JSON.parse(await BIND_get_position(JSON.stringify(null))); }
    Properties.getPosition = getPosition;
    async function setPosition(x, y) { await BIND_set_position(JSON.stringify([x, y])); }
    Properties.setPosition = setPosition;
    async function getDecorated() { return JSON.parse(await BIND_get_decorated(JSON.stringify(null))); }
    Properties.getDecorated = getDecorated;
    async function setDecorated(is_decorated) { await BIND_set_decorated(JSON.stringify(is_decorated)); }
    Properties.setDecorated = setDecorated;
    async function getResizable() { return JSON.parse(await BIND_get_resizable(JSON.stringify(null))); }
    Properties.getResizable = getResizable;
    async function setResizable(is_resizable) { await BIND_set_resizable(JSON.stringify(is_resizable)); }
    Properties.setResizable = setResizable;
    async function getKeepAbove() { return JSON.parse(await BIND_get_keepabove(JSON.stringify(null))); }
    Properties.getKeepAbove = getKeepAbove;
    async function setKeepAbove(is_keepabove) { await BIND_set_keepabove(JSON.stringify(is_keepabove)); }
    Properties.setKeepAbove = setKeepAbove;
    async function getMinimize() { return JSON.parse(await BIND_get_minimize(JSON.stringify(null))); }
    Properties.getMinimize = getMinimize;
    async function setMinimize(is_minimize) { await BIND_set_minimize(JSON.stringify(is_minimize)); }
    Properties.setMinimize = setMinimize;
    async function getMaximize() { return JSON.parse(await BIND_get_maximize(JSON.stringify(null))); }
    Properties.getMaximize = getMaximize;
    async function setMaximize(is_maximize) { await BIND_set_maximize(JSON.stringify(is_maximize)); }
    Properties.setMaximize = setMaximize;
    async function getFullscreen() { return JSON.parse(await BIND_get_fullscreen(JSON.stringify(null))); }
    Properties.getFullscreen = getFullscreen;
    async function setFullscreen(is_fullscreen) { await BIND_set_fullscreen(JSON.stringify(is_fullscreen)); }
    Properties.setFullscreen = setFullscreen;
    async function getTaskbarShow() { return JSON.parse(await BIND_get_taskbar_show(JSON.stringify(null))); }
    Properties.getTaskbarShow = getTaskbarShow;
    async function setTaskbarShow(is_taskbar_show) { await BIND_set_taskbar_show(JSON.stringify(is_taskbar_show)); }
    Properties.setTaskbarShow = setTaskbarShow;
    async function getOpacity() { return JSON.parse(await BIND_get_opacity(JSON.stringify(null))); }
    Properties.getOpacity = getOpacity;
    async function setOpacity(opacity) { await BIND_set_opacity(JSON.stringify(opacity)); }
    Properties.setOpacity = setOpacity;
})(Properties || (Properties = {}));
//# sourceMappingURL=index.js.map