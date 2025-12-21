#include "web_server.hpp"
#include "webview.hpp"
#include "../include/app.hpp"


// #include "interfaces/Iroutine_manager.hpp"
#include "locate.hpp"
#include "logger.hpp"
#include "managers/process_manager.hpp"
#include "managers/daemon_manager.hpp"
#include "managers/pipe_manager.hpp"
#include "managers/signal_manager.hpp"
#include "info.hpp"
#include "webview/detail/platform/linux/webkitgtk/compat.hh"
#include <boost/json/object.hpp>
#include <boost/json/value.hpp>

#if defined(__linux__)
#include <dlfcn.h>
#include <iostream>
#endif

#if defined(_WIN32)
#include <windows.h>
#include <urlmon.h>
#include <shellapi.h>
#pragma comment(lib, "urlmon.lib")
#pragma comment(lib, "shell32.lib")
#endif

using namespace RenWeb;
using JSON = RenWeb::JSON;

void AppBuilder::validateOpt(const std::string& opt) {
    if (this->opts.find(opt) == this->opts.end()) {
        throw std::runtime_error("Option '" + opt + "' missing in opts!");
    }
}

AppBuilder::AppBuilder(
    const std::map<std::string, std::string>& opts, 
    int argc, 
    char** argv)
    : opts(opts), argc(argc), argv(argv)
{ }

AppBuilder* AppBuilder::withLogger(std::shared_ptr<ILogger> logger) {
    this->logger = logger;
    return this;
}

AppBuilder* AppBuilder::withInfo(std::unique_ptr<JSON> info) {
    this->info = std::move(info);
    return this;
}

AppBuilder* AppBuilder::withConfig(std::unique_ptr<Config> config) {
    this->config = std::move(config);
    return this;
}

AppBuilder* AppBuilder::withProcessManager(std::unique_ptr<IRoutineManager<std::string>> procm) {
    this->procm = std::move(procm);
    return this;
}

AppBuilder* AppBuilder::withDaemonManager(std::unique_ptr<IRoutineManager<std::string>> daem) {
    this->daem = std::move(daem);
    return this;
}

AppBuilder* AppBuilder::withPipeManager(std::unique_ptr<IRoutineManager<std::string>> pipem) {
    this->pipem = std::move(pipem);
    return this;
}

AppBuilder* AppBuilder::withSignalManager(std::unique_ptr<ISignalManager> signalm) {
    this->signalm = std::move(signalm);
    return this;
}

AppBuilder* AppBuilder::withWebview(std::unique_ptr<IWebview> w) {
    this->w = std::move(w);
    return this;
}

AppBuilder* AppBuilder::withWebServer(std::unique_ptr<IWebServer> ws) {
    this->ws = std::move(ws);
    return this;
}

AppBuilder* AppBuilder::withWindowFunctions(std::unique_ptr<WindowFunctions> fns) {
    this->fns = std::move(fns);
    return this;
}

void AppBuilder::performDependencyCheck() {
#if defined(__linux__)
    if (system("which gst-inspect-1.0 > /dev/null 2>&1") != 0) {
        this->logger->warn("gst-inspect-1.0 not found. GStreamer may not be installed.");
        this->logger->warn("HTML5 media playback will not work without GStreamer.");
        this->logger->warn("Installation guide: https://gstreamer.freedesktop.org/documentation/installing/on-linux.html");
    } else {
        if (system("gst-inspect-1.0 x264enc > /dev/null 2>&1") != 0) {
            this->logger->warn("GStreamer plugins-ugly not detected (MP3 codec support missing).");
            this->logger->warn("This package may have patent/licensing restrictions in some jurisdictions.");
            this->logger->warn("Install at your own discretion: https://gstreamer.freedesktop.org/documentation/installing/on-linux.html");
        }
    }
#elif defined(_WIN32)
    HKEY hKey;
    LONG result = RegOpenKeyExA(
        HKEY_LOCAL_MACHINE,
        "SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
        0,
        KEY_READ,
        &hKey
    );
    
    if (result != ERROR_SUCCESS) {
        this->logger->warn("WebView2 Runtime not found. Downloading installer...");
        
        // Download to temp directory
        char tempPath[MAX_PATH];
        GetTempPathA(MAX_PATH, tempPath);
        std::string installerPath = std::string(tempPath) + "MicrosoftEdgeWebview2Setup.exe";
        
        // Download bootstrapper (~2MB)
        HRESULT hr = URLDownloadToFileA(
            nullptr,
            "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
            installerPath.c_str(),
            0,
            nullptr
        );
        
        if (FAILED(hr)) {
            this->logger->error("Failed to download WebView2 installer.");
            this->logger->error("Please download manually: https://developer.microsoft.com/microsoft-edge/webview2/");
            throw std::runtime_error("WebView2 not installed");
        }
        
        this->logger->info("Download complete. Launching installer...");
        
        // Launch installer and wait for completion
        SHELLEXECUTEINFOA sei = { sizeof(sei) };
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.lpFile = installerPath.c_str();
        sei.nShow = SW_SHOW;
        
        if (!ShellExecuteExA(&sei) || !sei.hProcess) {
            DeleteFileA(installerPath.c_str());
            this->logger->error("Failed to launch WebView2 installer.");
            throw std::runtime_error("Failed to launch installer");
        }
        
        // Wait for installer to complete
        WaitForSingleObject(sei.hProcess, INFINITE);
        CloseHandle(sei.hProcess);
        
        // Clean up
        DeleteFileA(installerPath.c_str());
        
        this->logger->info("WebView2 installation complete. Continuing...");
    } else {
        RegCloseKey(hKey);
    }
#endif
}

std::unique_ptr<App> AppBuilder::build() {  
    auto app = std::unique_ptr<App>(new App());
    
    // Initialize orig_args first as it has no dependencies
    app->orig_args = (argc == 0)
        ? std::vector<std::string>({Locate::executable().string()})
        : std::vector<std::string>(this->argv, this->argv + this->argc);
    
    // Initialize logger (no dependencies)
    if (this->logger == nullptr) {      
        this->withLogger(std::make_unique<Logger>(std::make_unique<LogFlags>(LogFlags{
            .log_silent = opts.at("log_silent") == "true",
            .log_level = static_cast<spdlog::level::level_enum>(std::atoi(opts.at("log_level").c_str())),
            .log_clear = opts.at("log_clear") == "true"
        })));
        this->validateOpt("page");
        this->logger->refresh({
            {"page", opts.at("page")}
        });
    }
    app->logger = this->logger;
    
    // Check for required dependencies (requires logger)
    try {
        this->performDependencyCheck();
    } catch (const std::exception& e) {
        app->logger->critical(e.what());
        std::exit(1);
    }
    
    // Initialize info (requires logger)
    if (this->info == nullptr) {
        this->withInfo(std::make_unique<JSON>(
            this->logger, 
            Info::getInfoFile())
        );
    }
    app->info = std::move(this->info);
    
    // Initialize config (requires logger)
    if (this->config == nullptr) {
        this->validateOpt("page");
        this->withConfig(std::make_unique<Config>(
            this->logger,
            opts.at("page"),
            std::make_unique<File>(Locate::currentDirectory() / "config.json")
        ));
    }
    app->config = std::move(this->config);

    // Initialize managers (no dependencies on app members)
    if (this->procm == nullptr) {
        this->withProcessManager(std::make_unique<ProcessManager<std::string>>());
    }
    app->procm = std::move(this->procm);
    
    if (this->daem == nullptr) {
        this->withDaemonManager(std::make_unique<DaemonManager<std::string>>());
    }
    app->daem = std::move(this->daem);
    
    if (this->pipem == nullptr) {
        this->withPipeManager(std::make_unique<PipeManager<std::string>>());
    }
    app->pipem = std::move(this->pipem);

    // Initialize webview (no dependencies on app members)
    if (this->w == nullptr) {
        this->withWebview(std::make_unique<RenWeb::Webview>(false, nullptr));
    }
    app->w = std::move(this->w);
    
    // Initialize signal manager (requires app with logger, w)
    if (this->signalm == nullptr) {
        this->withSignalManager(std::make_unique<SignalManager>(app.get()));
    }
    app->signalm = std::move(this->signalm);

    // Initialize web server (requires app with logger, info, config)
    if (this->ws == nullptr) {
        this->validateOpt("ip");
        this->validateOpt("port");
        this->withWebServer(std::make_unique<WebServer>(
            app.get(),
            static_cast<unsigned short>(std::stoi(opts.at("port"))),
            opts.at("ip")
        ));
    }
    app->ws = std::move(this->ws);
    
    // Initialize window functions (requires app with all above members)
    if (this->fns == nullptr) {
        this->withWindowFunctions(std::make_unique<WindowFunctions>(app.get()));
    }
    app->fns = std::move(this->fns);

    return app;
}

// ============================================================================
// App Implementation
// ============================================================================

void App::processPermissions() {
#if defined(__linux__)
    auto widget_result = this->w->widget();
    if (!widget_result.has_value()) {
        this->logger->error("Failed to get webview widget for permission setup");
        return;
    }
    WebKitWebView* webview = WEBKIT_WEB_VIEW(widget_result.value());
    
    g_signal_connect_swapped(webview, "permission-request", G_CALLBACK(+[](App* app, WebKitPermissionRequest* request, WebKitWebView*) -> gboolean {
        const json::value& perms_from_info = app->info->getProperty("permissions");
        const json::object perms = (perms_from_info.is_object()) ? perms_from_info.as_object() : json::object{};
        
        auto check_permission = [&](const char* key, bool default_value) -> bool {
            return (perms.contains(key) && perms.at(key).is_bool())
                ? perms.at(key).as_bool()
                : default_value;
        };
        
        bool allowed = false;
        if (WEBKIT_IS_GEOLOCATION_PERMISSION_REQUEST(request)) {
            allowed = check_permission("geolocation", false);
            app->logger->info("Geolocation permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_IS_NOTIFICATION_PERMISSION_REQUEST(request)) {
            allowed = check_permission("notifications", true);
            app->logger->info("Notifications permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(request)) {
            allowed = check_permission("media_devices", false);
            app->logger->info("Media devices permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_IS_POINTER_LOCK_PERMISSION_REQUEST(request)) {
            allowed = check_permission("pointer_lock", false);
            app->logger->info("Pointer lock permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_INSTALL_MISSING_MEDIA_PLUGINS_PERMISSION_REQUEST(request)) {
            allowed = check_permission("install_missing_media_plugins", true);
            app->logger->info("Install missing media plugins permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_DEVICE_INFO_PERMISSION_REQUEST(request)) {
            allowed = check_permission("device_info", true);
            app->logger->info("Device info permission request: " + std::string(allowed ? "allowing" : "denying"));
        }
        
        allowed ? webkit_permission_request_allow(request) : webkit_permission_request_deny(request);
        return TRUE;
    }), this);
    
#elif defined(_WIN32)
    // Windows WebView2 permissions are handled via ICoreWebView2::add_PermissionRequested
    // TODO: Implement permission request handler
    this->logger->critical("Windows permission handling not yet implemented");
    
#elif defined(__APPLE__)
    // macOS WebKit permissions are handled via WKUIDelegate methods
    // TODO: Implement WKUIDelegate permission methods
    this->logger->critical("macOS permission handling not yet implemented");
#endif
    this->logger->info("Permissions have been set.");
}

void App::run() {
    this->processPermissions();
    this->ws->start();
    this->w->navigate(this->ws->getURL());
    this->fns->setState(this->config->getJson().is_object() ? this->config->getJson().as_object() : json::object{});
    this->w->dispatch([this](){
        const json::value& prop = this->config->getProperty("initially_shown");
        this->fns->window_callbacks->run(
            "show", 
            json::value((prop.is_bool()) ? (prop.as_bool()) : true)
        );
    });
    this->w->run();
}