// ===========================================
// API Data - Single Source of Truth
// ===========================================
// This file contains all API function data for search and documentation.
// 
// STRUCTURE:
// {
//   'CategoryName': [
//     {
//       name: 'functionName',
//       signature: 'functionName(param1, param2 = default)',
//       description: 'Brief description of what it returns'
//     }
//   ]
// }
//
// WORKFLOW - When adding/modifying API functions:
// 1. Update methodDetails in script.js (~line 1210) - Used for API tree visualization
// 2. Update this file (api_data.js) - Used for global search functionality
//
// CONSISTENCY:
// - methodDetails (script.js) has detailed param types and return types
// - apiData (this file) has simplified signatures for search display
// - Both must be kept in sync when APIs change
//
// IMPROVEMENT NOTE:
// In the future, we could auto-generate this file from methodDetails using the
// buildApiDataFromMethodDetails() function in script.js to ensure perfect sync.

window.apiData = {
    'Properties': [
        {name: 'getSize', signature: 'getSize()', description: 'Returns: Promise<{width: number, height: number}>'},
        {name: 'setSize', signature: 'setSize(width, height)', description: 'Returns: Promise<void>'},
        {name: 'getPosition', signature: 'getPosition()', description: 'Returns: Promise<{x: number, y: number}>'},
        {name: 'setPosition', signature: 'setPosition(x, y)', description: 'Returns: Promise<void>'},
        {name: 'getTitleBar', signature: 'getTitleBar()', description: 'Returns: Promise<boolean>'},
        {name: 'setTitleBar', signature: 'setTitleBar(has_title_bar)', description: 'Returns: Promise<void>'},
        {name: 'getResizable', signature: 'getResizable()', description: 'Returns: Promise<boolean>'},
        {name: 'setResizable', signature: 'setResizable(is_resizable)', description: 'Returns: Promise<void>'},
        {name: 'getKeepAbove', signature: 'getKeepAbove()', description: 'Returns: Promise<boolean>'},
        {name: 'setKeepAbove', signature: 'setKeepAbove(is_keepabove)', description: 'Returns: Promise<void>'},
        {name: 'getMinimize', signature: 'getMinimize()', description: 'Returns: Promise<boolean>'},
        {name: 'setMinimize', signature: 'setMinimize(is_minimize)', description: 'Returns: Promise<void>'},
        {name: 'getMaximize', signature: 'getMaximize()', description: 'Returns: Promise<boolean>'},
        {name: 'setMaximize', signature: 'setMaximize(is_maximize)', description: 'Returns: Promise<void>'},
        {name: 'getFullscreen', signature: 'getFullscreen()', description: 'Returns: Promise<boolean>'},
        {name: 'setFullscreen', signature: 'setFullscreen(is_fullscreen)', description: 'Returns: Promise<void>'},
        {name: 'getTaskbarShow', signature: 'getTaskbarShow()', description: 'Returns: Promise<boolean>'},
        {name: 'setTaskbarShow', signature: 'setTaskbarShow(is_taskbar_show)', description: 'Returns: Promise<void>'},
        {name: 'getOpacity', signature: 'getOpacity()', description: 'Returns: Promise<number>'},
        {name: 'setOpacity', signature: 'setOpacity(opacity)', description: 'Returns: Promise<void>'}
    ],
    'Window': [
        {name: 'isFocus', signature: 'isFocus()', description: 'Returns: Promise<boolean>'},
        {name: 'show', signature: 'show(is_window_shown?)', description: 'Returns: Promise<void>'},
        {name: 'changeTitle', signature: 'changeTitle(title)', description: 'Returns: Promise<string>'},
        {name: 'resetTitle', signature: 'resetTitle()', description: 'Returns: Promise<string>'},
        {name: 'currentTitle', signature: 'currentTitle()', description: 'Returns: Promise<string>'},
        {name: 'resetPage', signature: 'resetPage()', description: 'Returns: Promise<void>'},
        {name: 'currentPage', signature: 'currentPage()', description: 'Returns: Promise<string>'},
        {name: 'initialPage', signature: 'initialPage()', description: 'Returns: Promise<string>'},
        {name: 'reloadPage', signature: 'reloadPage()', description: 'Returns: Promise<void>'},
        {name: 'navigatePage', signature: 'navigatePage(uri)', description: 'Returns: Promise<void>'},
        {name: 'terminate', signature: 'terminate()', description: 'Returns: Promise<void>'},
        {name: 'startWindowDrag', signature: 'startWindowDrag()', description: 'Returns: Promise<void>'},
        {name: 'printPage', signature: 'printPage()', description: 'Returns: Promise<void>'},
        {name: 'zoomIn', signature: 'zoomIn()', description: 'Returns: Promise<void>'},
        {name: 'zoomOut', signature: 'zoomOut()', description: 'Returns: Promise<void>'},
        {name: 'zoomReset', signature: 'zoomReset()', description: 'Returns: Promise<void>'},
        {name: 'getZoomLevel', signature: 'getZoomLevel()', description: 'Returns: Promise<number>'},
        {name: 'setZoomLevel', signature: 'setZoomLevel(level)', description: 'Returns: Promise<void>'},
        {name: 'findInPage', signature: 'findInPage(text)', description: 'Returns: Promise<void>'},
        {name: 'findNext', signature: 'findNext()', description: 'Returns: Promise<void>'},
        {name: 'findPrevious', signature: 'findPrevious()', description: 'Returns: Promise<void>'},
        {name: 'clearFind', signature: 'clearFind()', description: 'Returns: Promise<void>'}
    ],
    'Log': [
        {name: 'trace', signature: 'trace(msg)', description: 'Returns: Promise<void>'},
        {name: 'debug', signature: 'debug(msg)', description: 'Returns: Promise<void>'},
        {name: 'info', signature: 'info(msg)', description: 'Returns: Promise<void>'},
        {name: 'warn', signature: 'warn(msg)', description: 'Returns: Promise<void>'},
        {name: 'error', signature: 'error(msg)', description: 'Returns: Promise<void>'},
        {name: 'critical', signature: 'critical(msg)', description: 'Returns: Promise<void>'}
    ],
    'FS': [
        {name: 'readFile', signature: 'readFile(path)', description: 'Returns: Promise<string | null>'},
        {name: 'writeFile', signature: 'writeFile(path, contents, settings = { append: false })', description: 'Returns: Promise<boolean>'},
        {name: 'exists', signature: 'exists(path)', description: 'Returns: Promise<boolean>'},
        {name: 'isDir', signature: 'isDir(path)', description: 'Returns: Promise<boolean>'},
        {name: 'mkDir', signature: 'mkDir(path)', description: 'Returns: Promise<boolean>'},
        {name: 'rm', signature: 'rm(path, settings = { recursive: false })', description: 'Returns: Promise<boolean>'},
        {name: 'ls', signature: 'ls(path)', description: 'Returns: Promise<string[] | null>'},
        {name: 'rename', signature: 'rename(orig_path, new_path, settings = { overwrite: false })', description: 'Returns: Promise<boolean>'},
        {name: 'copy', signature: 'copy(orig_path, new_path, settings = { overwrite: false })', description: 'Returns: Promise<boolean>'},
        {name: 'getApplicationDirPath', signature: 'getApplicationDirPath()', description: 'Returns: Promise<string>'},
        {name: 'getTmpDirPath', signature: 'getTmpDirPath(options = { create: false })', description: 'Returns: Promise<string>'},
        {name: 'downloadUri', signature: 'downloadUri(uri, path)', description: 'Returns: Promise<void>'}
    ],
    'Config': [
        {name: 'getConfig', signature: 'getConfig()', description: 'Returns: Promise<any>'},
        {name: 'getDefaults', signature: 'getDefaults()', description: 'Returns: Promise<any>'},
        {name: 'getState', signature: 'getState()', description: 'Returns: Promise<any>'},
        {name: 'loadState', signature: 'loadState(state)', description: 'Returns: Promise<void>'},
        {name: 'saveConfig', signature: 'saveConfig(config?)', description: 'Returns: Promise<void>'},
        {name: 'setConfigProperty', signature: 'setConfigProperty(key, value)', description: 'Returns: Promise<void>'},
        {name: 'resetToDefaults', signature: 'resetToDefaults()', description: 'Returns: Promise<void>'}
    ],
    'System': [
        {name: 'getPID', signature: 'getPID()', description: 'Returns: Promise<number>'},
        {name: 'getOS', signature: 'getOS()', description: 'Returns: Promise<string>'}
    ],
    'Process': [
        {name: 'createProcess', signature: 'createProcess(args, options = { is_detachable: false, share_stdio: false })', description: 'Returns: Promise<Process | null>'},
        {name: 'createWindow', signature: 'createWindow(page, args = [], options = { is_detachable: false, include_orig_args: true, share_stdio: false })', description: 'Returns: Promise<Process | null>'},
        {name: 'duplicate', signature: 'duplicate(pid = -1, options = { is_detachable: false, share_stdio: false })', description: 'Returns: Promise<Process | null>'},
        {name: 'dumpProcess', signature: 'dumpProcess(pid)', description: 'Returns: Promise<Process | null>'},
        {name: 'dumpProcesses', signature: 'dumpProcesses(filter?)', description: 'Returns: Promise<Process[]>'},
        {name: 'dumpCurrentProcess', signature: 'dumpCurrentProcess()', description: 'Returns: Promise<Process | null>'},
        {name: 'listenToOutput', signature: 'listenToOutput(lines = -1, options = { tail: false })', description: 'Returns: Promise<string[]>'},
        {name: 'getMessages', signature: 'getMessages(pid = -1)', description: 'Returns: Promise<any[]>'},
        {name: 'waitAll', signature: 'waitAll()', description: 'Returns: Promise<void>'},
        {name: 'refresh', signature: 'refresh()', description: 'Returns: Promise<Process>'},
        {name: 'kill', signature: 'kill(signal = 0x2)', description: 'Returns: Promise<Process>'},
        {name: 'detach', signature: 'detach()', description: 'Returns: Promise<Process>'},
        {name: 'send', signature: 'send(msg)', description: 'Returns: Promise<Process>'},
        {name: 'wait', signature: 'wait()', description: 'Returns: Promise<Process>'}
    ],
    'Debug': [
        {name: 'clearConsole', signature: 'clearConsole()', description: 'Returns: Promise<void>'},
        {name: 'openDevtools', signature: 'openDevtools()', description: 'Returns: Promise<void>'},
        {name: 'closeDevtools', signature: 'closeDevtools()', description: 'Returns: Promise<void>'}
    ],
    'Network': [
        {name: 'getLoadProgress', signature: 'getLoadProgress()', description: 'Returns: Promise<number>'},
        {name: 'isLoading', signature: 'isLoading()', description: 'Returns: Promise<boolean>'}
    ],
    'Navigate': [
        {name: 'back', signature: 'back()', description: 'Returns: Promise<void>'},
        {name: 'forward', signature: 'forward()', description: 'Returns: Promise<void>'},
        {name: 'stopLoading', signature: 'stopLoading()', description: 'Returns: Promise<void>'},
        {name: 'canGoBack', signature: 'canGoBack()', description: 'Returns: Promise<boolean>'},
        {name: 'canGoForward', signature: 'canGoForward()', description: 'Returns: Promise<boolean>'},
        {name: 'openURI', signature: 'openURI(uri)', description: 'Returns: Promise<void>'}
    ],
    'Plugins': [
        {name: 'getPluginsList', signature: 'getPluginsList()', description: 'Returns: Promise<any[]>'}
    ],
    'Utils': [
        {name: 'decode', signature: 'decode(str)', description: 'Decode a base64 string'},
        {name: 'encode', signature: 'encode(str, options = { string: "base64" })', description: 'Encode a string to base64'},
        {name: 'serialize', signature: 'serialize(obj)', description: 'Serialize an object to JSON'}
    ],
    'Callbacks': [
        {name: 'onServerMessage', signature: 'onServerMessage = async (message) => {...}', description: 'Handles messages received from the server.'},
    ],
    'Plugin': [
        // Constructor
        {name: 'Plugin', signature: 'Plugin(name, internal_name, version, description, repository_url, logger)', description: 'C++ Plugin Constructor'},
        // Public Methods
        {name: 'getName', signature: 'getName()', description: 'Returns: std::string - Get plugin name'},
        {name: 'getInternalName', signature: 'getInternalName()', description: 'Returns: std::string - Get internal name'},
        {name: 'getVersion', signature: 'getVersion()', description: 'Returns: std::string - Get plugin version'},
        {name: 'getDescription', signature: 'getDescription()', description: 'Returns: std::string - Get description'},
        {name: 'getRepositoryUrl', signature: 'getRepositoryUrl()', description: 'Returns: std::string - Get repository URL'},
        {name: 'getFunctions', signature: 'getFunctions()', description: 'Returns: const std::map& - Get registered functions'},
        {name: 'getMetadata', signature: 'getMetadata()', description: 'Returns: json::object - Get plugin metadata'},
        // Protected Methods
        {name: 'processInput (string)', signature: 'processInput(const std::string&)', description: 'Returns: json::value - Process string input'},
        {name: 'processInput (value)', signature: 'processInput(const json::value&)', description: 'Returns: json::value - Process JSON value input'},
        {name: 'processInput (object)', signature: 'processInput(const json::object&)', description: 'Returns: json::value - Process JSON object input'},
        {name: 'processInput (array)', signature: 'processInput(const json::array&)', description: 'Returns: json::value - Process JSON array input'},
        {name: 'formatOutput (value)', signature: 'formatOutput(const json::value&)', description: 'Returns: json::value - Format JSON value output'},
        {name: 'formatOutput (string)', signature: 'formatOutput(const std::string&)', description: 'Returns: json::value - Format string output'},
        {name: 'formatOutput (template)', signature: 'formatOutput(T&&)', description: 'Returns: json::value - Format templated output'}
    ]
};
