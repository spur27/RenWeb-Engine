// ===========================================
// Template JSON Data
// ===========================================
// This file contains JSON template data used for documentation examples.
// These are displayed on the downloads page as examples for users to reference.

const INFO_JSON = {
  "title": "RenWeb",
  "version": "0.0.5",
  "author": "Spur27",
  "description": "Base RenWeb engine",
  "license": "BSL",
  "repository": "https://github.com/spur27/RenWeb-Engine",
  "categories": ["Utility"],
  "copyright": "Copyright © 2025 Spur27",
  "app_id": "io.github.spur27.renweb-engine",
  "starting_pages": ["test"],
  "permissions": {
    "geolocation": false,
    "notifications": true,
    "media_devices": false,
    "pointer_lock": false,
    "install_missing_media_plugins": true,
    "device_info": true
  },
  "pkg_id": "renweb",
  "startup_notify": false,
  "origins": [
    "https://example.one",
    "http://example.two/sequel"
  ],
  "server": {
    "ip": "127.0.0.1",
    "port": 8270,
    "https": false,
    "ssl_cert_path": "/absolute/path/example",
    "ssl_key_path": "./relative/path/example"
  }
};

const INFO_MINIMUM_JSON = {
  "title": "My App",
  "version": "1.0.0",
  "starting_pages": ["index"]
};

const CONFIG_JSON = {
  "__defaults__": {
    "title_bar": true,
    "size": {
      "width": 800,
      "height": 600
    },
    "resizable": true,
    "opacity": 1.0
  },
  "test": {
    "title_bar": true,
    "size": {
      "width": 720,
      "height": 480
    },
    "position": {
      "x": 100,
      "y": 100
    },
    "keepabove": false,
    "resizable": true,
    "minimize": false,
    "maximize": false,
    "fullscreen": false,
    "taskbar_show": true,
    "opacity": 1.0,
    "initially_shown": true,
    "title": "RenWeb"
  }
};

// Helper functions to fetch the template data
function fetchInfoJson() {
    return Promise.resolve(INFO_JSON);
}

function fetchInfoMinJson() {
    return Promise.resolve(INFO_MINIMUM_JSON);
}

function fetchConfigJson() {
    return Promise.resolve(CONFIG_JSON);
}

// Download functions to create and trigger JSON file downloads

/**
 * Generic function to download JSON data as a file
 * @param {Object} jsonData - The JSON object to download
 * @param {string} filename - The filename for the download
 */
function downloadJsonFile(jsonData, filename) {
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Specific download functions using the generic function
function downloadInfoJson() {
    downloadJsonFile(INFO_JSON, 'info.json');
}

function downloadInfoMinimumJson() {
    downloadJsonFile(INFO_MINIMUM_JSON, 'info.json');
}

function downloadConfigJson() {
    downloadJsonFile(CONFIG_JSON, 'config.json');
}