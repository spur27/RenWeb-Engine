/**
 * Recursively decodes encoded values in an object structure.
 * Detects objects with __encoding_type__ and __val__ properties and decodes them.
 * Currently supports base64 encoding type.
 *
 * @param dec - The value to decode (can be any type)
 * @returns The decoded value with all nested encoded values converted
 *
 * @example
 * // Decodes a base64 encoded string
 * decode({ __encoding_type__: "base64", __val__: [72, 101, 108, 108, 111] })
 * // Returns: "Hello"
 *
 * @example
 * // Recursively decodes nested objects
 * decode({ name: { __encoding_type__: "base64", __val__: [74, 111, 104, 110] } })
 * // Returns: { name: "John" }
 */
declare function decode(dec: any): any;
/**
 * Recursively encodes values in an object structure.
 * Converts strings to an encoded format with __encoding_type__ and __val__ properties.
 * Arrays and objects are processed recursively.
 *
 * @param enc - The value to encode (can be any type)
 * @param options - Encoding options
 * @param options.string - The encoding type for strings (default: "base64")
 * @returns The encoded value with all nested strings converted to encoded format
 *
 * @example
 * // Encodes a string to base64 format
 * encode("Hello")
 * // Returns: { __encoding_type__: "base64", __val__: [72, 101, 108, 108, 111] }
 *
 * @example
 * // Recursively encodes nested objects
 * encode({ name: "John", age: 30 })
 * // Returns: { name: { __encoding_type__: "base64", __val__: [...] }, age: 30 }
 */
declare function encode(enc: any, { string }?: {
    string: "base64";
}): any;
/**
 * Serializes a value to a string representation.
 * If the value is already a string, returns it unchanged.
 * Otherwise, converts the value to a JSON string.
 *
 * @param obj - The value to serialize
 * @returns The string representation of the value
 *
 * @example
 * serialize("hello") // Returns: "hello"
 * serialize({ key: "value" }) // Returns: '{"key":"value"}'
 * serialize(123) // Returns: "123"
 */
declare function serialize(obj: any): string;
export declare const Utils: {
    decode: typeof decode;
    encode: typeof encode;
    serialize: typeof serialize;
};
/**
 * Window property getters and setters.
 */
export declare namespace Properties {
    /**
     * Gets the window size.
     * @returns Promise that resolves to object with width and height
     */
    function getSize(): Promise<{
        width: number;
        height: number;
    }>;
    /**
     * Sets the window size.
     * @param width - Window width in pixels
     * @param height - Window height in pixels
     * @returns Promise that resolves when size is set
     */
    function setSize(width: number, height: number): Promise<void>;
    /**
     * Gets the window position.
     * @returns Promise that resolves to object with x and y coordinates
     */
    function getPosition(): Promise<{
        x: number;
        y: number;
    }>;
    /**
     * Sets the window position.
     * @param x - X coordinate in pixels
     * @param y - Y coordinate in pixels
     * @returns Promise that resolves when position is set
     */
    function setPosition(x: number, y: number): Promise<void>;
    /**
     * Gets whether window has a title bar.
     * @returns Promise that resolves to true if title bar is shown
     */
    function getTitleBar(): Promise<boolean>;
    /**
     * Sets whether window has a title bar.
     * @param has_title_bar - Whether to show title bar
     * @returns Promise that resolves when title bar state is set
     */
    function setTitleBar(has_title_bar: boolean): Promise<void>;
    /**
     * Gets whether window is resizable.
     * @returns Promise that resolves to true if resizable
     */
    function getResizable(): Promise<boolean>;
    /**
     * Sets whether window is resizable.
     * @param is_resizable - Whether window can be resized
     * @returns Promise that resolves when resizable state is set
     */
    function setResizable(is_resizable: boolean): Promise<void>;
    /**
     * Gets whether window stays on top of other windows.
     * @returns Promise that resolves to true if window is kept above
     */
    function getKeepAbove(): Promise<boolean>;
    /**
     * Sets whether window stays on top of other windows.
     * @param is_keepabove - Whether to keep window above others
     * @returns Promise that resolves when keep-above state is set
     */
    function setKeepAbove(is_keepabove: boolean): Promise<void>;
    /**
     * Gets whether window is minimized.
     * @returns Promise that resolves to true if minimized
     */
    function getMinimize(): Promise<boolean>;
    /**
     * Sets whether window is minimized.
     * @param is_minimize - Whether to minimize window
     * @returns Promise that resolves when minimize state is set
     */
    function setMinimize(is_minimize: boolean): Promise<void>;
    /**
     * Gets whether window is maximized.
     * @returns Promise that resolves to true if maximized
     */
    function getMaximize(): Promise<boolean>;
    /**
     * Sets whether window is maximized.
     * @param is_maximize - Whether to maximize window
     * @returns Promise that resolves when maximize state is set
     */
    function setMaximize(is_maximize: boolean): Promise<void>;
    /**
     * Gets whether window is in fullscreen mode.
     * @returns Promise that resolves to true if fullscreen
     */
    function getFullscreen(): Promise<boolean>;
    /**
     * Sets whether window is in fullscreen mode.
     * @param is_fullscreen - Whether to enable fullscreen
     * @returns Promise that resolves when fullscreen state is set
     */
    function setFullscreen(is_fullscreen: boolean): Promise<void>;
    /**
     * Gets whether window is shown in taskbar.
     * @returns Promise that resolves to true if shown in taskbar
     */
    function getTaskbarShow(): Promise<boolean>;
    /**
     * Sets whether window is shown in taskbar.
     * @param is_taskbar_show - Whether to show in taskbar
     * @returns Promise that resolves when taskbar visibility is set
     */
    function setTaskbarShow(is_taskbar_show: boolean): Promise<void>;
    /**
     * Gets the window opacity.
     * @returns Promise that resolves to opacity value (0.0 to 1.0)
     */
    function getOpacity(): Promise<number>;
    /**
     * Sets the window opacity.
     * @param opacity - Opacity value (0.0 = transparent, 1.0 = opaque)
     * @returns Promise that resolves when opacity is set
     */
    function setOpacity(opacity: number): Promise<void>;
}
/**
 * Window management and control functions.
 */
export declare namespace Window {
    /**
     * Checks if the window currently has focus.
     * @returns Promise that resolves to true if window is focused
     */
    function isFocus(): Promise<boolean>;
    /**
     * Shows or hides the window.
     * @param is_window_shown - Whether to show the window
     * @returns Promise that resolves when operation is complete
     */
    function show(is_window_shown?: boolean): Promise<void>;
    /**
     * Changes the window title.
     * @param title - New window title
     * @returns Promise that resolves to the new title
     */
    function changeTitle(title: string): Promise<string>;
    /**
     * Resets the window title to the default.
     * @returns Promise that resolves to the default title
     */
    function resetTitle(): Promise<string>;
    /**
     * Gets the current window title.
     * @returns Promise that resolves to the current title
     */
    function currentTitle(): Promise<string>;
    /**
     * Resets the current page to the starting page.
     * @returns Promise that resolves when page reset starts
     */
    function resetPage(): Promise<void>;
    /**
     * Gets the current page name.
     * @returns Promise that resolves to the current page
     */
    function currentPage(): Promise<string>;
    /**
     * Gets the initial starting page.
     * @returns Promise that resolves to the initial page
     */
    function initialPage(): Promise<string>;
    /**
     * Reloads the current page.
     * @returns Promise that resolves when page reload starts
     */
    function reloadPage(): Promise<void>;
    /**
     * Navigates to a different page or URI.
     * @param uri - URI or page name to navigate to
     * @returns Promise that resolves when navigation starts
     */
    function navigatePage(uri: string): Promise<void>;
    /**
     * Terminates the current window/process.
     * @returns Promise that resolves when termination starts
     */
    function terminate(): Promise<void>;
    /**
     * Starts a window drag operation (allows moving the window).
     * @returns Promise that resolves when drag operation starts
     */
    function startWindowDrag(): Promise<void>;
    /**
     * Opens the print dialog for the current page.
     * @returns Promise that resolves when print dialog opens
     */
    function printPage(): Promise<void>;
    /**
     * Increases the page zoom level.
     * @returns Promise that resolves when zoom is increased
     */
    function zoomIn(): Promise<void>;
    /**
     * Decreases the page zoom level.
     * @returns Promise that resolves when zoom is decreased
     */
    function zoomOut(): Promise<void>;
    /**
     * Resets the page zoom level to default (1.0).
     * @returns Promise that resolves when zoom is reset
     */
    function zoomReset(): Promise<void>;
    /**
     * Gets the current zoom level.
     * @returns Promise that resolves to the zoom level (1.0 = 100%)
     */
    function getZoomLevel(): Promise<number>;
    /**
     * Sets the page zoom level.
     * @param level - Zoom level (1.0 = 100%, 2.0 = 200%, etc.)
     * @returns Promise that resolves when zoom is set
     */
    function setZoomLevel(level: number): Promise<void>;
    /**
     * Searches for text in the current page.
     * @param text - Text to search for
     * @returns Promise that resolves when search starts
     */
    function findInPage(text: string): Promise<void>;
    /**
     * Finds the next occurrence of the search text.
     * @returns Promise that resolves when next match is found
     */
    function findNext(): Promise<void>;
    /**
     * Finds the previous occurrence of the search text.
     * @returns Promise that resolves when previous match is found
     */
    function findPrevious(): Promise<void>;
    /**
     * Clears the current search highlighting.
     * @returns Promise that resolves when search is cleared
     */
    function clearFind(): Promise<void>;
}
/**
 * Logging functions for different severity levels.
 */
export declare namespace Log {
    /**
     * Logs a trace-level message.
     * @param msg - Message to log (string or object)
     */
    function trace(msg: any): Promise<void>;
    /**
     * Logs a debug-level message.
     * @param msg - Message to log (string or object)
     */
    function debug(msg: any): Promise<void>;
    /**
     * Logs an info-level message.
     * @param msg - Message to log (string or object)
     */
    function info(msg: any): Promise<void>;
    /**
     * Logs a warning-level message.
     * @param msg - Message to log (string or object)
     */
    function warn(msg: any): Promise<void>;
    /**
     * Logs an error-level message.
     * @param msg - Message to log (string or object)
     */
    function error(msg: any): Promise<void>;
    /**
     * Logs a critical-level message.
     * @param msg - Message to log (string or object)
     */
    function critical(msg: any): Promise<void>;
}
/**
 * File system operations for reading, writing, and managing files and directories.
 */
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
    /**
     * Reads the contents of a file.
     * @param path - Path to the file to read
     * @returns Promise that resolves to file contents or null if file doesn't exist
     */
    function readFile(path: string): Promise<string | null>;
    /**
     * Writes contents to a file.
     * @param path - Path to the file to write
     * @param contents - Content to write to the file
     * @param settings - Write settings (append mode)
     * @returns Promise that resolves to true if successful
     */
    function writeFile(path: string, contents: string, settings?: WriteSettings): Promise<boolean>;
    /**
     * Checks if a file or directory exists.
     * @param path - Path to check
     * @returns Promise that resolves to true if path exists
     */
    function exists(path: string): Promise<boolean>;
    /**
     * Checks if a path is a directory.
     * @param path - Path to check
     * @returns Promise that resolves to true if path is a directory
     */
    function isDir(path: string): Promise<boolean>;
    /**
     * Creates a new directory.
     * @param path - Path of directory to create
     * @returns Promise that resolves to true if successful
     */
    function mkDir(path: string): Promise<boolean>;
    /**
     * Removes a file or directory.
     * @param path - Path to remove
     * @param settings - Remove settings (recursive mode for directories)
     * @returns Promise that resolves to true if successful
     */
    function rm(path: string, settings?: RmSettings): Promise<boolean>;
    /**
     * Lists contents of a directory.
     * @param path - Directory path to list
     * @returns Promise that resolves to array of file/directory names or null
     */
    function ls(path: string): Promise<string[] | null>;
    /**
     * Renames or moves a file or directory.
     * @param orig_path - Original path
     * @param new_path - New path
     * @param settings - Rename settings (overwrite mode)
     * @returns Promise that resolves to true if successful
     */
    function rename(orig_path: string, new_path: string, settings?: RenameCopySettings): Promise<boolean>;
    /**
     * Copies a file or directory.
     * @param orig_path - Source path
     * @param new_path - Destination path
     * @param settings - Copy settings (overwrite mode)
     * @returns Promise that resolves to true if successful
     */
    function copy(orig_path: string, new_path: string, settings?: RenameCopySettings): Promise<boolean>;
    /**
     * Gets the application's directory path.
     * @returns Promise that resolves to the application directory path
     */
    function getApplicationDirPath(): Promise<string>;
    /**
     * Downloads a file from a URI to a local path.
     * @param uri - URI to download from
     * @param path - Local path to save the file
     * @returns Promise that resolves when download is complete
     */
    function downloadUri(uri: string, path: string): Promise<void>;
}
/**
 * Configuration management functions.
 */
export declare namespace Config {
    /**
     * Gets the config set for the current page.
     * @returns Promise that resolves to the configuration object
     */
    function getConfig(): Promise<any>;
    /**
     * Gets the config set for \_\_defaults\_\_.
     * @returns Promise that resolves to the configuration object
     */
    function getDefaults(): Promise<any>;
    /**
     * Gets all of the current property values of the window.
     * @returns Promise that resolves to state object
     */
    function getState(): Promise<any>;
    /**
     * Loads the state properties from the object.
     * @param state - State object to load
     * @returns Promise that resolves when state is loaded
     */
    function loadState(state: any): Promise<void>;
    /**
     * Saves the current configuration to disk.
     * @returns Promise that resolves when config is saved
     */
    function saveConfig(config?: any): Promise<void>;
    /**
     * Sets a configuration property.
     * @param key - Property key to set
     * @param value - Value to set
     * @returns Promise that resolves when property is set
     */
    function setConfigProperty(key: string, value: any): Promise<void>;
    /**
     * Resets the configuration to default values.
     * @returns Promise that resolves when config is reset
     */
    function resetToDefaults(): Promise<void>;
}
/**
 * System information functions.
 */
export declare namespace System {
    /**
     * Gets the current process ID.
     * @returns Promise that resolves to the PID
     */
    function getPID(): Promise<number>;
    /**
     * Gets the operating system name.
     * @returns Promise that resolves to the OS name (e.g., "Linux", "Windows", "Darwin")
     */
    function getOS(): Promise<string>;
}
/**
 * Process class.
 */
export declare class Process {
    private _pid;
    private _ppid;
    private _name;
    private _path;
    private _args;
    private _is_background_process;
    private _is_running;
    private _is_child;
    private _exit_code;
    private _started_at;
    private _memory_kb;
    private _threads;
    private _url;
    private _page;
    private _renweb;
    private constructor();
    get info(): {
        pid: number;
        ppid: number;
        name: string;
        path: string;
        args: string[];
        is_background_process: boolean;
        is_running: boolean;
        is_child: boolean;
        exit_code: number;
        started_at: Date;
        memory_kb: number;
        threads: number;
        url: string;
        page: string;
        renweb: boolean;
    };
    get pid(): number;
    get ppid(): number;
    get name(): string;
    get path(): string;
    get args(): string[];
    get is_background_process(): boolean;
    get is_running(): boolean;
    get is_child(): boolean;
    get exit_code(): number;
    get started_at(): Date;
    get memory_kb(): number;
    get threads(): number;
    get url(): string;
    get page(): string;
    get renweb(): boolean;
    refresh(): Promise<Process>;
    kill(signal?: number): Promise<Process>;
    detach(): Promise<Process>;
    send(msg: any): Promise<Process>;
    listenToOutput(lines: number | undefined, { truncate }: {
        truncate?: boolean | undefined;
    }): Promise<string[]>;
    getMessages(): Promise<any[]>;
    wait(): Promise<Process>;
    static createProcess(args: string[], { is_detachable }: {
        is_detachable?: boolean | undefined;
    }): Promise<Process | null>;
    static createWindow(page: string, args?: string[], options?: {
        is_detachable?: boolean;
        include_orig_args?: boolean;
    }): Promise<Process | null>;
    static createWindow(pages: string[], args?: string[], options?: {
        is_detachable?: boolean;
        include_orig_args?: boolean;
    }): Promise<Process | null>;
    static duplicate(pid?: number, { is_detachable }?: {
        is_detachable?: true;
    }): Promise<Process | null>;
    static getMessages(pid?: number): Promise<any[]>;
    static dumpProcess(pid: number): Promise<Process | null>;
    static dumpProcesses(filter?: '' | 'system' | 'renweb' | 'child'): Promise<Process[]>;
    static dumpCurrentProcess(): Promise<Process | null>;
    static waitAll(): Promise<void>;
}
/**
 * Debug and developer tools functions.
 */
export declare namespace Debug {
    /**
     * Clears the browser console.
     * @returns Promise that resolves when console is cleared
     */
    function clearConsole(): Promise<void>;
    /**
     * Opens the developer tools panel.
     * @returns Promise that resolves when devtools are opened
     */
    function openDevtools(): Promise<void>;
    /**
     * Closes the developer tools panel.
     * @returns Promise that resolves when devtools are closed
     */
    function closeDevtools(): Promise<void>;
}
/**
 * Network status and loading information.
 */
export declare namespace Network {
    /**
     * Gets the current page load progress.
     * @returns Promise that resolves to progress value (0-100)
     */
    function getLoadProgress(): Promise<number>;
    /**
     * Checks if a page is currently loading.
     * @returns Promise that resolves to true if loading
     */
    function isLoading(): Promise<boolean>;
}
/**
 * Page navigation functions.
 */
export declare namespace Navigate {
    /**
     * Navigates back in browser history.
     * @returns Promise that resolves when navigation completes
     */
    function back(): Promise<void>;
    /**
     * Navigates forward in browser history.
     * @returns Promise that resolves when navigation completes
     */
    function forward(): Promise<void>;
    /**
     * Stops the current page load.
     * @returns Promise that resolves when loading is stopped
     */
    function stopLoading(): Promise<void>;
    /**
     * Checks if back navigation is possible.
     * @returns Promise that resolves to true if can go back
     */
    function canGoBack(): Promise<boolean>;
    /**
     * Checks if forward navigation is possible.
     * @returns Promise that resolves to true if can go forward
     */
    function canGoForward(): Promise<boolean>;
    /**
     * Opens a URI depending on the type.
     * Some examples are file paths in the local filesystem, http/https links, mailto links, etc.
     * @returns Promise that resolves when the URI is opened
     */
    function openURI(uri: string): Promise<void>;
}
/**
 * Plugins
 */
export declare namespace Plugins {
    /**
     * Gets list of plugins data
     * @returns Promise that resolves to an array of plugin data
     */
    function getPluginsList(): Promise<any[]>;
}
export {};
