import {
    sync, 
    Log, 
    FS,
    Misc,
    Page,
    System,
    Settings,
    General,
    Util
 } from '../../dist/lib/renweb/index.js'


document.addEventListener("keydown", async (e) => {
    if (e.ctrlKey) {
        if (e.key === 'q') {
            await Log.debug("CTRL + q was pressed.");
            await Page.terminate();
            return;
        } else if (e.key === 'r') {
            await Log.debug("CTRL + r was pressed.");
            await Page.reloadPage();
            return;
        } else if (e.key === 's') {
            await Log.debug("CTRL + s was pressed.");
            await Settings.setSettings();
            return;
        }
    }
});

console.log = (async (msg) => await Log.debug(msg));
window.onload = async () => {
    await Log.info("Window content has been loaded.");
    await Page.show(true);
}
document.querySelector(".log_trace").onclick = async () => {
    await Log.trace(document.querySelector(".log_msg").value);
};
document.querySelector(".log_debug").onclick = async () => {
    await Log.debug(document.querySelector(".log_msg").value);
};
document.querySelector(".log_info").onclick = () => {
    sync(Log.info(document.querySelector(".log_msg").value));
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
        document.querySelector(".read_file_output").textContent = Util.fromUint8array(contents);
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

document.querySelector(".choose_files").onclick = async () => {
    const dirs = document.querySelector(".dirs").checked;
    const multiple = document.querySelector(".multiple").checked;
    await Log.debug(`Opening file dialog...`);
    const files = await FS.chooseFiles(multiple, dirs);
    if (files == null) {
        document.querySelector(".choose_files").style.backgroundColor = "red";
        document.querySelector(".choose_files_output").textContent = "[ERROR] File dialog cancelled";
    } else {
        document.querySelector(".choose_files").style.backgroundColor = "green";
        if (files.length == 0) {
            document.querySelector(".choose_files_output").textContent = "empty";
            return;
        }
        let str = `Files chosen:\n`;
        for (const i of files) {
            str += ` ├─ ${i}\n`;
        }
        document.querySelector(".choose_files_output").textContent = str;
    }
};

document.querySelector(".is_focus").onclick = async () => {
    await Log.debug(`Is focus...`);
    const res = await Misc.isFocus();
    if (res) {
        document.querySelector(".is_focus").style.backgroundColor = "green";
    } else {
        document.querySelector(".is_focus").style.backgroundColor = "red";
    }
};

document.querySelector(".reset_title").onclick = async () => {
    await Log.debug(`Resetting Title...`);
    await Page.resetTitle();
};
document.querySelector(".change_title").onclick = async () => {
    await Log.debug(`Changing Title...`);
    const title = document.querySelector(".title_input").value;
    await Log.critical(title);
    await Page.changeTitle(title);
};
document.querySelector(".reload_page").onclick = async () => {
    await Log.debug(`Reloading page...`);
    await Page.reloadPage();
};
document.querySelector(".terminate").onclick = async () => {
    await Log.debug(`Terminating...`);
    await Page.terminate();
};
document.querySelector(".navigate_page").onclick = async () => {
    const page_name = document.querySelector(".page_input").value;
    await Log.debug(`Navigating to "${page_name}"`);
    Page.navigatePage(page_name);
};
document.querySelector(".open_uri").onclick = async () => {
    const uri = document.querySelector(".page_input").value;
    await Log.debug(`Opening uri "${uri}"`);
    Page.openURI(uri);
};
document.querySelector(".open_window").onclick = async () => {
    const window_name = document.querySelector(".page_input").value;
    const single = document.querySelector(".single").checked;
    await Log.debug(`Opening window "${window_name}"`);
    Page.openWindow(window_name, {single: single});
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
    await System.sendNotif("NOTIF 1", "I am a summary");
};
document.querySelector(".send_notif_2").onclick = async () => {
    await System.sendNotif("NOTIF 2", "This one has a custom icon", `${await Util.getApplicationDirPath()}/resource/test.png`);
};

document.querySelector(".get_config").onclick = async () => {
    await Log.debug(`Getting Config...`);
    const config = await Settings.getConfig();
    document.querySelector(".settings_output").textContent = JSON.stringify(config, null, 2);
};
document.querySelector(".save_config").onclick = async () => {
    await Log.debug(`Saving Config...`);
    await Settings.saveConfig();
    const config = await Settings.getSettings();
    document.querySelector(".settings_output").textContent = JSON.stringify(config, null, 2);
};
document.querySelector(".reset_settings_to_defaults").onclick = async () => {
    await Log.debug(`Resetting settings to defaults...`);
    await Settings.resetSettingsToDefaults();
};
document.querySelector(".set_config_property").onclick = async () => {
    await Log.debug(`Setting Config Property...`);
    const property = document.querySelector(".property_name").value;
    const value = document.querySelector(".property_value").value;
    await Log.info(`Setting property "${property}" to value "${value}"`);
    await Settings.setConfigProperty(property, value);
    const config = await Settings.getSettings();
    document.querySelector(".settings_output").textContent = JSON.stringify(config, null, 2);
};


document.querySelector(".get_size").onclick = async () => {
    await Log.debug(`Getting Size...`);
    const size = await General.getSize();
    Log.critical(JSON.stringify(size, null, 2));
    document.querySelector(".size_output").textContent = `Width: ${size.width}; Height: ${size.height}`;
};
document.querySelector(".set_size").onclick = async () => {
    await Log.debug(`Setting Size...`);
    const width = Number.parseInt(document.querySelector(".size_width").value, 10);
    const height = Number.parseInt(document.querySelector(".size_height").value, 10);
    await General.setSize(width, height);
    const size = await General.getSize();
    document.querySelector(".size_output").textContent = `Width: ${size.width}; Height: ${size.height}`;
};

document.querySelector(".get_position").onclick = async () => {
    await Log.debug(`Getting Position...`);
    const pos = await General.getPosition();
    document.querySelector(".position_output").textContent = `x: ${pos.x}; y: ${pos.y}`;
};
document.querySelector(".set_position").onclick = async () => {
    await Log.debug(`Setting Position...`);
    const x = Number.parseInt(document.querySelector(".position_x").value, 10);
    const y = Number.parseInt(document.querySelector(".position_y").value, 10);
    await General.setPosition(x, y);
    const pos = await General.getPosition();
    document.querySelector(".position_output").textContent = `x: ${pos.x}; y: ${pos.y}`;
};

document.querySelector(".get_decorated").onclick = async () => {
    await Log.debug(`Getting Decorated...`);
    const res = await General.getDecorated();
    if (res) {
        document.querySelector(".get_decorated").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_decorated").style.backgroundColor = "red";
    }
};
document.querySelector(".set_decorated").onclick = async () => {
    await Log.debug(`Setting Decorated...`);
    const decorated = document.querySelector(".is_decorated").checked;
    await General.setDecorated(decorated);
    const res = await General.getDecorated();
    if (res) {
        document.querySelector(".get_decorated").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_decorated").style.backgroundColor = "red";
    }
};

document.querySelector(".get_resizable").onclick = async () => {
    await Log.debug(`Getting Resizable...`);
    const res = await General.getResizable();
    if (res) {
        document.querySelector(".get_resizable").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_resizable").style.backgroundColor = "red";
    }
};
document.querySelector(".set_resizable").onclick = async () => {
    await Log.debug(`Setting Resizable...`);
    const resizable = document.querySelector(".is_resizable").checked;
    await General.setResizable(resizable);
    const res = await General.getResizable();
    if (res) {
        document.querySelector(".get_resizable").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_resizable").style.backgroundColor = "red";
    }
};

document.querySelector(".get_keepabove").onclick = async () => {
    await Log.debug(`Getting KeepAbove...`);
    const res = await General.getKeepAbove();
    if (res) {
        document.querySelector(".get_keepabove").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_keepabove").style.backgroundColor = "red";
    }
};
document.querySelector(".set_keepabove").onclick = async () => {
    await Log.debug(`Setting KeepAbove...`);
    const keepabove = document.querySelector(".is_keepabove").checked;
    await General.setKeepAbove(keepabove);
    const res = await General.getKeepAbove();
    if (res) {
        document.querySelector(".get_keepabove").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_keepabove").style.backgroundColor = "red";
    }
};

document.querySelector(".get_minimize").onclick = async () => {
    await Log.debug(`Getting minimize...`);
    const res = await General.getMinimize();
    if (res) {
        document.querySelector(".get_minimize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_minimize").style.backgroundColor = "red";
    }
};
document.querySelector(".set_minimize").onclick = async () => {
    await Log.debug(`Setting Minimize...`);
    const minimize = document.querySelector(".is_minimize").checked;
    await General.setMinimize(minimize);
    const res = await General.getKeepAbove();
    if (res) {
        document.querySelector(".get_minimize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_minimize").style.backgroundColor = "red";
    }
};

document.querySelector(".get_maximize").onclick = async () => {
    await Log.debug(`Getting maximize...`);
    const res = await General.getMaximize();
    if (res) {
        document.querySelector(".get_maximize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_maximize").style.backgroundColor = "red";
    }
};
document.querySelector(".set_maximize").onclick = async () => {
    await Log.debug(`Setting Minimize...`);
    const maximize = document.querySelector(".is_maximize").checked;
    await General.setMaximize(maximize);
    const res = await General.getMaximize();
    if (res) {
        document.querySelector(".get_maximize").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_maximize").style.backgroundColor = "red";
    }
};

document.querySelector(".get_fullscreen").onclick = async () => {
    await Log.debug(`Getting Fullscreen...`);
    const res = await General.getFullscreen();
    if (res) {
        document.querySelector(".get_fullscreen").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_fullscreen").style.backgroundColor = "red";
    }
};
document.querySelector(".set_fullscreen").onclick = async () => {
    await Log.debug(`Setting Fullscreen...`);
    const fullscreen = document.querySelector(".is_fullscreen").checked;
    await General.setFullscreen(fullscreen);
    const res = await General.getFullscreen();
    if (res) {
        document.querySelector(".get_fullscreen").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_fullscreen").style.backgroundColor = "red";
    }
};

document.querySelector(".get_taskbar_show").onclick = async () => {
    await Log.debug(`Getting Taskbar Show...`);
    const res = await General.getTaskbarShow();
    if (res) {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "red";
    }
};
document.querySelector(".set_taskbar_show").onclick = async () => {
    await Log.debug(`Setting Taskbar Show...`);
    const taskbkar_show = document.querySelector(".is_taskbar_show").checked;
    await General.setTaskbarShow(taskbkar_show);
    const res = await General.getTaskbarShow();
    if (res) {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "green";
    } else {
        document.querySelector(".get_taskbar_show").style.backgroundColor = "red";
    }
};

document.querySelector(".get_opacity").onclick = async () => {
    await Log.debug(`Getting Opacity...`);
    const opacity = await General.getOpacity();
    document.querySelector(".opacity_output").textContent = opacity.toFixed(2).toString();
};
document.querySelector(".set_opacity").onclick = async () => {
    await Log.debug(`Setting Opacity...`);
    const opacity = Number.parseFloat(document.querySelector(".opacity_input").value);
    await General.setOpacity(opacity);
    const res = await General.getOpacity();
    document.querySelector(".opacity_output").textContent = res.toFixed(2).toString();
};


// document.querySelector(".send_notif_1").onclick = async () => {
//     await Util.sendNotif("test body");
// };


// document.querySelector(".open_uri_1").onclick = async () => {
//     await Log.info(`Attempting to open "https://www.youtube.com/watch?v=dQw4w9WgXcQ"`);
//     await Util.openURI("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
// };

// document.querySelector(".open_uri_2").onclick = async () => {
//     await Log.info(`Attempting to open "file://${await Util.getApplicationDirPath()}/log.txt"`);
//     await Util.openURI(`file://${await Util.getApplicationDirPath()}/log.txt`);
// };

// document.querySelector(".open_uri_3").onclick = async () => {
//     await Log.info(`Attempting to open "${await Util.getApplicationDirPath()}/log.txt"`);
//     await Util.openURI(`${await Util.getApplicationDirPath()}/log.txt`);
// };
// // Anything with paths needs to figure out the path as an array rather than a string to provide the appropriate log
// // 1) change everything with strings to do the array bs
// // 2) add C++ path checker for all paths
// document.querySelector(".open_uri_4").onclick = async () => {
//     await Log.info(`Attempting to open "${await Util.getApplicationDirPath()}"`);
//     await Util.openURI(`${await Util.getApplicationDirPath()}`);
// };



(async () => {
    const path = await FS.getApplicationDirPath();
    document.querySelector(".read_file_msg").value = path;
    document.querySelector(".write_file_msg").value = path;
    document.querySelector(".new_file_msg").value = path;
    document.querySelector(".read_file_msg").value = path;
    // await getSettings();
})();