#include "../include/app.hpp"

#include "../include/web_server.hpp"
#include "../include/webview.hpp"
#include "../include/locate.hpp"
#include "../include/logger.hpp"
#include "../include/managers/process_manager.hpp"
#include "../include/managers/daemon_manager.hpp"
#include "../include/managers/pipe_manager.hpp"
#include "../include/managers/signal_manager.hpp"
#include "../include/info.hpp"
#include "webview/detail/platform/linux/webkitgtk/compat.hh"
#include <boost/json/object.hpp>
#include <boost/json/value.hpp>

#if defined(__linux__)
#include <dlfcn.h>
#include <iostream>
#endif

#if defined(__APPLE__)
#include <objc/message.h>
#endif

#if defined(_WIN32)
#include <windows.h>
#include <urlmon.h>
#include <shellapi.h>
#pragma comment(lib, "urlmon.lib")
#pragma comment(lib, "shell32.lib")
#endif

#if defined(__APPLE__)
#import <Foundation/Foundation.h>
#import <objc/runtime.h>
#import <objc/message.h>
#endif

using namespace RenWeb;
using JSON = RenWeb::JSON;

void AppBuilder::validateOpt(const std::string& opt) {
    if (this->opts.find(opt) == this->opts.end()) {
        throw std::runtime_error("[app builder] Option '" + opt + "' missing in opts!");
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
        this->logger->warn("[app] gst-inspect-1.0 not found. GStreamer may not be installed.");
        this->logger->warn("[app] HTML5 media playback will not work without GStreamer.");
        this->logger->warn("[app] Installation guide: https://gstreamer.freedesktop.org/documentation/installing/on-linux.html");
    } else {
        if (system("gst-inspect-1.0 x264enc > /dev/null 2>&1") != 0) {
            this->logger->warn("[app] GStreamer plugins-ugly not detected (MP3 codec support missing).");
            this->logger->warn("[app] This package may have patent/licensing restrictions in some jurisdictions.");
            this->logger->warn("[app] Install at your own discretion: https://gstreamer.freedesktop.org/documentation/installing/on-linux.html");
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
        this->logger->warn("[app] WebView2 Runtime not found. Downloading installer...");
        
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
            this->logger->error("[app] Failed to download WebView2 installer.");
            this->logger->error("[app] Please download manually: https://developer.microsoft.com/microsoft-edge/webview2/");
            throw std::runtime_error("[app] WebView2 not installed");
        }

        this->logger->info("[app] Download complete. Launching installer...");
        
        // Launch installer and wait for completion
        SHELLEXECUTEINFOA sei = { sizeof(sei) };
        sei.fMask = SEE_MASK_NOCLOSEPROCESS;
        sei.lpFile = installerPath.c_str();
        sei.nShow = SW_SHOW;
        
        if (!ShellExecuteExA(&sei) || !sei.hProcess) {
            DeleteFileA(installerPath.c_str());
            this->logger->error("[app] Failed to launch WebView2 installer.");
            throw std::runtime_error("[app] Failed to launch installer");
        }
        
        // Wait for installer to complete
        WaitForSingleObject(sei.hProcess, INFINITE);
        CloseHandle(sei.hProcess);
        
        // Clean up
        DeleteFileA(installerPath.c_str());

        this->logger->info("[app] WebView2 installation complete. Continuing...");
    } else {
        RegCloseKey(hKey);
    }
#endif
}

std::unique_ptr<App> AppBuilder::build() {      
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

    auto app = std::unique_ptr<App>(new App(this->logger));
    app->orig_args = (argc == 0)
        ? std::vector<std::string>({Locate::executable().string()})
        : std::vector<std::string>(this->argv, this->argv + this->argc);
    
    try {
        this->performDependencyCheck();
    } catch (const std::exception& e) {
        this->logger->critical("[app] " + std::string(e.what()));
        std::exit(1);
    }
    
    if (this->info == nullptr) {
        this->withInfo(std::make_unique<JSON>(
            this->logger, 
            Info::getInfoFile())
        );
    }
    app->info = std::move(this->info);
    
    if (this->config == nullptr) {
        this->validateOpt("page");
        this->withConfig(std::make_unique<Config>(
            this->logger,
            opts.at("page"),
            std::make_unique<File>(Locate::currentDirectory() / "config.json")
        ));
    }
    app->config = std::move(this->config);

    if (this->procm == nullptr) {
        this->withProcessManager(std::make_unique<ProcessManager<std::string>>(this->logger));
    }
    app->procm = std::move(this->procm);
    
    if (this->daem == nullptr) {
        this->withDaemonManager(std::make_unique<DaemonManager<std::string>>(this->logger));
    }
    app->daem = std::move(this->daem);
    
    if (this->pipem == nullptr) {
        this->withPipeManager(std::make_unique<PipeManager<std::string>>(this->logger));
    }
    app->pipem = std::move(this->pipem);

    if (this->w == nullptr) {
        this->withWebview(std::make_unique<RenWeb::Webview>(false, nullptr));
    }
    app->w = std::move(this->w);

    if (this->signalm == nullptr) {
        this->withSignalManager(std::make_unique<SignalManager>(
            this->logger,
            std::map<int, std::function<void(int)>>{
                {SIGINT, [&app](int signal) {
                    (void)signal;
                    if (app && app->w)
                        app->w->terminate();
                }}, {SIGTERM, [&app](int signal) {
                    (void)signal;
                    if (app && app->signalm)
                        app->signalm->trigger(SIGINT);
                }}, {SIGABRT, [&app](int signal) {
                    (void)signal;
                    if (app && app->signalm)
                        app->signalm->trigger(SIGINT);
                }}
            }
        ));
    }
    app->signalm = std::move(this->signalm);

    if (this->ws == nullptr) {
        this->validateOpt("ip");
        this->validateOpt("port");
        this->withWebServer(std::make_unique<WebServer>(
            this->logger,
            app.get(),
            static_cast<unsigned short>(std::stoi(opts.at("port"))),
            opts.at("ip")
        ));
    }
    app->ws = std::move(this->ws);

    if (this->fns == nullptr) {
        this->withWindowFunctions(std::make_unique<WindowFunctions>(this->logger, app.get()));
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
        this->logger->error("[app] Failed to get webview widget for permission setup");
        return;
    }
    WebKitWebView* webview = WEBKIT_WEB_VIEW(widget_result.value());
    
    WebKitSettings* settings = webkit_web_view_get_settings(webview);
    webkit_settings_set_enable_developer_extras(settings, TRUE);
    
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
            app->logger->info("[app] Geolocation permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_IS_NOTIFICATION_PERMISSION_REQUEST(request)) {
            allowed = check_permission("notifications", true);
            app->logger->info("[app] Notifications permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(request)) {
            allowed = check_permission("media_devices", false);
            app->logger->info("[app] Media devices permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_IS_POINTER_LOCK_PERMISSION_REQUEST(request)) {
            allowed = check_permission("pointer_lock", false);
            app->logger->info("[app] Pointer lock permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_INSTALL_MISSING_MEDIA_PLUGINS_PERMISSION_REQUEST(request)) {
            allowed = check_permission("install_missing_media_plugins", true);
            app->logger->info("[app] Install missing media plugins permission request: " + std::string(allowed ? "allowing" : "denying"));
        } else if (WEBKIT_DEVICE_INFO_PERMISSION_REQUEST(request)) {
            allowed = check_permission("device_info", true);
            app->logger->info("[app] Device info permission request: " + std::string(allowed ? "allowing" : "denying"));
        }
        
        allowed ? webkit_permission_request_allow(request) : webkit_permission_request_deny(request);
        return TRUE;
    }), this);
    
#elif defined(_WIN32)
    // Windows WebView2 permissions are handled via ICoreWebView2::add_PermissionRequested
    // TODO: Implement permission request handler
    this->logger->critical("[app] Windows permission handling not yet implemented");
    
#elif defined(__APPLE__)
    // NOTE: macOS WebKit permissions are handled via WKUIDelegate
    auto window_result = this->w->window();
    if (!window_result.has_value()) {
        this->logger->error("[app] Failed to get window for permission setup");
        return;
    }
    
    id nsWindow = (__bridge id)window_result.value();
    id contentView = [nsWindow contentView];
    id webview = nil;
    
    NSArray* subviews = [contentView subviews];
    for (id view in subviews) {
        if ([view isKindOfClass:NSClassFromString(@"WKWebView")]) {
            webview = view;
            break;
        }
    }
    
    if (!webview) {
        this->logger->error("[app] Failed to find WKWebView for permission setup");
        return;
    }
    
    id config = [webview configuration];
    id preferences = [config preferences];
    
    [preferences setValue:@YES forKey:@"developerExtrasEnabled"];
    [preferences setValue:@YES forKey:@"javaScriptEnabled"];
    
    const json::value& perms_from_info = this->info->getProperty("permissions");
    const json::object perms = (perms_from_info.is_object()) ? perms_from_info.as_object() : json::object{};
    
    auto check_permission = [&](const char* key, bool default_value) -> bool {
        return (perms.contains(key) && perms.at(key).is_bool())
            ? perms.at(key).as_bool()
            : default_value;
    };
    
    static Class delegateClass = nil;
    if (!delegateClass) {
        delegateClass = objc_allocateClassPair([NSObject class], "RenWebPermissionDelegate", 0);
        
        // Add requestMediaCapturePermission method (for camera/microphone)
        IMP requestMediaImp = imp_implementationWithBlock(^(id self, id webView, id origin, id frame, id type, id decisionHandler) {
            App* app = (__bridge App*)objc_getAssociatedObject(self, "app");
            const json::value& perms_from_info = app->info->getProperty("permissions");
            const json::object perms = (perms_from_info.is_object()) ? perms_from_info.as_object() : json::object{};
            bool allowed = (perms.contains("media_devices") && perms.at("media_devices").is_bool()) 
                ? perms.at("media_devices").as_bool() : false;
            app->logger->info("[app] Media capture permission request: " + std::string(allowed ? "allowing" : "denying"));
            void (^handler)(int) = decisionHandler;
            handler(allowed ? 1 : 0); // WKPermissionDecisionGrant = 1, WKPermissionDecisionDeny = 0
        });
        class_addMethod(delegateClass, NSSelectorFromString(@"webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:"),
                       requestMediaImp, "v@:@@@@@");
        
        // Add requestDeviceOrientationAndMotionPermission method
        IMP requestDeviceImp = imp_implementationWithBlock(^(id self, id webView, id origin, id frame, id decisionHandler) {
            App* app = (__bridge App*)objc_getAssociatedObject(self, "app");
            const json::value& perms_from_info = app->info->getProperty("permissions");
            const json::object perms = (perms_from_info.is_object()) ? perms_from_info.as_object() : json::object{};
            bool allowed = (perms.contains("device_info") && perms.at("device_info").is_bool()) 
                ? perms.at("device_info").as_bool() : true;
            app->logger->info("[app] Device orientation/motion permission request: " + std::string(allowed ? "allowing" : "denying"));
            void (^handler)(int) = decisionHandler;
            handler(allowed ? 1 : 0);
        });
        class_addMethod(delegateClass, NSSelectorFromString(@"webView:requestDeviceOrientationAndMotionPermissionForOrigin:initiatedByFrame:decisionHandler:"),
                       requestDeviceImp, "v@:@@@@");
        
        objc_registerClassPair(delegateClass);
    }
    
    id delegate = [[delegateClass alloc] init];
    objc_setAssociatedObject(delegate, "app", (__bridge id)this, OBJC_ASSOCIATION_ASSIGN);
    [webview setUIDelegate:delegate];
#endif
    this->logger->info("[app] Permissions have been set.");
}

void App::setupWindow() {
    const json::value& prop = this->config->getProperty("initially_shown");
    if (prop.is_bool() && !prop.as_bool()) {
        this->fns->window_callbacks->run(
            "show", 
            json::value((prop.is_bool()) ? (prop.as_bool()) : true)
        );
    }
}

void App::run() {
    const json::object current_state = this->config->getJson().is_object() 
        ? this->config->getJson().as_object() : json::object{};

    this->ws->start();

    this->processPermissions();

    this->w->dispatch([this, current_state](){
        this->setupWindow();
        this->fns->setState(current_state);
    });
    
    this->w->navigate(this->ws->getURL());
    this->w->run();
}