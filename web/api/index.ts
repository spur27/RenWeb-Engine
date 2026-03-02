// Compile:  tsc --target es2020 --module es2020 --declaration --sourceMap --strict --moduleResolution node --esModuleInterop --allowSyntheticDefaultImports --skipLibCheck --forceConsistentCasingInFileNames index.ts
/* 
* -----------------------------------------------
* ---------------Helper Functions----------------
* -----------------------------------------------
*/ 

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
function decode(dec: any): any {
    switch (typeof dec) {
        case "object":
            if (dec === null) {
                return null;
            } else if ("__encoding_type__" in dec && "__val__" in dec) {
                switch (dec.__encoding_type__) {
                    case "base64":
                        return new TextDecoder().decode(new Uint8Array(dec.__val__));
                    default:
                        return dec;
                }
            } else if (Array.isArray(dec)) {
                return dec.map(el => decode(el));
            } else {
                const decodedObj: any = {};
                for (const key in dec) {
                    decodedObj[key] = decode(dec[key]);
                }
                return decodedObj;
            }
        default:
            return dec;
    }
}

/**
 * Recursively encodes values in an object structure.
 * Converts strings to an encoded format with __encoding_type__ and __val__ properties.
 * Arrays and objects are processed recursively.
 * 
 * @param enc - The value to encode (can be any type)
 * @param options - Encoding options (default: { string: "base64" })
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
function encode(enc: any, options: { string: "base64" } = { string: "base64" }): any {
    const string = options?.string ?? "base64";
    switch (typeof enc) {
        case "string":
            switch (string) {
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
        case "object":
            if (enc === null) {
                return null;

            } else if (Array.isArray(enc)) {
                return enc.map(el => encode(el, { string: string }));
            } else {
                const encodedObj: any = {};
                for (const key in enc) {
                    encodedObj[key] = encode(enc[key], { string: string });
                }
                return encodedObj;
            }
        default:
            return enc;
    }
}

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
function serialize(obj: any): string {
    return (typeof obj === "string") ? obj : JSON.stringify(obj);
}

export const Utils = {
    decode,
    encode,
    serialize
};


/* 
* -----------------------------------------------
* ------------------Exports----------------------
* -----------------------------------------------
*/ 

declare global {
    interface Window {
        /**
         * Callback invoked when a message is received from another RenWeb process.
         * @param msg - The message object received. \
         * The `msg` param will already be decoded when it's passed. \
         * Messages should automatically be encoded as an object with `sender` and `message` properties, \
         * but this is not guaranteed.
         * @example
         * window.onServerMessage = async (msg) => {
         *     if (msg?.sender != null) {
         *        await Log.info(`Received message from PID ${msg.sender?.pid}:`, msg?.message);
         *    } else {
         *        await Log.info(`Received unformatted message:`, msg?.message);
         *    }
         * };
         */
        onServerMessage: (msg: ({sender: Process, message: any}) | any) => Promise<void>;
    }
}
window.onServerMessage = async (msg: any) => { };

/**
 * Window property getters and setters.
 */
export namespace Properties {
    /**
     * Gets the window size.
     * @returns Promise that resolves to object with width and height
     */
    export async function getSize(): Promise<{ width: number, height: number }> 
        { return await BIND_get_size(null); }
    
    /**
     * Sets the window size.
     * @param width - Window width in pixels
     * @param height - Window height in pixels
     * @returns Promise that resolves when size is set
     */
    export async function setSize(width: number, height: number): Promise<void> 
        { await BIND_set_size({ width: width, height: height }); }
    
    /**
     * Gets the window position.
     * @returns Promise that resolves to object with x and y coordinates
     */
    export async function getPosition(): Promise<{ x: number, y: number }> 
        { return await BIND_get_position(null); }
    
    /**
     * Sets the window position.
     * @param x - X coordinate in pixels
     * @param y - Y coordinate in pixels
     * @returns Promise that resolves when position is set
     */
    export async function setPosition(x: number, y: number): Promise<void> 
        { await BIND_set_position({ x: x, y: y }); }
    
    /**
     * Gets whether window has a title bar.
     * @returns Promise that resolves to true if title bar is shown
     */
    export async function getTitleBar(): Promise<boolean> 
        { return await BIND_get_title_bar(null); }
    
    /**
     * Sets whether window has a title bar.
     * @param has_title_bar - Whether to show title bar
     * @returns Promise that resolves when title bar state is set
     */
    export async function setTitleBar(has_title_bar: boolean): Promise<void> 
        { await BIND_set_title_bar(has_title_bar); }
    
    /**
     * Gets whether window is resizable.
     * @returns Promise that resolves to true if resizable
     */
    export async function getResizable(): Promise<boolean> 
        { return await BIND_get_resizable(null); }
    
    /**
     * Sets whether window is resizable.
     * @param is_resizable - Whether window can be resized
     * @returns Promise that resolves when resizable state is set
     */
    export async function setResizable(is_resizable: boolean): Promise<void> 
        { await BIND_set_resizable(is_resizable); }
    
    /**
     * Gets whether window stays on top of other windows.
     * @returns Promise that resolves to true if window is kept above
     */
    export async function getKeepAbove(): Promise<boolean> 
        { return await BIND_get_keepabove(null); }
    
    /**
     * Sets whether window stays on top of other windows.
     * @param is_keepabove - Whether to keep window above others
     * @returns Promise that resolves when keep-above state is set
     */
    export async function setKeepAbove(is_keepabove: boolean): Promise<void> 
        { await BIND_set_keepabove(is_keepabove); }
    
    /**
     * Gets whether window is minimized.
     * @returns Promise that resolves to true if minimized
     */
    export async function getMinimize(): Promise<boolean> 
        { return await BIND_get_minimize(null); }
    
    /**
     * Sets whether window is minimized.
     * @param is_minimize - Whether to minimize window
     * @returns Promise that resolves when minimize state is set
     */
    export async function setMinimize(is_minimize: boolean): Promise<void> 
        { await BIND_set_minimize(is_minimize); }
    
    /**
     * Gets whether window is maximized.
     * @returns Promise that resolves to true if maximized
     */
    export async function getMaximize(): Promise<boolean> 
        { return await BIND_get_maximize(null); }
    
    /**
     * Sets whether window is maximized.
     * @param is_maximize - Whether to maximize window
     * @returns Promise that resolves when maximize state is set
     */
    export async function setMaximize(is_maximize: boolean): Promise<void> 
        { await BIND_set_maximize(is_maximize); }
    
    /**
     * Gets whether window is in fullscreen mode.
     * @returns Promise that resolves to true if fullscreen
     */
    export async function getFullscreen(): Promise<boolean> 
        { return await BIND_get_fullscreen(null); }
    
    /**
     * Sets whether window is in fullscreen mode.
     * @param is_fullscreen - Whether to enable fullscreen
     * @returns Promise that resolves when fullscreen state is set
     */
    export async function setFullscreen(is_fullscreen: boolean): Promise<void> 
        { await BIND_set_fullscreen(is_fullscreen); }
    
    /**
     * Gets whether window is shown in taskbar.
     * @returns Promise that resolves to true if shown in taskbar
     */
    export async function getTaskbarShow(): Promise<boolean> 
        { return await BIND_get_taskbar_show(null); }
    
    /**
     * Sets whether window is shown in taskbar.
     * @param is_taskbar_show - Whether to show in taskbar
     * @returns Promise that resolves when taskbar visibility is set
     */
    export async function setTaskbarShow(is_taskbar_show: boolean): Promise<void> 
        { await BIND_set_taskbar_show(is_taskbar_show); }
    
    /**
     * Gets the window opacity.
     * @returns Promise that resolves to opacity value (0.0 to 1.0)
     */
    export async function getOpacity(): Promise<number> 
        { return await BIND_get_opacity(null); }
    
    /**
     * Sets the window opacity.
     * @param opacity - Opacity value (0.0 = transparent, 1.0 = opaque)
     * @returns Promise that resolves when opacity is set
     */
    export async function setOpacity(opacity: number): Promise<void> 
        { await BIND_set_opacity(opacity); }
}

/**
 * Window management and control functions.
 */
export namespace Window {
    /**
     * Checks if the window currently has focus.
     * @returns Promise that resolves to true if window is focused
     */
    export async function isFocus(): Promise<boolean> 
        { return await BIND_is_focus(null); }
    
    /**
     * Shows or hides the window.
     * @param is_window_shown - Whether to show the window
     * @returns Promise that resolves when operation is complete
     */
    export async function show(is_window_shown: boolean = true): Promise<void> 
        { await BIND_show(is_window_shown); }
    
    /**
     * Changes the window title.
     * @param title - New window title
     * @returns Promise that resolves to the new title
     */
    export async function changeTitle(title: string): Promise<string> 
        { return decode(await BIND_change_title(encode(title))); }
    
    /**
     * Resets the window title to the default.
     * @returns Promise that resolves to the default title
     */
    export async function resetTitle(): Promise<string> 
        { return decode(await BIND_reset_title(null)); }
    
    /**
     * Gets the current window title.
     * @returns Promise that resolves to the current title
     */
    export async function currentTitle(): Promise<string> 
        { return decode(await BIND_current_title(null)); }
    
    /**
     * Resets the current page to the starting page.
     * @returns Promise that resolves when page reset starts
     */
    export async function resetPage(): Promise<void> 
        { await BIND_reset_page(null); }

    /**
     * Gets the current page name.
     * @returns Promise that resolves to the current page
     */
    export async function currentPage(): Promise<string> 
        { return decode(await BIND_current_page(null)); }

    /**
     * Gets the initial starting page.
     * @returns Promise that resolves to the initial page
     */
    export async function initialPage(): Promise<string> 
        { return decode(await BIND_initial_page(null)); }

    /**
     * Reloads the current page.
     * @returns Promise that resolves when page reload starts
     */
    export async function reloadPage(): Promise<void> 
        { await BIND_reload_page(null); }
    
    /**
     * Navigates to a different page or URI.
     * @param uri - URI or page name to navigate to
     * @returns Promise that resolves when navigation starts
     */
    export async function navigatePage(uri: string): Promise<void> 
        { await BIND_navigate_page(encode(uri)); }
    
    /**
     * Terminates the current window/process.
     * @returns Promise that resolves when termination starts
     */
    export async function terminate(): Promise<void> 
        { await BIND_terminate(null); }
    
    /**
     * Starts a window drag operation (allows moving the window).
     * @returns Promise that resolves when drag operation starts
     */
    export async function startWindowDrag(): Promise<void> 
        { await BIND_start_window_drag(null); }
    
    /**
     * Opens the print dialog for the current page.
     * @returns Promise that resolves when print dialog opens
     */
    export async function printPage(): Promise<void> 
        { await BIND_print_page(null); }
    
    /**
     * Increases the page zoom level.
     * @returns Promise that resolves when zoom is increased
     */
    export async function zoomIn(): Promise<void> 
        { await BIND_zoom_in(null); }
    
    /**
     * Decreases the page zoom level.
     * @returns Promise that resolves when zoom is decreased
     */
    export async function zoomOut(): Promise<void> 
        { await BIND_zoom_out(null); }
    
    /**
     * Resets the page zoom level to default (1.0).
     * @returns Promise that resolves when zoom is reset
     */
    export async function zoomReset(): Promise<void> 
        { await BIND_zoom_reset(null); }
    
    /**
     * Gets the current zoom level.
     * @returns Promise that resolves to the zoom level (1.0 = 100%)
     */
    export async function getZoomLevel(): Promise<number> 
        { return await BIND_get_zoom_level(null); }
    
    /**
     * Sets the page zoom level.
     * @param level - Zoom level (1.0 = 100%, 2.0 = 200%, etc.)
     * @returns Promise that resolves when zoom is set
     */
    export async function setZoomLevel(level: number): Promise<void> 
        { await BIND_set_zoom_level(level); }
    
    /**
     * Searches for text in the current page.
     * @param text - Text to search for
     * @returns Promise that resolves when search starts
     */
    export async function findInPage(text: string): Promise<void> 
        { await BIND_find_in_page(encode(text)); }
    
    /**
     * Finds the next occurrence of the search text.
     * @returns Promise that resolves when next match is found
     */
    export async function findNext(): Promise<void> 
        { await BIND_find_next(null); }
    
    /**
     * Finds the previous occurrence of the search text.
     * @returns Promise that resolves when previous match is found
     */
    export async function findPrevious(): Promise<void> 
        { await BIND_find_previous(null); }
    
    /**
     * Clears the current search highlighting.
     * @returns Promise that resolves when search is cleared
     */
    export async function clearFind(): Promise<void> 
        { await BIND_clear_find(null); }
}


/**
 * Logging functions for different severity levels.
 */
export namespace Log {
    /**
     * Logs a trace-level message.
     * @param msg - Message to log (string or object)
     */
    export async function trace(msg: any): Promise<void> 
        { await BIND_log_trace(encode(serialize(msg))); }
    
    /**
     * Logs a debug-level message.
     * @param msg - Message to log (string or object)
     */
    export async function debug(msg: any): Promise<void> 
        { await BIND_log_debug(encode(serialize(msg))); }
    
    /**
     * Logs an info-level message.
     * @param msg - Message to log (string or object)
     */
    export async function info(msg: any): Promise<void> 
        { await BIND_log_info(encode(serialize(msg))); }
    
    /**
     * Logs a warning-level message.
     * @param msg - Message to log (string or object)
     */
    export async function warn(msg: any): Promise<void> 
        { await BIND_log_warn(encode(serialize(msg))); }
    
    /**
     * Logs an error-level message.
     * @param msg - Message to log (string or object)
     */
    export async function error(msg: any): Promise<void> 
        { await BIND_log_error(encode(serialize(msg))); }
    
    /**
     * Logs a critical-level message.
     * @param msg - Message to log (string or object)
     */
    export async function critical(msg: any): Promise<void> 
        { await BIND_log_critical(encode(serialize(msg))); }
}

/**
 * File system operations for reading, writing, and managing files and directories.
 */
export namespace FS {
    /**
     * Reads the contents of a file.
     * @param path - Path to the file to read
     * @returns Promise that resolves to file contents or null if file doesn't exist
     */
    export async function readFile(path: string): Promise<string | null> 
        { return decode(await BIND_read_file(encode(path))); }
    
    /**
     * Writes contents to a file.
     * @param path - Path to the file to write
     * @param contents - Content to write to the file
     * @param settings - Write settings (default: { append: false })
     * @param settings.append - Whether to append to file instead of overwriting (default: false)
     * @returns Promise that resolves to true if successful
     */
    export async function writeFile(path: string, contents: string, settings: {append: boolean} = { append: false }): Promise<boolean> 
        { return await BIND_write_file(encode(path), encode(contents), settings); }
    
    /**
     * Checks if a file or directory exists.
     * @param path - Path to check
     * @returns Promise that resolves to true if path exists
     */
    export async function exists(path: string): Promise<boolean> 
        { return await BIND_exists(encode(path)); }
    
    /**
     * Checks if a path is a directory.
     * @param path - Path to check
     * @returns Promise that resolves to true if path is a directory
     */
    export async function isDir(path: string): Promise<boolean> 
        { return await BIND_is_dir(encode(path)); }
    
    /**
     * Creates a new directory.
     * @param path - Path of directory to create
     * @returns Promise that resolves to true if successful
     */
    export async function mkDir(path: string): Promise<boolean> 
        { return await BIND_mk_dir(encode(path)); }
    
    /**
     * Removes a file or directory.
     * @param path - Path to remove
     * @param settings - Remove settings (default: { recursive: false })
     * @param settings.recursive - Whether to recursively remove directories (default: false)
     * @returns Promise that resolves to true if successful
     */
    export async function rm(path: string, settings: { recursive: boolean } = { recursive: false }): Promise<boolean> 
        { return await BIND_rm(encode(path), settings); }
    
    /**
     * Lists contents of a directory.
     * @param path - Directory path to list
     * @returns Promise that resolves to array of file/directory names or null
     */
    export async function ls(path: string): Promise<string[] | null> 
        { return decode(await BIND_ls(encode(path))); }
    
    /**
     * Renames or moves a file or directory.
     * @param orig_path - Original path
     * @param new_path - New path
     * @param settings - Rename settings (default: { overwrite: false })
     * @param settings.overwrite - Whether to overwrite existing files (default: false)
     * @returns Promise that resolves to true if successful
     */
    export async function rename(orig_path: string, new_path: string, settings: { overwrite: boolean } = { overwrite: false }): Promise<boolean> 
        { return await BIND_rename(encode(orig_path), encode(new_path), settings); }
    
    /**
     * Copies a file or directory.
     * @param orig_path - Source path
     * @param new_path - Destination path
     * @param settings - Copy settings (default: { overwrite: false })
     * @param settings.overwrite - Whether to overwrite existing files (default: false)
     * @returns Promise that resolves to true if successful
     */
    export async function copy(orig_path: string, new_path: string, settings: { overwrite: boolean } = { overwrite: false }): Promise<boolean> 
        { return await BIND_copy(encode(orig_path), encode(new_path), settings); }
    
    /**
     * Gets the application's directory path.
     * @returns Promise that resolves to the application directory path
     */
    export async function getApplicationDirPath(): Promise<string> 
        { return decode(await BIND_get_application_dir_path()); }
    
    /**
     * Gets a temporary directory path for the current session.
     * The path is unique per process and can be used for storing temporary files.
     * These files will be deleted once the applicaiton is closed.
     * @param options - Options for getting the temporary directory path (default: { create: false })
     * @param options.create - Whether to create the directory if it doesn't exist (default: false)
     * @returns Promise that resolves to the tmp directory path
     */
    export async function getTmpDirPath(options: { create?: boolean } = { create: false }): Promise<string> 
        { return decode(await BIND_get_tmp_dir_path(encode(options))); }
    
    /**
     * Downloads a file from a URI to a local path.
     * @param uri - URI to download from
     * @param path - Local path to save the file
     * @returns Promise that resolves when download is complete
     */
    export async function downloadUri(uri: string, path: string): Promise<void> 
        { await BIND_download_uri(encode(uri), encode(path)); }
}

/**
 * Configuration management functions.
 */
export namespace Config {
    /**
     * Gets the config set for the current page.
     * @returns Promise that resolves to the configuration object
     */
    export async function getConfig(): Promise<any> 
        {  return decode(await BIND_get_config(null)); }

    /**
     * Gets the config set for \_\_defaults\_\_.
     * @returns Promise that resolves to the configuration object
     */
    export async function getDefaults(): Promise<any> 
        {  return decode(await BIND_get_defaults(null)); }

    /**
     * Gets all of the current property values of the window.
     * @returns Promise that resolves to state object
     */
    export async function getState(): Promise<any> 
        {  return decode(await BIND_get_state(null)); }

    /**
     * Loads the state properties from the object.
     * @param state - State object to load
     * @returns Promise that resolves when state is loaded
     */
    export async function loadState(state: any): Promise<void> 
        {  await BIND_load_state(encode(state)); }
    
    /**
     * Saves the current configuration to disk.
     * @returns Promise that resolves when config is saved
     */
    export async function saveConfig(config?: any): Promise<void> 
        { (config == null) ? await BIND_save_config(null) : await BIND_save_config(encode(config)); }
        
    /**
     * Sets a configuration property.
     * @param key - Property key to set
     * @param value - Value to set
     * @returns Promise that resolves when property is set
     */
    export async function setConfigProperty(key: string, value: any): Promise<void> 
        { await BIND_set_config_property(encode(key), encode(value)); }
    
    /**
     * Resets the configuration to default values.
     * @returns Promise that resolves when config is reset
     */
    export async function resetToDefaults(): Promise<void> 
        { await BIND_reset_to_defaults(null); }
}


/**
 * System information functions.
 */
export namespace System {
    /**
     * Gets the current process ID.
     * @returns Promise that resolves to the PID
     */
    export async function getPID(): Promise<number> 
        { return await BIND_get_pid(null); }
    
    /**
     * Gets the operating system name.
     * @returns Promise that resolves to the OS name (e.g., "Linux", "Windows", "Darwin")
     */
    export async function getOS(): Promise<string> 
        { return decode(await BIND_get_OS(null)); }
}


/**
 * Represents a system or RenWeb process with methods for process management and communication.
 * Process instances can only be created through static factory methods like createProcess() or createWindow().
 * 
 * @example
 * // Create a new RenWeb window
 * const proc = await Process.createWindow("home");
 * 
 * @example
 * // Create a system process
 * const proc = await Process.createProcess(["/bin/ls", "-la"]);
 * 
 * @example
 * // Get current process info
 * const current = await Process.dumpCurrentProcess();
 * console.log(current?.pid);
 */
export class Process {
    private _pid: number;
    private _ppid: number;
    private _name: string;
    private _path: string;
    private _args: string[];
    private _is_background_process: boolean;
    private _is_running: boolean;
    private _is_child: boolean;
    private _exit_code: number;
    private _started_at: Date;
    private _memory_kb: number;
    private _threads: number;
    private _url: string;
    private _page: string;
    private _renweb: boolean;

    private constructor (
        pid: number,
        ppid: number,
        name: string,
        path: string,
        args: string[],
        is_background_process: boolean,
        is_running: boolean,
        is_child: boolean,
        exit_code: number,
        started_at: Date,
        memory_kb: number,
        threads: number,
        url: string,
        page: string,
        renweb: boolean,
    ) {
        this._pid = pid;
        this._ppid = ppid;
        this._name = name;
        this._path = path;
        this._args = args;
        this._is_background_process = is_background_process;
        this._is_running = is_running;
        this._is_child = is_child;
        this._exit_code = exit_code;
        this._started_at = started_at;
        this._memory_kb = memory_kb;
        this._threads = threads;
        this._url = url;
        this._page = page;
        this._renweb = renweb;
    }
    
    /**
     * Gets all process information as an object.
     * @returns Object containing all process properties
     */
    public get info() {
        return {
            pid: this._pid,
            ppid: this._ppid,
            name: this._name,
            path: this._path,
            args: this._args,
            is_background_process: this._is_background_process,
            is_running: this._is_running,
            is_child: this._is_child,
            exit_code: this._exit_code,
            started_at: this._started_at,
            memory_kb: this._memory_kb,
            threads: this._threads,
            url: this._url,
            page: this._page,
            renweb: this._renweb
        }
    }
    
    /** Gets the process ID */
    public get pid() { return this._pid; }
    
    /** Gets the parent process ID */
    public get ppid() { return this._ppid; }
    
    /** Gets the process name */
    public get name() { return this._name; }
    
    /** Gets the process executable path */
    public get path() { return this._path; }
    
    /** Gets the process command-line arguments */
    public get args() { return this._args; }
    
    /** Gets whether this is a background process */
    public get is_background_process() { return this._is_background_process; }
    
    /** Gets whether the process is currently running */
    public get is_running() { return this._is_running; }
    
    /** Gets whether this is a child process of the current process */
    public get is_child() { return this._is_child; }
    
    /** Gets the process exit code (0 if still running) */
    public get exit_code() { return this._exit_code; }
    
    /** Gets the process start time */
    public get started_at() { return this._started_at; }
    
    /** Gets the process memory usage in kilobytes */
    public get memory_kb() { return this._memory_kb; }
    
    /** Gets the number of threads in the process */
    public get threads() { return this._threads; }
    
    /** Gets the URL (for RenWeb processes) */
    public get url() { return this._url; }
    
    /** Gets the page name (for RenWeb processes) */
    public get page() { return this._page; }
    
    /** Gets whether this is a RenWeb process */
    public get renweb() { return this._renweb; }
    
    /**
     * Refreshes the process information from the system.
     * Updates all properties with current values.
     * @returns This Process instance for method chaining
     * @example
     * await proc.refresh();
     * console.log(proc.memory_kb); // Updated memory usage
     */
    public async refresh(): Promise<Process> {
        const updated_proc_info = await BIND_dump_process(this._pid);
        this._pid = updated_proc_info.pid;
        this._ppid = updated_proc_info.ppid;
        this._name = updated_proc_info.name;
        this._path = updated_proc_info.path;
        this._args = updated_proc_info.args;
        this._is_background_process = updated_proc_info.is_background_process;
        this._is_running = updated_proc_info.is_running;
        this._is_child = updated_proc_info.is_child;
        this._exit_code = updated_proc_info.exit_code;
        this._started_at = new Date(updated_proc_info.started_at);
        this._memory_kb = updated_proc_info.memory_kb;
        this._threads = updated_proc_info.threads;
        this._url = updated_proc_info.url;
        this._page = updated_proc_info.page;
        this._renweb = updated_proc_info.renweb;
        return this;
    }
    
    /**
     * Sends a signal to terminate or interrupt the process.
     * @param signal - Signal number to send (default: 0x2 = SIGINT)
     * @returns This Process instance for method chaining
     * @example
     * await proc.kill(); // Send SIGINT
     * await proc.kill(0x9); // Send SIGKILL
     */
    public async kill(signal = 0x2): Promise<Process> {
        await BIND_kill_process(this._pid, signal);
        return this;
    }
    
    /**
     * Detaches the process, allowing it to run independently.
     * After detaching, the process will continue running even if the parent terminates.
     * @returns This Process instance for method chaining
     * @example
     * await proc.detach();
     */
    public async detach(): Promise<Process> {
        await BIND_detach_process(this._pid);
        return this;
    }
    
    /**
     * Sends a message to this process.
     * The message will be automatically encoded before sending.
     * @param msg - Message to send (can be any serializable value)
     * @returns This Process instance for method chaining
     * @example
     * await proc.send({ type: "command", data: "hello" });
     */
    public async send(msg: any): Promise<Process> {
        await BIND_send_message(this._pid, encode(msg));
        return this;
    }
    
    /**
     * Listens to and retrieves output from the process.
     * @param lines - Number of lines to retrieve (default: -1 for all)
     * @param options - Options object (default: { tail: false })
     * @param options.tail - Whether to retrieve lines from the end of the file. (default: false)
     * @returns Array of output lines
     * @example
     * const output = await proc.listenToOutput(10); // Last 10 lines
     * const allOutput = await proc.listenToOutput(); // All lines
     */
    public async listenToOutput(lines = -1, options: { tail: boolean } = { tail: false }): Promise<string[]> {
        const tail = options?.tail ?? false;
        return Process.listenToOutput(this._pid, lines, { tail: tail });
    }
    
    /**
     * Gets messages sent to this process.
     * @returns Array of messages received by this process
     * @example
     * const messages = await proc.getMessages();
     */
    public async getMessages(): Promise<any[]> {
        return Process.getMessages(this._pid);
    }
    
    /**
     * Waits for the process to complete execution.
     * This will block until the process exits.
     * @returns This Process instance for method chaining
     * @example
     * await proc.wait();
     * console.log("Process finished with code:", proc.exit_code);
     */
    public async wait(): Promise<Process> {
        await BIND_wait(this._pid);
        return this;
    }

        /**
     * Listens to and retrieves output from the process of the specified pid.
     * @param pid - Process ID to listen to (default: -1 for current process)
     * @param lines - Number of lines to retrieve (default: -1 for all)
     * @param options - Options object (default: { tail: false })
     * @param options.tail - Whether to retrieve lines from the end of the file. (default: false)
     * @returns Array of output lines
     * @example
     * const output = await Process.listenToOutput(1234, 10); // Last 10 lines of process with PID 1234
     * const allOutput = await Process.listenToOutput(1234); // All lines of process with PID 1234
     */
    public static async listenToOutput(pid = -1, lines = -1, options: { tail: boolean } = { tail: false }): Promise<string[]> {
        if (pid == -1) {
            const proc = await Process.dumpCurrentProcess();
            if (proc == null) {
                throw new Error("Failed to get current process information");
            }
            pid = proc?.pid;
        }
        const tail = options?.tail ?? false;
        return decode(await BIND_listen_to_output(pid, lines, { tail: tail }));
    }


    /**
     * Creates a new system process.
     * @param args - Array of command and arguments (first element is the executable)
     * @param options - Options object (default: { is_detachable: false })
     * @param options.is_detachable - Whether the process can be detached (default: false)
     * @param options.share_stdio - Whether to share stdio with the parent process (default: false)
     * @returns New Process instance or null if creation failed
     * @example
     * const proc = await Process.createProcess(["/bin/ls", "-la"]);
     * await proc.wait();
     */
    public static async createProcess(args: string[], options: { is_detachable: boolean, share_stdio: boolean } = { is_detachable: false, share_stdio: false }): Promise<Process | null> {
        const is_detachable = options?.is_detachable ?? false;
        const share_stdio = options?.share_stdio ?? false;
        const process = decode(await BIND_create_process(encode(args), encode({is_detachable: is_detachable, share_stdio: share_stdio})));
        if (typeof process === "object" && process?.pid != null) {
            return new Process(
                process.pid,
                process.ppid,
                process.name,
                process.path,
                process.args,
                process.is_background_process,
                process.is_running,
                process.is_child,
                process.exit_code,
                new Date(process.started_at),
                process.memory_kb,
                process.threads,
                process.url,
                process.page,
                process.renweb
            );
        }
        return null;
    }
    
    /**
     * Creates a new RenWeb window process.
     * @param page - Page name to load
     * @param args - Additional command-line arguments (default: [])
     * @param options - Options object (default: { is_detachable: false, include_orig_args: true })
     * @param options.is_detachable - Whether the process can be detached (default: false)
     * @param options.include_orig_args - Whether to include original non-page process arguments (default: true)
     * @param options.share_stdio - Whether to share stdio with the parent process (default: false)
     * @returns New Process instance or null if creation failed
     */
    public static async createWindow(page: string, args?: string[], options?: { is_detachable?: boolean, include_orig_args?: boolean, share_stdio?: boolean }): Promise<Process | null>;
    
    /**
     * Creates a new RenWeb window process with multiple pages.
     * @param pages - Array of page names to load
     * @param args - Additional command-line arguments (default: [])
     * @param options - Options object (default: { is_detachable: false, include_orig_args: true })
     * @param options.is_detachable - Whether the process can be detached (default: false)
     * @param options.include_orig_args - Whether to include original non-page process arguments (default: true)
     * @param options.share_stdio - Whether to share stdio with the parent process (default: false)
     * @returns New Process instance or null if creation failed
     * @example
     * const proc = await Process.createWindow("home");
     * const multiProc = await Process.createWindow(["home", "settings"]);
     */
    public static async createWindow(pages: string[], args?: string[], options?: { is_detachable?: boolean, include_orig_args?: boolean, share_stdio?: boolean }): Promise<Process | null>;    
    public static async createWindow(pageOrPages: string | string[], args: string[] = [], options: { is_detachable?: boolean, include_orig_args?: boolean, share_stdio?: boolean } = {}): Promise<Process | null> {
        const is_detachable = options?.is_detachable ?? false;
        const include_orig_args = options?.include_orig_args ?? true;
        const share_stdio = options?.share_stdio ?? false;
        const pages = typeof pageOrPages === 'string' ? [pageOrPages] : pageOrPages;
        const process = decode(await BIND_create_window(encode(pages), encode(args), encode({ is_detachable: is_detachable, include_orig_args: include_orig_args, share_stdio: share_stdio })));
        if (typeof process === "object" && process?.pid != null) {
            return new Process(
                process.pid,
                process.ppid,
                process.name,
                process.path,
                process.args,
                process.is_background_process,
                process.is_running,
                process.is_child,
                process.exit_code,
                new Date(process.started_at),
                process.memory_kb,
                process.threads,
                process.url,
                process.page,
                process.renweb
            );
        }
        return null;
    }
    
    /**
     * Duplicates a process or creates a duplicate of the current window.
     * @param pid - Process ID to duplicate (default: -1 for current process)
     * @param options - Options object (default: { is_detachable: true })
     * @param options.is_detachable - Whether the new process can be detached (default: false)
     * @param options.share_stdio - Whether to share stdio with the parent process (default: false)
     * @returns New Process instance or null if duplication failed
     * @example
     * const duplicate = await Process.duplicate(); // Duplicate current window
     * const copy = await Process.duplicate(1234); // Duplicate process 1234
     */
    public static async duplicate(pid = -1, options: { is_detachable?: boolean, share_stdio?: boolean } = { is_detachable: false, share_stdio: false }): Promise<Process | null> {
        const is_detachable = options?.is_detachable ?? true;
        const share_stdio = options?.share_stdio ?? false;
        if (pid < 0) {
            return Process.createWindow([], [], { is_detachable:is_detachable, include_orig_args: true, share_stdio: share_stdio });
        } else {
            const process = await Process.dumpProcess(pid);
            if (process != null) {
                return Process.createProcess(process.args, { is_detachable: is_detachable, share_stdio: share_stdio });
            } else {
                return null;
            }
        }
    }
    
    /**
     * Gets messages for a specific process or all messages.
     * @param pid - Process ID to get messages for (-1 for all messages)
     * @returns Array of messages
     * @example
     * const allMessages = await Process.getMessages();
     * const procMessages = await Process.getMessages(1234);
     */
    public static async getMessages(pid: number = -1): Promise<any[]> {
        const messages: any[] = decode(await BIND_get_messages() as any[]);
        return (pid < 0) ? messages : messages.filter(msg => {
            return Object.hasOwnProperty.call(msg, "pid") && msg.pid == pid;
        });
    }
    
    /**
     * Gets detailed information about a specific process.
     * @param pid - Process ID to query
     * @returns Process instance with current information or null if not found
     * @example
     * const proc = await Process.dumpProcess(1234);
     * if (proc) console.log(proc.name, proc.memory_kb);
     */
    public static async dumpProcess(pid: number): Promise<Process | null> {
        const process = decode(await BIND_dump_process(pid));
        if (typeof process === "object" && process?.pid != null) {
            return new Process(
                process.pid,
                process.ppid,
                process.name,
                process.path,
                process.args,
                process.is_background_process,
                process.is_running,
                process.is_child,
                process.exit_code,
                new Date(process.started_at),
                process.memory_kb,
                process.threads,
                process.url,
                process.page,
                process.renweb
            );
        }
        return null;
    }
    
    /**
     * Gets a list of processes with optional filtering.
     * @param filter - Filter type: '' (all), 'system' (system processes), 'renweb' (RenWeb processes), 'child' (child processes)
     * @returns Array of Process instances
     * @example
     * const allProcs = await Process.dumpProcesses();
     * const renwebProcs = await Process.dumpProcesses('renweb');
     * const children = await Process.dumpProcesses('child');
     */
    public static async dumpProcesses(filter: '' | 'system' | 'renweb' | 'child' = ''): Promise<Process[]> {
        const processes = decode(await BIND_dump_processes(encode(filter)));
        if (!Array.isArray(processes)) {
            return [];
        }
        return processes.filter(proc => typeof proc === "object" && proc?.pid != null).map(proc => new Process(
            proc.pid,
            proc.ppid,
            proc.name,
            proc.path,
            proc.args,
            proc.is_background_process,
            proc.is_running,
            proc.is_child,
            proc.exit_code,
            new Date(proc.started_at),
            proc.memory_kb,
            proc.threads,
            proc.url,
            proc.page,
            proc.renweb
        ));
    }
    
    /**
     * Gets information about the current process.
     * @returns Process instance representing the current process or null
     * @example
     * const current = await Process.dumpCurrentProcess();
     * console.log("Current PID:", current?.pid);
     */
    public static async dumpCurrentProcess(): Promise<Process | null> {
        const process = decode(await BIND_dump_current_process(null));
        if (typeof process === "object" && process?.pid != null) {
            return new Process(
                process.pid,
                process.ppid,
                process.name,
                process.path,
                process.args,
                process.is_background_process,
                process.is_running,
                process.is_child,
                process.exit_code,
                new Date(process.started_at),
                process.memory_kb,
                process.threads,
                process.url,
                process.page,
                process.renweb
            );
        }
        return null;
    }
    
    /**
     * Waits for all child processes to complete execution.
     * This will block until all child processes have exited.
     * @returns Promise that resolves when all child processes complete
     * @example
     * await Process.createWindow("page1");
     * await Process.createWindow("page2");
     * await Process.waitAll(); // Wait for both to finish
     */
    public static async waitAll(): Promise<void> {
        await BIND_wait_all(null);
    }

}

/**
 * Debug and developer tools functions.
 */
export namespace Debug {
    /**
     * Clears the browser console.
     * @returns Promise that resolves when console is cleared
     */
    export async function clearConsole(): Promise<void> 
        { await BIND_clear_console(null); }
    
    /**
     * Opens the developer tools panel.
     * @returns Promise that resolves when devtools are opened
     */
    export async function openDevtools(): Promise<void> 
        { await BIND_open_devtools(null); }
    
    /**
     * Closes the developer tools panel.
     * @returns Promise that resolves when devtools are closed
     */
    export async function closeDevtools(): Promise<void> 
        { await BIND_close_devtools(null); }
}

/**
 * Network status and loading information.
 */
export namespace Network {
    /**
     * Gets the current page load progress.
     * @returns Promise that resolves to progress value (0-100)
     */
    export async function getLoadProgress(): Promise<number> 
        { return await BIND_get_load_progress(null); }
    
    /**
     * Checks if a page is currently loading.
     * @returns Promise that resolves to true if loading
     */
    export async function isLoading(): Promise<boolean> 
        { return await BIND_is_loading(null); }
}

/**
 * Page navigation functions.
 */
export namespace Navigate {
    /**
     * Navigates back in browser history.
     * @returns Promise that resolves when navigation completes
     */
    export async function back(): Promise<void> 
        { await BIND_navigate_back(null); }
    
    /**
     * Navigates forward in browser history.
     * @returns Promise that resolves when navigation completes
     */
    export async function forward(): Promise<void> 
        { await BIND_navigate_forward(null); }
    
    /**
     * Stops the current page load.
     * @returns Promise that resolves when loading is stopped
     */
    export async function stopLoading(): Promise<void> 
        { await BIND_stop_loading(null); }
    
    /**
     * Checks if back navigation is possible.
     * @returns Promise that resolves to true if can go back
     */
    export async function canGoBack(): Promise<boolean> 
        { return await BIND_can_go_back(null); }
    
    /**
     * Checks if forward navigation is possible.
     * @returns Promise that resolves to true if can go forward
     */
    export async function canGoForward(): Promise<boolean> 
        { return await BIND_can_go_forward(null); }

    /**
     * Opens a URI depending on the type.
     * Some examples are file paths in the local filesystem, http/https links, mailto links, etc.
     * @returns Promise that resolves when the URI is opened
     */
    export async function openURI(uri: string): Promise<void> 
        { await BIND_open_uri(encode(uri)); }
}

/**
 * Plugins
 */
export namespace Plugins {
    /**
     * Gets list of plugins data
     * @returns Promise that resolves to an array of plugin data
     */
    export async function getPluginsList(): Promise<any[]> 
        { return decode(await BIND_get_plugins_list(null)); }
}

/* 
* -----------------------------------------------
* ------------------Declares---------------------
* -----------------------------------------------
*/ 

declare const BIND_get_size: (...args: any[]) => Promise<any>;
declare const BIND_set_size: (...args: any[]) => Promise<any>;
declare const BIND_get_position: (...args: any[]) => Promise<any>;
declare const BIND_set_position: (...args: any[]) => Promise<any>;
declare const BIND_get_title_bar: (...args: any[]) => Promise<any>;
declare const BIND_set_title_bar: (...args: any[]) => Promise<any>;
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

declare const BIND_is_focus: (...args: any[]) => Promise<any>;
declare const BIND_show: (...args: any[]) => Promise<any>;
declare const BIND_change_title: (...args: any[]) => Promise<any>;
declare const BIND_reset_title: (...args: any[]) => Promise<any>;
declare const BIND_current_title: (...args: any[]) => Promise<any>;
declare const BIND_reset_page: (...args: any[]) => Promise<any>;
declare const BIND_current_page: (...args: any[]) => Promise<any>;
declare const BIND_initial_page: (...args: any[]) => Promise<any>;
declare const BIND_reload_page: (...args: any[]) => Promise<any>;
declare const BIND_navigate_page: (...args: any[]) => Promise<any>;
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
declare const BIND_get_tmp_dir_path: (...args: any[]) => Promise<any>;
declare const BIND_download_uri: (...args: any[]) => Promise<any>;

declare const BIND_get_config: (...args: any[]) => Promise<any>;
declare const BIND_get_defaults: (...args: any[]) => Promise<any>;
declare const BIND_get_state: (...args: any[]) => Promise<any>;
declare const BIND_load_state: (...args: any[]) => Promise<any>;
declare const BIND_save_config: (...args: any[]) => Promise<any>;
declare const BIND_set_config_property: (...args: any[]) => Promise<any>;
declare const BIND_reset_to_defaults: (...args: any[]) => Promise<any>;

declare const BIND_get_pid: (...args: any[]) => Promise<any>;
declare const BIND_get_OS: (...args: any[]) => Promise<any>;

declare const BIND_create_window: (...args: any[]) => Promise<any>;
declare const BIND_create_process: (...args: any[]) => Promise<any>;
declare const BIND_dump_process: (...args: any[]) => Promise<any>;
declare const BIND_dump_current_process: (...args: any[]) => Promise<any>;
declare const BIND_dump_processes: (...args: any[]) => Promise<any>;
declare const BIND_kill_process: (...args: any[]) => Promise<any>;
declare const BIND_detach_process: (...args: any[]) => Promise<any>;
declare const BIND_send_message: (...args: any[]) => Promise<any>;
declare const BIND_listen_to_output: (...args: any[]) => Promise<any>;
declare const BIND_wait: (...args: any[]) => Promise<any>;
declare const BIND_wait_all: (...args: any[]) => Promise<any>;
declare const BIND_get_messages: (...args: any[]) => Promise<any>;

declare const BIND_clear_console: (...args: any[]) => Promise<any>;
declare const BIND_open_devtools: (...args: any[]) => Promise<any>;
declare const BIND_close_devtools: (...args: any[]) => Promise<any>;

declare const BIND_get_load_progress: (...args: any[]) => Promise<any>;
declare const BIND_is_loading: (...args: any[]) => Promise<any>;

declare const BIND_navigate_back: (...args: any[]) => Promise<any>;
declare const BIND_navigate_forward: (...args: any[]) => Promise<any>;
declare const BIND_stop_loading: (...args: any[]) => Promise<any>;
declare const BIND_can_go_back: (...args: any[]) => Promise<any>;
declare const BIND_can_go_forward: (...args: any[]) => Promise<any>;
declare const BIND_open_uri: (...args: any[]) => Promise<any>;

declare const BIND_get_plugins_list: (...args: any[]) => Promise<any>;