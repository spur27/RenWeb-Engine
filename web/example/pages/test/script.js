import {
    Log, 
    FS,
    Window,
    System,
    Config,
    Properties,
    Process,
    Signal,
    Debug,
    Network,
    Navigate
 } from './index.js';


document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey) {
        if (e.key === 'q') {
            await Log.debug("CTRL + q was pressed.");
            await Window.terminate();
            return;
        } else if (e.key === 'r') {
            await Log.debug("CTRL + r was pressed.");
            await Window.reloadPage();
            return;
        } else if (e.key === 's') {
            await Log.debug("CTRL + s was pressed.");
            await Config.saveConfig();
            return;
        } else if (e.key === 'i') {
            await Log.debug("CTRL + i was pressed.");
            await Debug.openDevtools();
        }
    }
});

console.log = (async (msg) => await Log.debug(msg));
window.onload = async () => {
    await Log.info("Window content has been loaded.");
    await Window.resetTitle();
    await Window.show(true);
    
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
        await Notification.requestPermission();
        await Log.info("Notification permission: " + Notification.permission);
    }
}
document.querySelector(".log_trace").onclick = async () => {
    await Log.trace(document.querySelector(".log_msg").value);
};
document.querySelector(".log_debug").onclick = async () => {
    await Log.debug(document.querySelector(".log_msg").value);
};
document.querySelector(".log_info").onclick = async () => {
    await Log.info(document.querySelector(".log_msg").value);
};
document.querySelector(".log_warn").onclick = async () => {
    await Log.warn(document.querySelector(".log_msg").value);
};
document.querySelector(".log_error").onclick = async () => {
    await Log.error(document.querySelector(".log_msg").value);
};
document.querySelector(".log_critical").onclick = async () => {
    await Log.critical(document.querySelector(".log_msg").value);
};

document.querySelector(".read_file").onclick = async () => {
    const filename = document.querySelector(".read_file_msg").value;
    await Log.debug(`Reading file "${filename}"`);
    const contents = await FS.readFile(filename);
    if (contents == null) {
        document.querySelector(".read_file").style.backgroundColor = "red";
        document.querySelector(".read_file_output").textContent = "[ERROR] file either doesn't exist or can't be opened";
    } else {
        document.querySelector(".read_file").style.backgroundColor = "green";
        document.querySelector(".read_file_output").textContent = contents;
    }
};

document.querySelector(".write_file").onclick = async () => {
    const filename = document.querySelector(".write_file_msg").value;
    await Log.debug(`Writing to file "${filename}"`);
    const contents = document.querySelector(".write_file_input").value;
    const append = document.querySelector(".append").checked;
    const res = await FS.writeFile(filename, contents, {append: append});
    if (res) {
        document.querySelector(".write_file").style.backgroundColor = "green";
    } else {
        document.querySelector(".write_file").style.backgroundColor = "red";
    }
};


document.querySelector(".exists_file").onclick = async () => {
    const filename = document.querySelector(".write_file_msg").value;
    await Log.debug(`Does file/dir "${filename}" exist?`);
    const res = await FS.exists(filename);
    if (res) {
        document.querySelector(".exists_file").style.backgroundColor = "green";
    } else {
        document.querySelector(".exists_file").style.backgroundColor = "red";
    }
};

document.querySelector(".remove_file").onclick = async () => {
    const filename = document.querySelector(".write_file_msg").value;
    await Log.debug(`Removing file "${filename}"`);
    const recursive = document.querySelector(".recursive").checked;
    const res = await FS.rm(filename, {recursive: recursive});
    if (res) {
        document.querySelector(".remove_file").style.backgroundColor = "green";
    } else {
        document.querySelector(".remove_file").style.backgroundColor = "red";
    }

};

document.querySelector(".is_dir").onclick = async () => {
    const filename = document.querySelector(".write_file_msg").value;
    await Log.debug(`Is "${filename}" a dir?`);
    const res = await FS.isDir(filename);
    if (res) {
        document.querySelector(".is_dir").style.backgroundColor = "green";
    } else {
        document.querySelector(".is_dir").style.backgroundColor = "red";
    }
};

document.querySelector(".mk_dir").onclick = async () => {
    const filename = document.querySelector(".write_file_msg").value;
    await Log.debug(`Making dir "${filename}"`);
    const res = await FS.mkDir(filename);
    if (res) {
        document.querySelector(".mk_dir").style.backgroundColor = "green";
    } else {
        document.querySelector(".mk_dir").style.backgroundColor = "red";
    }
};

document.querySelector(".ls_dir").onclick = async () => {
    const filename = document.querySelector(".write_file_msg").value;
    await Log.debug(`Listing dir "${filename}"`);
    const dirs = await FS.ls(filename);
    if (dirs == null) {
        document.querySelector(".ls_dir").style.backgroundColor = "red";
        document.querySelector(".ls_dir_output").textContent = "[ERROR] dir listed either doesn't exist or isn't a dir";
    } else {
        document.querySelector(".ls_dir").style.backgroundColor = "green";
        if (dirs.length == 0) {
            document.querySelector(".ls_dir_output").textContent = "empty";
            return;
        }
        let str = (filename.endsWith("/")) ? `${filename}\n` : `${filename}\\\n`;
        for (const i of dirs) {
            str += ` ├─ ${i}\n`;
        }
        document.querySelector(".ls_dir_output").textContent = str;
    }
};

document.querySelector(".rename_file").onclick = async () => {
    const orig_filename = document.querySelector(".write_file_msg").value;
    const new_filename = document.querySelector(".new_file_msg").value;
    const overwrite = document.querySelector(".overwrite").checked;
    await Log.debug(`Renaming to "${new_filename}"`);
    const res = await FS.rename(orig_filename, new_filename, {overwrite: overwrite});
    if (res) {
        document.querySelector(".rename_file").style.backgroundColor = "green";
    } else {
        document.querySelector(".rename_file").style.backgroundColor = "red";
    }
};

document.querySelector(".copy_file").onclick = async () => {
    const orig_filename = document.querySelector(".write_file_msg").value;
    const new_filename = document.querySelector(".new_file_msg").value;
    const overwrite = document.querySelector(".overwrite").checked;
    await Log.debug(`Copying to to "${new_filename}"`);
    const res = await FS.copy(orig_filename, new_filename, {overwrite: overwrite});
    if (res) {
        document.querySelector(".copy_file").style.backgroundColor = "green";
    } else {
        document.querySelector(".copy_file").style.backgroundColor = "red";
    }
};

document.querySelector(".choose_files_input").onchange = async () => {
    const files = document.querySelector(".choose_files_input").files;
    const multiple = document.querySelector(".multiple").checked;
    
    // Update multiple attribute based on checkbox
    document.querySelector(".choose_files_input").multiple = multiple;
    
    await Log.debug(`Files chosen: ${files.length}`);
    
    if (files.length > 0) {
        let fileList = Array.from(files).map(f => f.name).join(", ");
        document.querySelector(".choose_files_output").textContent = `Selected: ${fileList}`;
    } else {
        document.querySelector(".choose_files_output").textContent = "No files selected";
    }
};

// Update multiple attribute when checkbox changes
document.querySelector(".multiple").onchange = () => {
    const multiple = document.querySelector(".multiple").checked;
    document.querySelector(".choose_files_input").multiple = multiple;
};

document.querySelector(".is_focus").onclick = async () => {
    await Log.debug(`Is focus...`);
    const res = await Window.isFocus();
    if (res) {
        document.querySelector(".is_focus").style.backgroundColor = "green";
    } else {
        document.querySelector(".is_focus").style.backgroundColor = "red";
    }
};

document.querySelector(".print_page").onclick = async () => {
    await Log.debug(`Printing page...`);
    await Window.printPage();
};

document.querySelector(".start_window_drag").onmousedown = async () => {
    await Log.debug(`Starting window drag...`);
    await Window.startWindowDrag();
};

document.querySelector(".zoom_in").onclick = async () => {
    await Log.debug(`Zooming in...`);
    await Window.zoomIn();
    const level = await Window.getZoomLevel();
    document.querySelector(".zoom_output").textContent = level.toFixed(2);
};

document.querySelector(".zoom_out").onclick = async () => {
    await Log.debug(`Zooming out...`);
    await Window.zoomOut();
    const level = await Window.getZoomLevel();
    document.querySelector(".zoom_output").textContent = level.toFixed(2);
};

document.querySelector(".zoom_reset").onclick = async () => {
    await Log.debug(`Resetting zoom...`);
    await Window.zoomReset();
    const level = await Window.getZoomLevel();
    document.querySelector(".zoom_output").textContent = level.toFixed(2);
};

document.querySelector(".get_zoom_level").onclick = async () => {
    await Log.debug(`Getting zoom level...`);
    const level = await Window.getZoomLevel();
    document.querySelector(".zoom_output").textContent = level.toFixed(2);
};

document.querySelector(".set_zoom_level").onclick = async () => {
    await Log.debug(`Setting zoom level...`);
    const level = Number.parseFloat(document.querySelector(".zoom_input").value);
    await Window.setZoomLevel(level);
    const newLevel = await Window.getZoomLevel();
    document.querySelector(".zoom_output").textContent = newLevel.toFixed(2);
};

document.querySelector(".find_in_page").onclick = async () => {
    const text = document.querySelector(".find_text").value;
    await Log.debug(`Finding "${text}" in page...`);
    await Window.findInPage(text);
};

document.querySelector(".find_next").onclick = async () => {
    await Log.debug(`Finding next...`);
    await Window.findNext();
};

document.querySelector(".find_previous").onclick = async () => {
    await Log.debug(`Finding previous...`);
    await Window.findPrevious();
};

document.querySelector(".clear_find").onclick = async () => {
    await Log.debug(`Clearing find...`);
    await Window.clearFind();
};

document.querySelector(".navigate_back").onclick = async () => {
    await Log.debug(`Navigating back...`);
    await Navigate.back();
};

document.querySelector(".navigate_forward").onclick = async () => {
    await Log.debug(`Navigating forward...`);
    await Navigate.forward();
};

document.querySelector(".stop_loading").onclick = async () => {
    await Log.debug(`Stopping page load...`);
    await Navigate.stopLoading();
};

document.querySelector(".can_go_back").onclick = async () => {
    await Log.debug(`Checking if can go back...`);
    const res = await Navigate.canGoBack();
    if (res) {
        document.querySelector(".can_go_back").style.backgroundColor = "green";
    } else {
        document.querySelector(".can_go_back").style.backgroundColor = "red";
    }
};

document.querySelector(".can_go_forward").onclick = async () => {
    await Log.debug(`Checking if can go forward...`);
    const res = await Navigate.canGoForward();
    if (res) {
        document.querySelector(".can_go_forward").style.backgroundColor = "green";
    } else {
        document.querySelector(".can_go_forward").style.backgroundColor = "red";
    }
};

document.querySelector(".get_load_progress").onclick = async () => {
    await Log.debug(`Getting load progress...`);
    const progress = await Network.getLoadProgress();
    document.querySelector(".load_progress_output").textContent = (progress * 100).toFixed(1) + "%";
};

document.querySelector(".is_loading").onclick = async () => {
    await Log.debug(`Checking if loading...`);
    const res = await Network.isLoading();
    if (res) {
        document.querySelector(".is_loading").style.backgroundColor = "green";
    } else {
        document.querySelector(".is_loading").style.backgroundColor = "red";
    }
};

document.querySelector(".open_devtools").onclick = async () => {
    await Log.debug(`Opening devtools...`);
    await Debug.openDevtools();
};

document.querySelector(".close_devtools").onclick = async () => {
    await Log.debug(`Closing devtools...`);
    await Debug.closeDevtools();
};

document.querySelector(".clear_console").onclick = async () => {
    await Log.debug(`Clearing console...`);
    await Debug.clearConsole();
};

document.querySelector(".reset_title").onclick = async () => {
    await Log.debug(`Resetting Title...`);
    await Window.resetTitle();
};
document.querySelector(".change_title").onclick = async () => {
    await Log.debug(`Changing Title...`);
    const title = document.querySelector(".title_input").value;
    await Log.critical(title);
    await Window.changeTitle(title);
};
document.querySelector(".reload_page").onclick = async () => {
    await Log.debug(`Reloading page...`);
    await Window.reloadPage();
};
document.querySelector(".terminate").onclick = async () => {
    await Log.debug(`Terminating...`);
    await Window.terminate();
};
document.querySelector(".navigate_page").onclick = async () => {
    const page_name = document.querySelector(".page_input").value;
    await Log.debug(`Navigating to "${page_name}"`);
    await Log.warn("navigate_page not in new API, use browser back/forward instead");
};
document.querySelector(".open_uri").onclick = async () => {
    const uri = document.querySelector(".page_input").value;
    await Log.debug(`Opening uri "${uri}"`);
    await Process.openUri(uri);
};
document.querySelector(".open_window").onclick = async () => {
    const window_name = document.querySelector(".page_input").value;
    const single = document.querySelector(".single").checked;
    await Log.debug(`Opening window "${window_name}"`);
    await Process.openWindow(window_name, single);
};

document.querySelector(".get_pid").onclick = async () => {
    await Log.debug(`Getting PID...`);
    const pid = await System.getPID();
    document.querySelector(".systems_output").textContent = `PID is ${pid}`;
};
document.querySelector(".get_os").onclick = async () => {
    await Log.debug(`Getting OS...`);
    const os = await System.getOS();
    document.querySelector(".systems_output").textContent = `OS is ${os}`;
};

document.querySelector(".send_notif_1").onclick = async () => {
    await Log.debug("Sending notification 1...");
    
    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            new Notification("RenWeb Notification", {
                body: "This is a simple notification from RenWeb!",
                icon: "../../assets/creature.png"
            });
        } else if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                new Notification("RenWeb Notification", {
                    body: "This is a simple notification from RenWeb!",
                    icon: "../../assets/creature.png"
                });
            }
        } else {
            await Log.warn("Notification permission denied");
        }
    } else {
        await Log.error("Notifications not supported in this browser");
    }
};

document.querySelector(".send_notif_2").onclick = async () => {
    await Log.debug("Sending notification 2 with actions...");
    
    if ("Notification" in window) {
        if (Notification.permission === "granted") {
            const notif = new Notification("RenWeb Action Notification", {
                body: "This notification has a longer message and demonstrates the browser notification API in action. Click me!",
                icon: "../../assets/seal1.png",
                requireInteraction: false,
                tag: "renweb-notif-2"
            });
            
            notif.onclick = async () => {
                await Log.info("Notification clicked!");
                notif.close();
            };
        } else if (Notification.permission !== "denied") {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
                const notif = new Notification("RenWeb Action Notification", {
                    body: "This notification has a longer message and demonstrates the browser notification API in action. Click me!",
                    icon: "../../assets/seal1.png",
                    requireInteraction: false,
                    tag: "renweb-notif-2"
                });
                
                notif.onclick = async () => {
                    await Log.info("Notification clicked!");
                    notif.close();
                };
            }
        } else {
            await Log.warn("Notification permission denied");
        }
    } else {
        await Log.error("Notifications not supported in this browser");
    }
};

document.querySelector(".get_config").onclick = async () => {
    await Log.debug(`Getting Config...`);
    const config = await Config.getConfig();
    document.querySelector(".settings_output").textContent = JSON.stringify(config, null, 2);
};
document.querySelector(".save_config").onclick = async () => {
    await Log.debug(`Saving Config...`);
    await Config.saveConfig();
    const config = await Config.getConfig();
    document.querySelector(".settings_output").textContent = JSON.stringify(config, null, 2);
};
document.querySelector(".reset_settings_to_defaults").onclick = async () => {
    await Log.debug(`Resetting settings to defaults...`);
    await Config.resetToDefaults();
};
document.querySelector(".set_config_property").onclick = async () => {
    await Log.debug(`Setting Config Property...`);
    const property = document.querySelector(".property_name").value;
    const value = document.querySelector(".property_value").value;
    await Log.info(`Setting property "${property}" to value "${value}"`);
    await Config.setConfigProperty(property, value);
    const config = await Config.getConfig();
    document.querySelector(".settings_output").textContent = JSON.stringify(config, null, 2);
};


document.querySelector(".get_size").onclick = async () => {
    await Log.debug(`Getting Size...`);
    const size = await Properties.getSize();
    Log.critical(JSON.stringify(size, null, 2));
    document.querySelector(".size_output").textContent = `Width: ${size.width}; Height: ${size.height}`;
};
document.querySelector(".set_size").onclick = async () => {
    await Log.debug(`Setting Size...`);
    const width = Number.parseInt(document.querySelector(".size_width").value, 10);
    const height = Number.parseInt(document.querySelector(".size_height").value, 10);
    await Properties.setSize(width, height);
    const size = await Properties.getSize();
    document.querySelector(".size_output").textContent = `Width: ${size.width}; Height: ${size.height}`;
};

document.querySelector(".get_position").onclick = async () => {
    await Log.debug(`Getting Position...`);
    const pos = await Properties.getPosition();
    document.querySelector(".position_output").textContent = `x: ${pos.x}; y: ${pos.y}`;
};
document.querySelector(".set_position").onclick = async () => {
    await Log.debug(`Setting Position...`);
    const x = Number.parseInt(document.querySelector(".position_x").value, 10);
    const y = Number.parseInt(document.querySelector(".position_y").value, 10);
    await Properties.setPosition(x, y);
    const pos = await Properties.getPosition();
    document.querySelector(".position_output").textContent = `x: ${pos.x}; y: ${pos.y}`;
};

document.querySelector(".get_decorated").onclick = async () => {
    await Log.debug(`Getting Decorated...`);
    const res = await Properties.getDecorated();
    if (res) {
        document.querySelector(".get_decorated").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_decorated").style.backgroundColor = "red";
    }
};
document.querySelector(".set_decorated").onclick = async () => {
    await Log.debug(`Setting Decorated...`);
    const decorated = document.querySelector(".is_decorated").checked;
    await Properties.setDecorated(decorated);
    const res = await Properties.getDecorated();
    if (res) {
        document.querySelector(".get_decorated").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_decorated").style.backgroundColor = "red";
    }
};

document.querySelector(".get_resizable").onclick = async () => {
    await Log.debug(`Getting Resizable...`);
    const res = await Properties.getResizable();
    if (res) {
        document.querySelector(".get_resizable").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_resizable").style.backgroundColor = "red";
    }
};
document.querySelector(".set_resizable").onclick = async () => {
    await Log.debug(`Setting Resizable...`);
    const resizable = document.querySelector(".is_resizable").checked;
    await Properties.setResizable(resizable);
    const res = await Properties.getResizable();
    if (res) {
        document.querySelector(".get_resizable").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_resizable").style.backgroundColor = "red";
    }
};

document.querySelector(".get_keepabove").onclick = async () => {
    await Log.debug(`Getting KeepAbove...`);
    const res = await Properties.getKeepAbove();
    if (res) {
        document.querySelector(".get_keepabove").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_keepabove").style.backgroundColor = "red";
    }
};
document.querySelector(".set_keepabove").onclick = async () => {
    await Log.debug(`Setting KeepAbove...`);
    const keepabove = document.querySelector(".is_keepabove").checked;
    await Properties.setKeepAbove(keepabove);
    const res = await Properties.getKeepAbove();
    if (res) {
        document.querySelector(".get_keepabove").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_keepabove").style.backgroundColor = "red";
    }
};

document.querySelector(".get_minimize").onclick = async () => {
    await Log.debug(`Getting minimize...`);
    const res = await Properties.getMinimize();
    if (res) {
        document.querySelector(".get_minimize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_minimize").style.backgroundColor = "red";
    }
};
document.querySelector(".set_minimize").onclick = async () => {
    await Log.debug(`Setting Minimize...`);
    const minimize = document.querySelector(".is_minimize").checked;
    await Properties.setMinimize(minimize);
    const res = await Properties.getMinimize();
    if (res) {
        document.querySelector(".get_minimize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_minimize").style.backgroundColor = "red";
    }
};

document.querySelector(".get_maximize").onclick = async () => {
    await Log.debug(`Getting maximize...`);
    const res = await Properties.getMaximize();
    if (res) {
        document.querySelector(".get_maximize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_maximize").style.backgroundColor = "red";
    }
};
document.querySelector(".set_maximize").onclick = async () => {
    await Log.debug(`Setting Maximize...`);
    const maximize = document.querySelector(".is_maximize").checked;
    await Properties.setMaximize(maximize);
    const res = await Properties.getMaximize();
    if (res) {
        document.querySelector(".get_maximize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_maximize").style.backgroundColor = "red";
    }
};

document.querySelector(".get_fullscreen").onclick = async () => {
    await Log.debug(`Getting Fullscreen...`);
    const res = await Properties.getFullscreen();
    if (res) {
        document.querySelector(".get_fullscreen").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_fullscreen").style.backgroundColor = "red";
    }
};
document.querySelector(".set_fullscreen").onclick = async () => {
    await Log.debug(`Setting Fullscreen...`);
    const fullscreen = document.querySelector(".is_fullscreen").checked;
    await Properties.setFullscreen(fullscreen);
    const res = await Properties.getFullscreen();
    if (res) {
        document.querySelector(".get_fullscreen").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_fullscreen").style.backgroundColor = "red";
    }
};

document.querySelector(".get_taskbar_show").onclick = async () => {
    await Log.debug(`Getting Taskbar Show...`);
    const res = await Properties.getTaskbarShow();
    if (res) {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "red";
    }
};
document.querySelector(".set_taskbar_show").onclick = async () => {
    await Log.debug(`Setting Taskbar Show...`);
    const taskbar_show = document.querySelector(".is_taskbar_show").checked;
    await Properties.setTaskbarShow(taskbar_show);
    const res = await Properties.getTaskbarShow();
    if (res) {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "red";
    }
};

document.querySelector(".get_opacity").onclick = async () => {
    await Log.debug(`Getting Opacity...`);
    const opacity = await Properties.getOpacity();
    document.querySelector(".opacity_output").textContent = opacity.toFixed(2).toString();
};
document.querySelector(".set_opacity").onclick = async () => {
    await Log.debug(`Setting Opacity...`);
    const opacity = Number.parseFloat(document.querySelector(".opacity_input").value);
    await Properties.setOpacity(opacity);
    const res = await Properties.getOpacity();
    document.querySelector(".opacity_output").textContent = res.toFixed(2).toString();
};


(async () => {
    const path = await FS.getApplicationDirPath();
    document.querySelector(".read_file_msg").value = path;
    document.querySelector(".write_file_msg").value = path;
    document.querySelector(".new_file_msg").value = path;
    document.querySelector(".read_file_msg").value = path;
})();

// Video debugging
const video = document.getElementById('test-video');
const debugDiv = document.getElementById('video-debug');

function updateDebug() {
    const info = `
        Duration: ${video.duration.toFixed(2)}s | 
        Current: ${video.currentTime.toFixed(2)}s | 
        Seekable: ${video.seekable.length > 0 ? 'YES' : 'NO'} | 
        ReadyState: ${video.readyState} | 
        NetworkState: ${video.networkState} | 
        Error: ${video.error ? video.error.message : 'none'}
    `;
    debugDiv.textContent = info;
}

video.addEventListener('loadedmetadata', async () => {
    await Log.info('Video metadata loaded');
    updateDebug();
});

video.addEventListener('canplay', async () => {
    await Log.info('Video can play');
    updateDebug();
});

video.addEventListener('seeking', async () => {
    await Log.info('Video seeking to ' + video.currentTime);
    updateDebug();
});

video.addEventListener('seeked', async () => {
    await Log.info('Video seeked to ' + video.currentTime);
    updateDebug();
});

video.addEventListener('error', async (e) => {
    await Log.error('Video error: ' + (video.error ? video.error.message : 'unknown'));
    updateDebug();
});

setInterval(updateDebug, 1000);
