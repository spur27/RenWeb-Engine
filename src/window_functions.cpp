#include "../include/window_functions.hpp"

#include "../include/json.hpp"
#include <boost/json/object.hpp>
#include <boost/json/serialize.hpp>
#include <boost/json/value.hpp>
#include <memory>
#include <sstream>
#include <string>
#include <fstream>
#include <regex>
#include <chrono>
#include <thread>
#include <boost/process/v1.hpp>
#include "../include/web_server.hpp"
#include "../include/app.hpp"
#include "../include/locate.hpp"
#include "../include/managers/pipe_manager.hpp"

#if defined(_WIN32)
    #include <windows.h>
    #include <urlmon.h>
    #include <shellapi.h>
    #include <wrl/client.h>
    #include <wrl.h>
    #include "webview2/WebView2.h"
    #pragma comment(lib, "urlmon.lib")
    #pragma comment(lib, "shell32.lib")
#elif defined(__APPLE__)
    #import <Foundation/Foundation.h>
    #import <objc/runtime.h>
    #import <objc/message.h>
    #include <Cocoa/Cocoa.h>
    #include <WebKit/WebKit.h>
    #include <objc/message.h>
#elif defined(__linux__)
    #include "webview/detail/platform/linux/webkitgtk/compat.hh"
    #include <dlfcn.h>
    #include <gtk/gtk.h>
    #include "gdk/gdk.h"
    #include <webkit2/webkit2.h>
#endif


using WF = RenWeb::WindowFunctions;
using IOM = RenWeb::InOutManager<std::string, json::value, const json::value&>;

#if defined(_WIN32)
// Helper to get ICoreWebView2 from the widget (which returns controller)
namespace WebView2Helper {
    using Microsoft::WRL::ComPtr;
    
    static ICoreWebView2* GetWebViewFromController(void* controller_ptr) {
        if (!controller_ptr) return nullptr;
        
        ICoreWebView2Controller* controller = static_cast<ICoreWebView2Controller*>(controller_ptr);
        ICoreWebView2* webview = nullptr;
        
        HRESULT hr = controller->get_CoreWebView2(&webview);
        if (SUCCEEDED(hr) && webview) {
            return webview;  // Caller must Release when done
        }
        return nullptr;
    }
}

namespace WindowHelper {
    static HWND GetHWND(RenWeb::App* app) {
        auto window_result = app->w->window();
        if (!window_result.has_value()) {
            return nullptr;
        }
        return static_cast<HWND>(window_result.value());
    }
    
    static DWORD GetExStyle(HWND hwnd) {
        if (!hwnd) return 0;
        return static_cast<DWORD>(GetWindowLongPtr(hwnd, GWL_EXSTYLE));
    }
    
    static DWORD GetStyle(HWND hwnd) {
        if (!hwnd) return 0;
        return static_cast<DWORD>(GetWindowLongPtr(hwnd, GWL_STYLE));
    }
    
    static bool HasExStyle(HWND hwnd, DWORD style) {
        return (GetExStyle(hwnd) & style) != 0;
    }
    
    static bool HasStyle(HWND hwnd, DWORD style) {
        return (GetStyle(hwnd) & style) != 0;
    }
    
    static void SetExStyleBit(HWND hwnd, DWORD bit, bool set) {
        if (!hwnd) return;
        DWORD exStyle = GetExStyle(hwnd);
        if (set) {
            exStyle |= bit;
        } else {
            exStyle &= ~bit;
        }
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle);
        SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    }
    
    static void SetStyleBit(HWND hwnd, DWORD bit, bool set) {
        if (!hwnd) return;
        DWORD style = GetStyle(hwnd);
        if (set) {
            style |= bit;
        } else {
            style &= ~bit;
        }
        SetWindowLongPtr(hwnd, GWL_STYLE, style);
        SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
    }
    
    // DPI scaling helpers for consistent coordinates across platforms
    static float GetDpiScale(HWND hwnd) {
        if (!hwnd) return 1.0f;
        UINT dpi = GetDpiForWindow(hwnd);
        return dpi / 96.0f; // 96 DPI is 100% scaling
    }
    
    static int PhysicalToLogical(HWND hwnd, int physical) {
        return static_cast<int>(physical / GetDpiScale(hwnd));
    }
    
    static int LogicalToPhysical(HWND hwnd, int logical) {
        return static_cast<int>(logical * GetDpiScale(hwnd));
    }
}
#endif

#if defined(__APPLE__)
static id getWKWebViewFromWindow(void* window_ptr) {
    if (!window_ptr) return nil;
    
    id nsWindow = (__bridge id)window_ptr;
    id contentView = [nsWindow contentView];
    
    NSArray* subviews = [contentView subviews];
    for (id view in subviews) {
        if ([view isKindOfClass:NSClassFromString(@"WKWebView")]) {
            return view;
        }
    }
    return nil;
}
#endif
using CM = RenWeb::CallbackManager<std::string, json::value, const json::value&>;

WF::WindowFunctions(std::shared_ptr<ILogger> logger, RenWeb::App* app)
    : logger(logger),
      app(app),
      internal_callbacks(new CM()),
      getsets(new IOM()),
      window_callbacks(new CM()),
      log_callbacks(new CM()),
      filesystem_callbacks(new CM()),
      config_callbacks(new CM()),
      system_callbacks(new CM()),
      process_callbacks(new CM()),
      signal_callbacks(new CM()),
      debug_callbacks(new CM()),
      network_callbacks(new CM()),
      navigate_callbacks(new CM())
{ 
    this->setGetSets()
        ->setWindowCallbacks()
        ->setLogCallbacks()
        ->setFileSystemCallbacks()
        ->setConfigCallbacks()
        ->setSystemCallbacks()
        ->setProcessCallbacks()
        ->setSignalCallbacks()
        ->setDebugCallbacks()
        ->setNetworkCallbacks()
        ->setNavigateCallbacks()
        ->setInternalCallbacks();
    this->bindDefaults();
}

WF::~WindowFunctions() {
    this->logger->trace("[function] Deconstructing WindowFunctions");
}

json::value WF::processInput(const std::string& input) {
    return this->processInput(json::parse(input));
}

json::value WF::processInput(const json::value& input) {
    switch (input.kind()) {
        case json::kind::string:
            this->logger->warn("[function] Received string in processInput(std::string)");
        case json::kind::int64:
        case json::kind::double_:
        case json::kind::bool_:
        case json::kind::null:
            return input;
        case json::kind::array:
            return this->processInput(input.as_array());
        case json::kind::object:
            return this->processInput(input.as_object());
        default:
            throw std::runtime_error("[function] Unsupported JSON value kind in processInput(std::string)");
    }
}

json::value WF::processInput(const json::object& input) {
    if (input.contains("__encoding_type__") && input.at("__encoding_type__").is_string() && input.contains("__val__")) {
        if (input.at("__encoding_type__").as_string() == "base64" && input.at("__val__").is_array()) {
            std::stringstream ss;
            for (const auto& item : input.at("__val__").as_array()) {
                ss << char(item.as_int64());
            }
            return json::value(ss.str());
        }
        throw std::runtime_error("[function] Unsupported encoding type in processInput(json::object): " + std::string(input.at("__encoding_type__").as_string()));
    } else {
        json::object processed_input;
        for (const auto& item : input) {
            processed_input[item.key()] = this->processInput(item.value());
        }
        return processed_input;
    }
}

json::value WF::processInput(const json::array& input) {
    json::array processed_input;
    for (const auto& item : input) {
        processed_input.push_back(this->processInput(item));
    }
    return processed_input;
}

json::value WF::formatOutput(const json::value& output) {
    json::array formatted_output_arr;
    json::object formatted_output_obj;
    switch (output.kind()) {
        case json::kind::string:
            return this->formatOutput(output.as_string().c_str());
        case json::kind::int64:
        case json::kind::double_:
        case json::kind::bool_:
        case json::kind::null:
            return output;
        case json::kind::array:
            for (const auto& item : output.as_array()) {
                formatted_output_arr.push_back(this->formatOutput(item));
            }
            return formatted_output_arr;
        case json::kind::object:
            for (const auto& item : output.as_object()) {
                formatted_output_obj[item.key()] = this->formatOutput(item.value());
            }
            return formatted_output_obj;
        default:
            throw std::runtime_error("[function] Unsupported JSON value kind in formatOutput");
    }
}

json::value WF::formatOutput(const std::string& output) {
    json::object formatted_output = {
        {"__encoding_type__", "base64"},
        {"__val__", json::array()}
    };
    json::array& val_array = formatted_output["__val__"].as_array() ;
    for (const char& ch : output) {
        val_array.push_back(static_cast<int64_t>(ch));
    }
    return formatted_output;
}

template <typename T>
json::value WF::formatOutput(const T& output) {
    // Convert to std::string first to avoid infinite recursion with const char*
    if constexpr (std::is_same_v<T, const char*> || std::is_same_v<T, char*>) {
        return this->formatOutput(std::string(output));
    } else {
        return this->formatOutput(json::value(output));
    }
}

json::value WF::getSingleParameter(const json::value& param) {
    if (param.is_array()) {
        if (param.as_array().size() > 1) {
            this->logger->warn("[function] Expected single parameter but received array of size " + std::to_string(param.as_array().size()) + ". Using first element.");
            return param.as_array()[0];
        } else if (param.as_array().size() == 0) {
            this->logger->warn("[function] Expected single parameter but received empty array. Using null.");
            return json::value(nullptr);
        } else {
            return param.as_array()[0];
        }
    } else {
        return param;
    }
}

WF* WF::bindFunction(const std::string& fn_name, std::function<std::string(std::string)> fn) {
    this->app->w->bind(fn_name, fn);
    this->logger->trace("[function] Bound " + fn_name);
    return this;
}
WF* WF::unbindFunction(const std::string& fn_name) {
    this->app->w->unbind(fn_name);
    this->logger->trace("[function] Unbound " + fn_name);
    return this;
}
WF* WF::bindDefaults() {
    auto bindCMs = [this](CM* cm)-> void {
        for (const auto& entry : cm->getMap()) {
            const auto& key = entry.first;
            const auto& fn = entry.second;
            this->bindFunction("BIND_" + key, [fn, this](const std::string& req) -> std::string {
                try {
                    return json::serialize(this->formatOutput(fn(this->processInput(req))));
                } catch (const std::exception& e) {
                    this->logger->error(std::string("[function] ") + e.what());
                    return json::serialize(this->formatOutput(nullptr));
                }
            });
        }
    };
    auto bindIOMs = [this](IOM* iom)-> void {
        for (const auto& entry : iom->getMap()) {
            const auto& key = entry.first;
            const auto& pair = entry.second;
            this->bindFunction("BIND_get_" + key, [pair, this](const std::string& req) -> std::string {
                (void)req;
                try {
                    return json::serialize(this->formatOutput(pair.first()));
                } catch (const std::exception& e) {
                    this->logger->error(std::string("[function] ") + e.what());
                    return json::serialize(this->formatOutput(nullptr));
                }
            })
            ->bindFunction("BIND_set_" + key, [pair, this](const std::string& req) -> std::string {
                try {
                    pair.second(this->processInput(req));
                } catch (const std::exception& e) {
                    this->logger->error(std::string("[function] ") + e.what());
                }
                return json::serialize(this->formatOutput(nullptr));
            });
        }
    };
    bindIOMs(this->getsets.get());
    bindCMs(this->window_callbacks.get());
    bindCMs(this->log_callbacks.get());
    bindCMs(this->filesystem_callbacks.get());
    bindCMs(this->config_callbacks.get());
    bindCMs(this->system_callbacks.get());
    bindCMs(this->process_callbacks.get());
    bindCMs(this->signal_callbacks.get());
    bindCMs(this->debug_callbacks.get());
    bindCMs(this->network_callbacks.get());
    bindCMs(this->navigate_callbacks.get());
    return this;
}
json::value WF::get(const std::string& property) {
    return this->getsets->out(property);
}
void WF::set(const std::string& property, const json::value& value) {
    this->getsets->in(property, value);
}
json::object WF::getState() {
    json::object state = json::object();
    for (const auto& [key, getset] : this->getsets->getMap()) {
        try {
            this->logger->info("[function] Getting for " + key);
            state[key] = this->get(key);
        } catch (...) { }
    }
    return state;
}
void WF::setState(const json::object& json) {
    for (const auto& property : json) {
        try {
            this->logger->info("[function] Setting for " + std::string(property.key()));
            this->set(property.key(), property.value());
        } catch (...) { }
    }
}
#pragma region GetSet
WF* WF::setGetSets() {
// -----------------------------------------
    this->getsets->add("size", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
            int width, height;
            json::object dims = json::object();
        #if defined(_WIN32)
            RECT rect;
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                GetClientRect(hwnd, &rect);
                // Convert physical pixels to logical coordinates to match set_size behavior
                width = WindowHelper::PhysicalToLogical(hwnd, rect.right - rect.left);
                height = WindowHelper::PhysicalToLogical(hwnd, rect.bottom - rect.top);
            } else {
                width = 0;
                height = 0;
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            NSRect contentRect = [nsWindow contentRectForFrameRect:[nsWindow frame]];
            width = (int)contentRect.size.width;
            height = (int)contentRect.size.height;
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            gtk_window_get_size(GTK_WINDOW(window_widget), &width, &height);
        #endif
            dims["width"] = width;
            dims["height"] = height;
            return dims;
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req) {
            json::object obj = this->getSingleParameter(req).as_object();
            int width = static_cast<int>(obj.at("width").as_int64());
            int height = static_cast<int>(obj.at("height").as_int64());
            this->app->w->set_size(width, height);
        })
    ))
// -----------------------------------------
    ->add("position", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
            int x, y;
            json::object position = json::object();
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                RECT rect;
                GetWindowRect(hwnd, &rect);
                // Convert physical pixels to logical coordinates for consistency with Mac/Linux
                x = WindowHelper::PhysicalToLogical(hwnd, rect.left);
                y = WindowHelper::PhysicalToLogical(hwnd, rect.top);
            } else {
                x = 0;
                y = 0;
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            NSRect frame = [nsWindow frame];
            NSRect screenFrame = [[NSScreen mainScreen] frame];
            x = (int)frame.origin.x;
            y = (int)(screenFrame.size.height - frame.origin.y - frame.size.height); 
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            gtk_window_get_position(GTK_WINDOW(window_widget), &x, &y);
        #endif
            position["x"] = x;
            position["y"] = y;
            return position;
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            json::object obj = this->getSingleParameter(req).as_object();
            int x = static_cast<int>(obj.at("x").as_int64());
            int y = static_cast<int>(obj.at("y").as_int64());
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                // Convert logical coordinates to physical pixels for Windows API
                int physical_x = WindowHelper::LogicalToPhysical(hwnd, x);
                int physical_y = WindowHelper::LogicalToPhysical(hwnd, y);
                SetWindowPos(hwnd, NULL, physical_x, physical_y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            NSRect screenFrame = [[NSScreen mainScreen] frame];
            NSPoint newOrigin = NSMakePoint(x, screenFrame.size.height - y); // Convert to Cocoa coordinates
            [nsWindow setFrameOrigin:newOrigin];
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            gtk_window_move(GTK_WINDOW(window_widget), x, y);
        #endif
        })
    ))
// -----------------------------------------
    ->add("decorated", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                return json::value(WindowHelper::HasStyle(hwnd, WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME));
            }
            return json::value(true);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value(([nsWindow styleMask] & NSWindowStyleMaskTitled) != 0);
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value(static_cast<bool>(gtk_window_get_decorated(GTK_WINDOW(window_widget))));
        #endif
        }),
    // -----------------------------------------
        // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            const bool decorated = this->getSingleParameter(req).as_bool();
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                WindowHelper::SetStyleBit(hwnd, WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME, decorated);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            NSUInteger styleMask = [nsWindow styleMask];
            if (decorated) {
                styleMask |= NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable;
            } else {
                styleMask &= ~(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable);
            }
            [nsWindow setStyleMask:styleMask];
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            gtk_window_set_decorated(GTK_WINDOW(window_widget), decorated);
        #endif
        })
    ))
// -----------------------------------------
    ->add("resizable", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
                return json::value((style & (WS_THICKFRAME | WS_MAXIMIZEBOX)) != 0);
            }
            return json::value(true);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value(([nsWindow styleMask] & NSWindowStyleMaskResizable) != 0);
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value(static_cast<bool>(gtk_window_get_resizable(GTK_WINDOW(window_widget))));
        #endif
        }),
        // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            const bool resizable = this->getSingleParameter(req).as_bool();
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                WindowHelper::SetStyleBit(hwnd, WS_THICKFRAME | WS_MAXIMIZEBOX, resizable);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            NSUInteger styleMask = [nsWindow styleMask];
            if (resizable) {
                styleMask |= NSWindowStyleMaskResizable;
            } else {
                styleMask &= ~NSWindowStyleMaskResizable;
            }
            [nsWindow setStyleMask:styleMask];
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            gtk_window_set_resizable(GTK_WINDOW(window_widget), resizable);
        #endif
        })
    ))
// -----------------------------------------
    ->add("keepabove", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                return json::value(WindowHelper::HasExStyle(hwnd, WS_EX_TOPMOST));
            }
            return json::value(false);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value([nsWindow level] == NSFloatingWindowLevel);
        #elif defined(__linux__)
            if (this->saved_states.find("keepabove") == this->saved_states.end()) {
                this->logger->warn("[function] State 'keepabove' has not been set in 'saved_states' yet.");
                return json::value(false);
            }
            return this->saved_states["keepabove"];
        #endif
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            const bool keep_above = this->getSingleParameter(req).as_bool();
            this->saved_states["keepabove"] = json::value(keep_above);
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                SetWindowPos(hwnd, (keep_above) ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            [nsWindow setLevel:(keep_above) ? NSFloatingWindowLevel : NSNormalWindowLevel];
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            gtk_window_set_keep_above(GTK_WINDOW(window_widget), keep_above);
        #endif
        })
    ))
// -----------------------------------------
    ->add("minimize", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
            #if defined(_WIN32)
                auto window_result = this->app->w->window();
                if (window_result.has_value()) {
                    HWND hwnd = static_cast<HWND>(window_result.value());
                    return json::value(IsIconic(hwnd) != 0);
                }
                return json::value(false);
            #elif defined(__APPLE__)
                NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
                return json::value([nsWindow isMiniaturized]);
            #elif defined(__linux__)
                auto window_widget = this->app->w->window().value();
                return json::value((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget)))
                    & GDK_WINDOW_STATE_ICONIFIED) != 0);
            #endif
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            const bool minimize = this->getSingleParameter(req).as_bool();
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                ShowWindow(hwnd, minimize ? SW_MINIMIZE : SW_RESTORE);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            if (minimize) {
                [nsWindow miniaturize:nil];
            } else {
                [nsWindow deminiaturize:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            bool is_currently_minimize = ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) & GDK_WINDOW_STATE_ICONIFIED) != 0);
            if (minimize && !is_currently_minimize) {
                gtk_window_iconify(GTK_WINDOW(window_widget));
            } else if (!minimize && is_currently_minimize) {
                gtk_window_deiconify(GTK_WINDOW(window_widget));
            }
        #endif
        })
    ))
// -----------------------------------------
    ->add("maximize", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                return json::value(IsZoomed(hwnd) != 0);
            }
            return json::value(false);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value([nsWindow isZoomed]);
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget)))
                & GDK_WINDOW_STATE_MAXIMIZED) != 0);
        #endif
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            const bool maximize = this->getSingleParameter(req).as_bool();
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                ShowWindow(hwnd, maximize ? SW_MAXIMIZE : SW_RESTORE);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            if (maximize != [nsWindow isZoomed]) {
                [nsWindow zoom:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            bool is_currently_maximize = ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) & GDK_WINDOW_STATE_MAXIMIZED) != 0);
            if (maximize && !is_currently_maximize) {
                gtk_window_maximize(GTK_WINDOW(window_widget));
            } else if (!maximize && is_currently_maximize) {
                gtk_window_unmaximize(GTK_WINDOW(window_widget));
            }
        #endif
        })
    ))
// -----------------------------------------
    ->add("fullscreen", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                DWORD style = static_cast<DWORD>(GetWindowLongPtr(hwnd, GWL_STYLE));
                return json::value((style & WS_POPUP) != 0 && (style & (WS_CAPTION | WS_THICKFRAME)) == 0);
            }
            return json::value(false);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value(([nsWindow styleMask] & NSWindowStyleMaskFullScreen) != 0);
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) 
                & GDK_WINDOW_STATE_FULLSCREEN) != 0);
        #endif
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            const bool fullscreen = this->getSingleParameter(req).as_bool();
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                if (fullscreen) {
                    SetWindowLongPtr(hwnd, GWL_STYLE, WS_POPUP | WS_VISIBLE);
                    ShowWindow(hwnd, SW_MAXIMIZE);
                } else {
                    SetWindowLongPtr(hwnd, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE);
                    ShowWindow(hwnd, SW_RESTORE);
                }
                SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            BOOL isCurrentlyFullscreen = ([nsWindow styleMask] & NSWindowStyleMaskFullScreen) != 0;
            if (fullscreen != isCurrentlyFullscreen) {
                [nsWindow toggleFullScreen:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            bool is_currently_fullscreen = ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) & GDK_WINDOW_STATE_FULLSCREEN) != 0);
            if (fullscreen && !is_currently_fullscreen) {
                gtk_window_fullscreen(GTK_WINDOW(window_widget));
            } else if (!fullscreen && is_currently_fullscreen) {
                gtk_window_unfullscreen(GTK_WINDOW(window_widget));
            }
        #endif
        })
    ))
// -----------------------------------------
    ->add("taskbar_show", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                return json::value(!WindowHelper::HasExStyle(hwnd, WS_EX_TOOLWINDOW));
            }
            return json::value(true);
        #elif defined(__APPLE__)
            this->logger->warn("[function] getTaskbarShow can't be set via RenWeb on Apple");
            return json::value(true); 
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value(!gtk_window_get_skip_taskbar_hint(GTK_WINDOW(window_widget))); // Inverted: skip means not shown
        #endif    
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
        #if defined(_WIN32)
            const bool taskbar_show = this->getSingleParameter(req).as_bool();
            HWND hwnd = WindowHelper::GetHWND(this->app);
            if (hwnd) {
                WindowHelper::SetExStyleBit(hwnd, WS_EX_TOOLWINDOW, !taskbar_show);  // Inverted logic
            }
        #elif defined(__APPLE__)
            (void)req; 
            this->logger->warn("[function] setTaskbarShow can't be set via RenWeb on Apple");
        #elif defined(__linux__)
            const bool taskbar_show = this->getSingleParameter(req).as_bool();
            auto window_widget = this->app->w->window().value();
            gtk_window_set_skip_taskbar_hint(GTK_WINDOW(window_widget), !taskbar_show); // Inverted logic
        #endif    
        })
    ))
// -----------------------------------------
    ->add("opacity", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                BYTE alpha;
                DWORD flags;
                if (GetLayeredWindowAttributes(hwnd, NULL, &alpha, &flags) && (flags & LWA_ALPHA)) {
                    return json::value(static_cast<float>(alpha) / 255.0f);
                }
            }
            return json::value(1.0f); // Default fully opaque
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value(static_cast<float>([nsWindow alphaValue]));
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value(gtk_widget_get_opacity(GTK_WIDGET(window_widget)));
        #endif
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
            json::value param = this->getSingleParameter(req);
            double opacity_amt = param.is_int64() ? static_cast<double>(param.as_int64()) : param.as_double();
            if (opacity_amt > 1.0 || opacity_amt < 0.0) {
                this->logger->error("[function] Invalid opacity: " + std::to_string(opacity_amt) + " only enter values between 0.0 and 1.0 inclusive");
            } else {
        #if defined(_WIN32)
                auto window_result = this->app->w->window();
                if (window_result.has_value()) {
                    HWND hwnd = static_cast<HWND>(window_result.value());
                    DWORD exStyle = static_cast<DWORD>(GetWindowLongPtr(hwnd, GWL_EXSTYLE));
                    SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
                    BYTE alpha = static_cast<BYTE>(opacity_amt * 255.0f);
                    SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
                }
        #elif defined(__APPLE__)
                NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
                [nsWindow setAlphaValue:opacity_amt];
        #elif defined(__linux__)
                this->logger->warn("[function] setOpacity has not been tested for Linux");
                auto window_window = this->app->w->window().value();
                gtk_widget_set_opacity(GTK_WIDGET(window_window), opacity_amt);
        #endif
            }
        })
    ));
    return this;
}
#pragma endregion
#pragma region WindowCallbacks
WF* WF::setWindowCallbacks() {
    this->window_callbacks
    ->add("is_focus",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
        (void)req;
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                return json::value(hwnd == GetForegroundWindow());
            }
            return json::value(false);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value([nsWindow isKeyWindow]);
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value(gtk_window_has_toplevel_focus(GTK_WINDOW(window_widget)));
        #endif
    }))->add("show",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            const bool show_window = this->getSingleParameter(req).as_bool();
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                if (hwnd) {
                    ShowWindow(hwnd, show_window ? SW_SHOW : SW_HIDE);
                    if (show_window) {
                        SetForegroundWindow(hwnd);
                    }
                }
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            if (nsWindow) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    if (show_window) {
                        [NSApp activateIgnoringOtherApps:YES];
                        [nsWindow makeKeyAndOrderFront:nil];
                    } else {
                        [nsWindow orderOut:nil];
                    }
                });
            }
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            auto webview_widget = this->app->w->widget().value();
            if (show_window) {
                gtk_widget_show_all(GTK_WIDGET(window_widget));
            } else {
                gtk_widget_hide(GTK_WIDGET(window_widget));
                gtk_widget_hide(GTK_WIDGET(webview_widget));
            }
        #endif
            return json::value(nullptr);
    }))->add("change_title",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            const std::string title = this->getSingleParameter(req).as_string().c_str();
            this->saved_states["current_title"] = json::value(title);
            this->app->w->set_title(title);
            return json::value(nullptr);
    }))->add("reset_title",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            auto title = this->app->config->getProperty("title");
            if (!title.is_string()) {
                title = this->app->config->getDefaultProperty("title");
            }
            if (!title.is_string()) {
                title = this->app->info->getProperty("title");
            }
            if (!title.is_string()) {
                title = json::value("UNKNOWN TITLE");
            }
            std::string title_str = title.as_string().c_str();
            this->saved_states["current_title"] = json::value(title_str);
            this->app->w->set_title(title_str);
            return json::value(nullptr);
    }))->add("current_title",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            if (this->saved_states.find("current_title") == this->saved_states.end()) {
                this->logger->warn("[function] Title has not been set yet, returning empty string");
                return json::value(Locate::executable().filename().string());
            }
            return this->saved_states["current_title"];
    }))->add("reload_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            static const std::regex uri_regex(
                R"(^[a-zA-Z][a-zA-Z0-9+.-]*://[^\s]+$)"
            );
            if (std::regex_match(this->app->config->current_page, uri_regex)) {
                this->logger->warn("[function] Reloading URI " + this->app->config->current_page);
                this->app->w->navigate(this->app->config->current_page);
            } else {
                this->logger->warn("[function] Navigating to " + this->app->ws->getURL() + " to display page of name " + this->app->config->current_page);
                this->app->w->navigate(this->app->ws->getURL());
            }
            return json::value(nullptr);
    }))->add("navigate_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            const std::string uri = this->getSingleParameter(req).as_string().c_str();
            static const std::regex uri_regex(
                R"(^[a-zA-Z][a-zA-Z0-9+.-]*://[^\s]+$)"
            );
            if (uri != "_") this->app->config->current_page = uri;
            if (std::regex_match(uri, uri_regex)) {
                this->logger->warn("[function] Navigating to page " + uri);
                this->app->w->navigate(uri);
            } else {
                this->logger->warn("[function] Navigating to " + this->app->ws->getURL() + " to display page of name " + uri);
                this->app->w->navigate(this->app->ws->getURL());
            }
            return json::value(nullptr);
    }))->add("terminate",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->app->w->terminate();
            return json::value(nullptr);
    }))->add("start_window_drag",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                HWND hwnd = static_cast<HWND>(window_result.value());
                ReleaseCapture();
                SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
            }
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            [nsWindow performWindowDragWithEvent:[NSApp currentEvent]];
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            GdkWindow* gdk_window = gtk_widget_get_window(GTK_WIDGET(window_widget));
            
            GdkDisplay* display = gdk_window_get_display(gdk_window);
            GdkSeat* seat = gdk_display_get_default_seat(display);
            GdkDevice* device = gdk_seat_get_pointer(seat);
            
            gint root_x, root_y;
            gdk_device_get_position(device, NULL, &root_x, &root_y);

            this->logger->info("[function] Attempting window drag from position: " + std::to_string(root_x) + ", " + std::to_string(root_y));

            gdk_window_begin_move_drag(gdk_window, 1, root_x, root_y, GDK_CURRENT_TIME);
        #endif
            return json::value(nullptr);
    }))->add("print_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    ICoreWebView2_16* webview2_16 = nullptr;
                    HRESULT hr = webview2->QueryInterface(IID_PPV_ARGS(&webview2_16));
                    if (SUCCEEDED(hr) && webview2_16) {
                        hr = webview2_16->ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_BROWSER);
                        if (FAILED(hr)) {
                            this->logger->error("[function] Failed to show print dialog, HRESULT: " + std::to_string(hr));
                        } else {
                            this->logger->info("[function] Print dialog opened via ICoreWebView2_16::ShowPrintUI");
                        }
                        webview2_16->Release();
                    } else {
                        this->app->w->eval("window.print();");
                        this->logger->info("[function] WebView2 Runtime < 1.0.1462, using window.print() fallback");
                    }
                }
            }
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    dispatch_async(dispatch_get_main_queue(), ^{
                        NSView* webViewAsView = (NSView*)webview;
                        
                        NSPrintInfo* printInfo = [NSPrintInfo sharedPrintInfo];
                        [printInfo setHorizontalPagination:NSPrintingPaginationModeAutomatic];
                        [printInfo setVerticalPagination:NSPrintingPaginationModeAutomatic];
                        [printInfo setVerticallyCentered:NO];
                        
                        NSPrintOperation* printOp = [webViewAsView printOperationWithPrintInfo:printInfo];
                        if (printOp) {
                            [printOp setShowsPrintPanel:YES];
                            [printOp setShowsProgressPanel:YES];
                            [printOp runOperation];
                        } else {
                            this->logger->error("[function] (apple-only) Failed to create print operation");
                        }
                    });
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitPrintOperation* print_op = webkit_print_operation_new(WEBKIT_WEB_VIEW(webview_widget));
            webkit_print_operation_run_dialog(print_op, GTK_WINDOW(this->app->w->window().value()));
            g_object_unref(print_op);
        #endif
            return json::value(nullptr);
    }))->add("zoom_in",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto controller_opt = this->app->w->get_controller();
            if (!controller_opt.has_value()) {
                this->logger->error("[function] WebView2 controller not available");
                return json::value(nullptr);
            }
            
            ICoreWebView2Controller* controller = static_cast<ICoreWebView2Controller*>(controller_opt.value());
            double current_zoom = 1.0;
            controller->get_ZoomFactor(&current_zoom);
            controller->put_ZoomFactor(current_zoom + 0.1);
            this->logger->debug("[function] Zoom increased to " + std::to_string(current_zoom + 0.1));
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    double currentZoom = [[webview valueForKey:@"pageZoom"] doubleValue];
                    [webview setPageZoom:currentZoom + 0.1];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            double current_zoom = webkit_web_view_get_zoom_level(WEBKIT_WEB_VIEW(webview_widget));
            webkit_web_view_set_zoom_level(WEBKIT_WEB_VIEW(webview_widget), current_zoom + 0.1);
        #endif
            return json::value(nullptr);
    }))->add("zoom_out",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto controller_opt = this->app->w->get_controller();
            if (!controller_opt.has_value()) {
                this->logger->error("[function] WebView2 controller not available");
                return json::value(nullptr);
            }
            
            ICoreWebView2Controller* controller = static_cast<ICoreWebView2Controller*>(controller_opt.value());
            double current_zoom = 1.0;
            controller->get_ZoomFactor(&current_zoom);
            controller->put_ZoomFactor(current_zoom - 0.1);
            this->logger->debug("[function] Zoom decreased to " + std::to_string(current_zoom - 0.1));
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    double currentZoom = [[webview valueForKey:@"pageZoom"] doubleValue];
                    [webview setPageZoom:currentZoom - 0.1];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            double current_zoom = webkit_web_view_get_zoom_level(WEBKIT_WEB_VIEW(webview_widget));
            webkit_web_view_set_zoom_level(WEBKIT_WEB_VIEW(webview_widget), current_zoom - 0.1);
        #endif
            return json::value(nullptr);
    }))->add("zoom_reset",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto controller_opt = this->app->w->get_controller();
            if (!controller_opt.has_value()) {
                this->logger->error("[function] WebView2 controller not available");
                return json::value(nullptr);
            }
            
            ICoreWebView2Controller* controller = static_cast<ICoreWebView2Controller*>(controller_opt.value());
            controller->put_ZoomFactor(1.0);
            this->logger->debug("[function] Zoom reset to 1.0");
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    [webview setPageZoom:1.0];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            webkit_web_view_set_zoom_level(WEBKIT_WEB_VIEW(webview_widget), 1.0);
        #endif
            return json::value(nullptr);
    }))->add("get_zoom_level",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto controller_opt = this->app->w->get_controller();
            if (!controller_opt.has_value()) {
                this->logger->error("[function] WebView2 controller not available");
                return json::value(1.0);
            }
            
            ICoreWebView2Controller* controller = static_cast<ICoreWebView2Controller*>(controller_opt.value());
            double zoom = 1.0;
            controller->get_ZoomFactor(&zoom);
            return json::value(zoom);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    double currentZoom = [[webview valueForKey:@"pageZoom"] doubleValue];
                    return json::value(currentZoom);
                }
            }
            return json::value(1.0);
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            double zoom = webkit_web_view_get_zoom_level(WEBKIT_WEB_VIEW(webview_widget));
            return json::value(zoom);
        #endif
    }))->add("set_zoom_level",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            double zoom_level = this->getSingleParameter(req).as_double();
        #if defined(_WIN32)
            auto controller_opt = this->app->w->get_controller();
            if (!controller_opt.has_value()) {
                this->logger->error("[function] WebView2 controller not available");
                return json::value(nullptr);
            }
            
            ICoreWebView2Controller* controller = static_cast<ICoreWebView2Controller*>(controller_opt.value());
            controller->put_ZoomFactor(zoom_level);
            this->logger->debug("[function] Zoom set to " + std::to_string(zoom_level));
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    [webview setPageZoom:zoom_level];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            webkit_web_view_set_zoom_level(WEBKIT_WEB_VIEW(webview_widget), zoom_level);
        #endif
            return json::value(nullptr);
    }))->add("find_in_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            const std::string search_text = this->getSingleParameter(req).as_string().c_str();
        #if defined(_WIN32)
            // Use window.find() - most reliable cross-version approach
            // Escape single quotes in search text
            std::string escaped_text = search_text;
            size_t pos = 0;
            while ((pos = escaped_text.find("'", pos)) != std::string::npos) {
                escaped_text.replace(pos, 1, "\\'");
                pos += 2;
            }
            
            std::string js = "window.find('" + escaped_text + "', false, false, true, false, true, false);";
            this->app->w->eval(js);
            this->logger->debug("[function] Searching for: " + search_text);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview && [webview respondsToSelector:@selector(findString:withConfiguration:completionHandler:)]) {
                    NSString* searchString = [NSString stringWithUTF8String:search_text.c_str()];
                    id config = [[NSClassFromString(@"WKFindConfiguration") alloc] init];
                    [config setValue:@NO forKey:@"caseSensitive"];
                    [config setValue:@NO forKey:@"backwards"];
                    [config setValue:@YES forKey:@"wraps"];
                    
                    void (^completionHandler)(id) = ^(id result) {
                        (void)result; 
                    };
                    
                    SEL selector = @selector(findString:withConfiguration:completionHandler:);
                    NSMethodSignature *signature = [webview methodSignatureForSelector:selector];
                    if (signature) {
                        NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:signature];
                        [invocation setTarget:webview];
                        [invocation setSelector:selector];
                        [invocation setArgument:&searchString atIndex:2];
                        [invocation setArgument:&config atIndex:3];
                        [invocation setArgument:&completionHandler atIndex:4];
                        [invocation invoke];
                    }
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitFindController* find_controller = webkit_web_view_get_find_controller(WEBKIT_WEB_VIEW(webview_widget));
            webkit_find_controller_search(find_controller, search_text.c_str(), WEBKIT_FIND_OPTIONS_CASE_INSENSITIVE | WEBKIT_FIND_OPTIONS_WRAP_AROUND, G_MAXUINT);
        #endif
            return json::value(nullptr);
    }))->add("find_next",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            // Use window.find() with forward direction
            std::string js = "window.find('', false, false, false, false, true, false);";
            this->app->w->eval(js);
        #elif defined(__APPLE__)
            this->logger->warn("[function] apple doesn't have bindings for this findNext");
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitFindController* find_controller = webkit_web_view_get_find_controller(WEBKIT_WEB_VIEW(webview_widget));
            webkit_find_controller_search_next(find_controller);
        #endif
            return json::value(nullptr);
    }))->add("find_previous",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            // Use window.find() with backward direction
            std::string js = "window.find('', false, true, false, false, true, false);";
            this->app->w->eval(js);
        #elif defined(__APPLE__)
            this->logger->warn("apple doesn't have bindings for this findPrevious");
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitFindController* find_controller = webkit_web_view_get_find_controller(WEBKIT_WEB_VIEW(webview_widget));
            webkit_find_controller_search_previous(find_controller);
        #endif
            return json::value(nullptr);
    }))->add("clear_find",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            // Clear selection by collapsing the range
            std::string js = "if (window.getSelection) { window.getSelection().removeAllRanges(); }";
            this->app->w->eval(js);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    [webview findString:@"" withConfiguration:nil completionHandler:nil];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitFindController* find_controller = webkit_web_view_get_find_controller(WEBKIT_WEB_VIEW(webview_widget));
            webkit_find_controller_search_finish(find_controller);
        #endif
            return json::value(nullptr);
    }));
    return this;
}
#pragma endregion
#pragma region LogCallbacks
WF* WF::setLogCallbacks() {
    this->log_callbacks
    ->add("log_trace",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->logger->trace("[client] " + msg);
            return json::value(nullptr);
    }))->add("log_debug",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->logger->debug("[client] " + msg);
            return json::value(nullptr);
    }))->add("log_info",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->logger->info("[client] " + msg);
            return json::value(nullptr);
    }))->add("log_warn",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->logger->warn("[client] " + msg);
            return json::value(nullptr);
    }))->add("log_error",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->logger->error("[client] " + msg);
            return json::value(nullptr);
    }))->add("log_critical",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->logger->critical("[client] " + msg);
            return json::value(nullptr);
    }));
    return this;
}
#pragma endregion
#pragma region FileSystemCallbacks
WF* WF::setFileSystemCallbacks() {
    this->filesystem_callbacks
    ->add("read_file",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::filesystem::path path(this->getSingleParameter(req).as_string().c_str());
            if (!std::filesystem::exists(path)) {
                this->logger->error("[function] No file exists at " + path.string());
                return json::value(nullptr);
            }
            else if (std::filesystem::is_directory(path)) {
                this->logger->error("readFile can't read directory contents. Use ls for that.");
                return json::value(nullptr);
            }
            std::ifstream file(path, std::ios::binary);
            if (!file.good()) {
                this->logger->error("[function] Failed to open file for reading: " + path.string());
                return json::value(nullptr);
            }
            std::vector<char> buffer(std::istreambuf_iterator<char>(file), {});
            file.close();
            this->logger->debug("[function] Read " + std::to_string(buffer.size()) + " bytes from " + path.string());
            
            std::string contents(buffer.begin(), buffer.end());
            return json::value(contents);
    }))->add("write_file",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::filesystem::path path(params[0].as_string().c_str());
            std::string contents(params[1].as_string().c_str());
            bool append = params[2].as_object().at("append").as_bool();
            
            std::ios::openmode mode = std::ios::binary;
            mode |= append ? std::ios::app : std::ios::trunc;
            
            std::filesystem::path parent_path = path.parent_path();
            if (std::filesystem::is_directory(path)) {
                this->logger->error("[function] Can't write to a directory " + path.string());
                return json::value(false);
            } else if (!std::filesystem::exists(parent_path)) {
                this->logger->error("[function] Directory '" + parent_path.string() + "' doesn't exist.");
                return json::value(false);
            }
            
            std::ofstream file(path, mode);
            if (file.bad()) {
                this->logger->error("[function] Bad file " + path.string());
                return json::value(false);
            }
            if (contents.empty()) {
                this->logger->debug("Input content empty. Attempting empty write");
            }
            file.write(contents.data(), contents.size());
            file.close();
            this->logger->debug(std::string("[function] ") +(append ? "Appended " : "Wrote ") + std::to_string(contents.size()) + " bytes to " + path.string());
            return json::value(true);
    }))->add("exists",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::filesystem::path path(this->getSingleParameter(req).as_string().c_str());
            return json::value(std::filesystem::exists(path));
    }))->add("is_dir",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::filesystem::path path(this->getSingleParameter(req).as_string().c_str());
            return json::value(std::filesystem::is_directory(path));
    }))->add("mk_dir",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::filesystem::path path(this->getSingleParameter(req).as_string().c_str());
            if (std::filesystem::exists(path)) {
                this->logger->error("[function] File/dir already exists at '" + path.string() + "'");
                return json::value(false);
            }
            std::error_code ec;
            std::filesystem::create_directory(path, ec);
            if (ec) {
                this->logger->error("[function] " + ec.message());
                return json::value(false);
            }
            return json::value(true);
    }))->add("rm",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::filesystem::path path(params[0].as_string().c_str());
            bool recursive = params[1].as_object().at("recursive").as_bool();
            
            std::error_code ec;
            if (!std::filesystem::exists(path)) {
                this->logger->error("[function] Cannot delete file/dir that doesn't exist: " + path.string());
                return json::value(false);
            } else if (std::filesystem::is_directory(path)) {
                if (recursive) {
                    std::filesystem::remove_all(path, ec);
                } else {
                    std::filesystem::remove(path, ec);
                }
                if (ec) {
                    this->logger->error("[function] " + ec.message());
                    return json::value(false);
                }
                return json::value(true);
            }
            std::filesystem::remove(path, ec);
            if (ec) {
                this->logger->error("[function] " + ec.message());
                return json::value(false);
            }
            return json::value(true);
    }))->add("ls",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::filesystem::path path(this->getSingleParameter(req).as_string().c_str());
            if (!std::filesystem::is_directory(path)) {
                this->logger->error("[function] Path entered to ls wasn't a dir: " + path.string());
                return json::value(nullptr);
            }
            std::error_code ec;
            json::array array;
            for (const auto& entry : std::filesystem::directory_iterator(path, ec)) {
                array.push_back(json::string(entry.path().string()));
            }
            if (ec) {
                this->logger->error("[function] " + ec.message());
                return json::value(nullptr);
            }
            return json::value(array);
    }))->add("rename",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::filesystem::path orig_path(params[0].as_string().c_str());
            std::filesystem::path new_path(params[1].as_string().c_str());
            bool overwrite = params[2].as_object().at("overwrite").as_bool();
            
            std::error_code ec;
            if (!std::filesystem::exists(orig_path)) {
                this->logger->error("[function] Can't rename path that doesn't exist: " + orig_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path) && !overwrite) {
                this->logger->error("[function] Can't overwrite already-existing new path if settings.overwrite is false: " + new_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path)) {
                if (std::filesystem::is_directory(new_path)) {
                    std::filesystem::remove_all(new_path, ec);
                } else {
                    std::filesystem::remove(new_path, ec);
                }
                if (ec) {
                    this->logger->error("[function] " + ec.message());
                    return json::value(false);
                }
            }
            std::filesystem::rename(orig_path, new_path, ec);
            if (ec) {
                this->logger->error("[function] " + ec.message());
                return json::value(false);
            }
            return json::value(true);
    }))->add("copy",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::filesystem::path orig_path(params[0].as_string().c_str());
            std::filesystem::path new_path(params[1].as_string().c_str());
            bool overwrite = params[2].as_object().at("overwrite").as_bool();
            
            std::error_code ec;
            if (!std::filesystem::exists(orig_path)) {
                this->logger->error("[function] Can't copy path that doesn't exist: " + orig_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path) && !overwrite) {
                this->logger->error("[function] Can't overwrite already-existing new path if settings.overwrite is false: " + new_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path)) {
                if (std::filesystem::is_directory(new_path)) {
                    std::filesystem::remove_all(new_path, ec);
                } else {
                    std::filesystem::remove(new_path, ec);
                }
                if (ec) {
                    this->logger->error("[function] " + ec.message());
                    return json::value(false);
                }
            }
            if (std::filesystem::is_directory(orig_path)) {
                std::filesystem::copy(orig_path, new_path, std::filesystem::copy_options::recursive, ec);
            } else {
                std::filesystem::copy(orig_path, new_path, ec);
            }
            if (ec) {
                this->logger->error("[function] " + ec.message());
                return json::value(false);
            }
            return json::value(true);
    }))->add("get_application_dir_path",
        std::function<json::value(const json::value&)>([](const json::value& req) -> json::value {
            (void)req;
            return json::value(Locate::currentDirectory().string());
    }))->add("download_uri",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            const std::string uri = this->getSingleParameter(req).as_string().c_str();
        #if defined(_WIN32)
            // Navigate to URI - WebView2 will automatically prompt download for non-HTML content
            std::wstring wuri(uri.begin(), uri.end());
            this->app->w->navigate(uri);
            this->logger->info("[function] Initiated download for: " + uri);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    NSString* urlString = [NSString stringWithUTF8String:uri.c_str()];
                    NSURL* url = [NSURL URLWithString:urlString];
                    NSURLRequest* request = [NSURLRequest requestWithURL:url];
                    if ([webview respondsToSelector:@selector(startDownloadUsingRequest:completionHandler:)]) {
                        [webview performSelector:@selector(startDownloadUsingRequest:completionHandler:) withObject:request withObject:nil];
                    } else {
                        this->logger->warn("[function] WKWebView download not available on this macOS version");
                    }
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            webkit_web_view_download_uri(WEBKIT_WEB_VIEW(webview_widget), uri.c_str());
        #endif
            return json::value(nullptr);
    }));

    return this;
}
#pragma endregion
#pragma region ConfigCallbacks
WF* WF::setConfigCallbacks() {
    this->config_callbacks
    ->add("get_config",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            json::value config = this->app->config->getJson();
            if (config.is_object()) {
                config = JSON::merge(config.as_object(), this->getState());
            } else {
                config = this->getState();
            }
            return config;
    }))->add("save_config",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->app->config->update(this->getState());
            return json::value(nullptr);
    }))->add("load_config",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->logger->error("[function] load_config doesn't do anything!");
            return json::value(nullptr);
    }))->add("set_config_property",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string key = params[0].as_string().c_str();
            this->app->config->setProperty(key, std::move(params[1]));
            return json::value(nullptr);
    }))->add("reset_to_defaults",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->logger->critical("[function] reset_to_defaults NOT IMPLEMENTED");
            return json::value(nullptr);
    }));
    return this;
}
#pragma endregion
#pragma region SystemCallbacks
WF* WF::setSystemCallbacks() {
    this->system_callbacks
    ->add("get_pid",
        std::function<json::value(const json::value&)>([](const json::value& req) -> json::value {
            (void)req;
            return json::value(boost::this_process::get_id());
    }))->add("get_OS",
        std::function<json::value(const json::value&)>([](const json::value& req) -> json::value {
            (void)req;
            #if defined(_WIN32)
                return json::string("Windows");
            #elif defined(__APPLE__)
                return json::string("Apple");
            #elif defined(__linux__)
                return json::string("Linux");
            #endif
    }));
    return this;
}
#pragma endregion
#pragma region ProcessCallbacks
WF* WF::setProcessCallbacks() {
    auto getManager = [this](const std::string& process_type) -> RenWeb::IRoutineManager<std::string>* {
        if (process_type == "daemon") {
            return this->app->daem.get();
        } else if (process_type == "pipe") {
            return this->app->pipem.get();
        } else { // default to "process"
            return this->app->procm.get();
        }
    };

    this->process_callbacks
    ->add("process_start",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            std::string key = params[1].as_string().c_str();
            json::array args_json = params[2].as_array();
            
            std::vector<std::string> args;
            for (const auto& arg : args_json) {
                args.push_back(std::string(arg.as_string().c_str()));
            }
            
            int pid = getManager(process_type)->add(key, args);
            return json::value(pid);
    }))->add("process_kill",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            std::string key = params[1].as_string().c_str();
            
            getManager(process_type)->kill(key);
            return json::value(nullptr);
    }))->add("process_has",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            std::string key = params[1].as_string().c_str();
            
            return json::value(getManager(process_type)->has(key));
    }))->add("process_has_pid",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            int pid = static_cast<int>(params[1].as_int64());
            
            return json::value(getManager(process_type)->hasPID(pid));
    }))->add("process_has_running",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            std::string key = params[1].as_string().c_str();
            
            return json::value(getManager(process_type)->hasRunning(key));
    }))->add("process_wait",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            std::string key = params[1].as_string().c_str();
            
            getManager(process_type)->wait(key);
            return json::value(nullptr);
    }))->add("process_wait_pid",
        std::function<json::value(const json::value&)>([getManager](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string process_type = params[0].as_string().c_str();
            int pid = static_cast<int>(params[1].as_int64());
            
            getManager(process_type)->waitPID(pid);
            return json::value(nullptr);
    }))->add("duplicate_process",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            
            if (this->app->orig_args.empty()) {
                this->logger->error("[function] Cannot duplicate process - no original arguments available");
                return json::value(nullptr);
            }
            
            std::string unique_key = "duplicate_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
            
            int pid = this->app->daem->add(unique_key, this->app->orig_args);
            this->logger->info("[function] Duplicated process with PID: " + std::to_string(pid) + ", terminating current process");
            
            // Schedule termination after a short delay to allow response to be sent
            std::thread([this]() {
                std::this_thread::sleep_for(std::chrono::milliseconds(500));
                this->app->w->terminate();
            }).detach();
            
            return json::value(pid);
    }))
// -----------------------------------------
// ------------- PIPE-SPECIFIC -------------
// -----------------------------------------
        ->add("pipe_read",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string key = params[0].as_string().c_str();
            bool read_all = params.size() > 1 && !params[1].is_null() ? true : false;
            
            auto* pipemgr = dynamic_cast<RenWeb::PipeManager<std::string>*>(this->app->pipem.get());
            if (pipemgr == nullptr) {
                return json::value(nullptr);
            }
            const RenWeb::ipstreams* streams = pipemgr->get(key);
            if (streams == nullptr) {
                return json::value(nullptr);
            }
            
            json::object result;
            if (read_all) {
                json::array out_lines, err_lines;
                std::string line;
                while (std::getline(const_cast<ipstream&>(streams->out), line)) {
                    out_lines.push_back(json::string(line));
                }
                while (std::getline(const_cast<ipstream&>(streams->err), line)) {
                    err_lines.push_back(json::string(line));
                }
                result["out"] = out_lines;
                result["err"] = err_lines;
            } else {
                std::string out_line, err_line;
                if (std::getline(const_cast<ipstream&>(streams->out), out_line)) {
                    result["out"] = json::string(out_line);
                } else {
                    result["out"] = json::value(nullptr);
                }
                if (std::getline(const_cast<ipstream&>(streams->err), err_line)) {
                    result["err"] = json::string(err_line);
                } else {
                    result["err"] = json::value(nullptr);
                }
            }
            return json::value(result);
    }))->add("pipe_read_pid",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            int pid = static_cast<int>(params[0].as_int64());
            bool read_all = params.size() > 1 && !params[1].is_null() ? true : false;
            
            auto* pipemgr = dynamic_cast<RenWeb::PipeManager<std::string>*>(this->app->pipem.get());
            if (pipemgr == nullptr) {
                return json::value(nullptr);
            }
            const RenWeb::ipstreams* streams = pipemgr->getPID(pid);
            if (streams == nullptr) {
                return json::value(nullptr);
            }
            
            json::object result;
            if (read_all) {
                json::array out_lines, err_lines;
                std::string line;
                while (std::getline(const_cast<ipstream&>(streams->out), line)) {
                    out_lines.push_back(json::string(line));
                }
                while (std::getline(const_cast<ipstream&>(streams->err), line)) {
                    err_lines.push_back(json::string(line));
                }
                result["out"] = out_lines;
                result["err"] = err_lines;
            } else {
                std::string out_line, err_line;
                if (std::getline(const_cast<ipstream&>(streams->out), out_line)) {
                    result["out"] = json::string(out_line);
                } else {
                    result["out"] = json::value(nullptr);
                }
                if (std::getline(const_cast<ipstream&>(streams->err), err_line)) {
                    result["err"] = json::string(err_line);
                } else {
                    result["err"] = json::value(nullptr);
                }
            }
            return json::value(result);
    }))
// -----------------------------------------
// ------------ OPENING HELPERS -----------
// -----------------------------------------
        ->add("open_uri",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string resource = req.as_array()[0].as_string().c_str();            
            for (size_t i = 0; i < resource.length(); i++) {
                if (resource[i] == '\\') resource[i] = '/';
            }
            
        #if defined(_WIN32)
            system(("start " + resource).c_str());
            this->logger->warn("[function] open_uri has not been tested for Windows");
        #elif defined(__APPLE__)
            system(("open " + resource).c_str());
            this->logger->warn("[function] open_uri has not been tested for Apple");
        #elif defined(__linux__)
            int res = system(("xdg-open " + resource).c_str());
            (void)res;
        #endif
            return json::value(nullptr);
    }))->add("open_window",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            std::string uri = params[0].as_string().c_str();
            bool is_single = params[1].as_bool();
            std::vector<std::string> args;
            for (const auto& i : this->app->orig_args) {
                if (i.substr(0, 2) != "-p") {
                    args.push_back(i);
                }
            }
            args.push_back("-p"+uri);
            if (is_single) {
                if (!this->app->procm->has(uri)) {
                    this->logger->debug("[function] Attempting to start single process for uri '" + uri + "'");
                    int pid = this->app->procm->add(uri, args);
                    return json::value(pid);
                } else {
                    this->logger->debug("[function] Process of name '" + uri + "' is already running");
                    return json::value(nullptr);
                }
            } else {
                this->logger->debug("[function] Attempting to start process for uri '" + uri + "'");
                std::string unique_key = uri + "_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
                int pid = this->app->procm->add(unique_key, args);
                return json::value(pid);
            }
    }));
    return this;
}
#pragma endregion
#pragma region SignalCallbacks
WF* WF::setSignalCallbacks() {
    this->signal_callbacks
    ->add("signal_add",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            json::array params = req.as_array();
            int signal_num = static_cast<int>(params[0].as_int64());
            std::string callback_name = params[1].as_string().c_str();
            
            this->app->signalm->add(signal_num, [this, callback_name](int sig) {
                std::string js_code = callback_name + "(" + std::to_string(sig) + ");";
                this->app->w->eval(js_code);
            });
            
            return json::value(nullptr);
    }))->add("signal_remove",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            int signal_num = static_cast<int>(req.as_array()[0].as_int64());
            this->app->signalm->remove(signal_num);
            return json::value(nullptr);
    }))->add("signal_has",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            int signal_num = static_cast<int>(req.as_array()[0].as_int64());
            return json::value(this->app->signalm->has(signal_num));
    }))->add("signal_clear",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->app->signalm->clear();
            return json::value(nullptr);
    }))->add("signal_count",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            return json::value(static_cast<int64_t>(this->app->signalm->count()));
    }))->add("signal_trigger",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            int signal_num = static_cast<int>(req.as_array()[0].as_int64());
            this->app->signalm->trigger(signal_num);
            return json::value(nullptr);
    }));
    return this;
}
#pragma endregion
#pragma region DebugCallbacks
WF* WF::setDebugCallbacks() {
    this->debug_callbacks
    ->add("clear_console",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->app->w->eval("console.clear();");
            return json::value(nullptr);
    }))->add("open_devtools",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto widget_opt = this->app->w->widget();
            if (!widget_opt.has_value()) {
                this->logger->error("[function] WebView2 widget not available");
                return json::value(nullptr);
            }
            
            // Use proper WebView2 API to open DevTools
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    webview2->OpenDevToolsWindow();
                    this->logger->info("[function] DevTools opened via ICoreWebView2::OpenDevToolsWindow()");
                }
            }
        #elif defined(__APPLE__)
            // macOS WKWebView inspector
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    id config = [webview configuration];
                    id preferences = [config preferences];
                    [preferences setValue:@YES forKey:@"developerExtrasEnabled"];
                    // Show the inspector
                    [(id)[webview performSelector:@selector(_inspector)] performSelector:@selector(show)];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitWebInspector* inspector = webkit_web_view_get_inspector(WEBKIT_WEB_VIEW(webview_widget));
            webkit_web_inspector_show(inspector);
        #endif
            return json::value(nullptr);
    }))->add("close_devtools",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            this->logger->error("[function] Can't close devtools programmatically on windows.");
        #elif defined(__APPLE__)
            // macOS WKWebView inspector close
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    [(id)[webview performSelector:@selector(_inspector)] performSelector:@selector(close)];
                }
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            WebKitWebInspector* inspector = webkit_web_view_get_inspector(WEBKIT_WEB_VIEW(webview_widget));
            webkit_web_inspector_close(inspector);
        #endif
            return json::value(nullptr);
    }));
    return this;
}
#pragma endregion
#pragma region NetworkCallbacks
WF* WF::setNetworkCallbacks() {
    this->network_callbacks
    ->add("get_load_progress",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            this->logger->warn("[function] get_load_progress not yet implemented for Windows");
            return json::value(0.0);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    double progress = [[webview valueForKey:@"estimatedProgress"] doubleValue];
                    return json::value(progress);
                }
            }
            return json::value(0.0);
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            double progress = webkit_web_view_get_estimated_load_progress(WEBKIT_WEB_VIEW(webview_widget));
            return json::value(progress);
        #endif
    }))->add("is_loading",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            this->logger->warn("[function] is_loading not yet implemented for Windows");
            return json::value(false);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                BOOL loading = [[webview valueForKey:@"isLoading"] boolValue];
                return json::value(static_cast<bool>(loading));
            }
            return json::value(false);
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            gboolean loading = webkit_web_view_is_loading(WEBKIT_WEB_VIEW(webview_widget));
            return json::value(static_cast<bool>(loading));
        #endif
    }));
    return this;
}
#pragma endregion
#pragma region NavigateCallbacks
WF* WF::setNavigateCallbacks() {
    this->navigate_callbacks
    ->add("navigate_back",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    webview2->GoBack();
                }
            }
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                [webview performSelector:@selector(goBack)];
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            webkit_web_view_go_back(WEBKIT_WEB_VIEW(webview_widget));
        #endif
            return json::value(nullptr);
    }))->add("navigate_forward",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    webview2->GoForward();
                }
            }
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                [webview performSelector:@selector(goForward)];
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            webkit_web_view_go_forward(WEBKIT_WEB_VIEW(webview_widget));
        #endif
            return json::value(nullptr);
    }))->add("stop_loading",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    webview2->Stop();
                }
            }
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                [webview stopLoading];
            }
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            webkit_web_view_stop_loading(WEBKIT_WEB_VIEW(webview_widget));
        #endif
            return json::value(nullptr);
    }))->add("can_go_back",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    BOOL can_go = FALSE;
                    webview2->get_CanGoBack(&can_go);
                    return json::value(static_cast<bool>(can_go));
                }
            }
            return json::value(false);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                BOOL canGo = (BOOL)[webview canGoBack];
                return json::value(static_cast<bool>(canGo));
            }
            return json::value(false);
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            gboolean can_go = webkit_web_view_can_go_back(WEBKIT_WEB_VIEW(webview_widget));
            return json::value(static_cast<bool>(can_go));
        #endif
    }))->add("can_go_forward",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            auto webview2_opt = this->app->w->widget();
            if (webview2_opt.has_value()) {
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (webview2) {
                    BOOL can_go = FALSE;
                    webview2->get_CanGoForward(&can_go);
                    return json::value(static_cast<bool>(can_go));
                }
            }
            return json::value(false);
        #elif defined(__APPLE__)
            auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                BOOL canGo = (BOOL)[webview canGoForward];
                return json::value(static_cast<bool>(canGo));
            }
            return json::value(false);
        #elif defined(__linux__)
            auto webview_widget = this->app->w->widget().value();
            gboolean can_go = webkit_web_view_can_go_forward(WEBKIT_WEB_VIEW(webview_widget));
            return json::value(static_cast<bool>(can_go));
        #endif
    }));
    return this;
}
#pragma endregion
#pragma region InternalCallbacks
WF* WF::setInternalCallbacks() {
    this->internal_callbacks->add("dependency_check",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            #if defined(__linux__)
                if (system("which gst-inspect-1.0 > /dev/null 2>&1") != 0) {
                    this->logger->warn("[function] gst-inspect-1.0 not found. GStreamer may not be installed.");
                    this->logger->warn("[function] HTML5 media playback will not work without GStreamer.");
                    this->logger->warn("[function] Installation guide: https://gstreamer.freedesktop.org/documentation/installing/on-linux.html");
                } else {
                    if (system("gst-inspect-1.0 x264enc > /dev/null 2>&1") != 0) {
                        this->logger->warn("[function] GStreamer plugins-ugly not detected (MP3 codec support missing).");
                        this->logger->warn("[function] This package may have patent/licensing restrictions in some jurisdictions.");
                        this->logger->warn("[function] Install at your own discretion: https://gstreamer.freedesktop.org/documentation/installing/on-linux.html");
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
                    this->logger->warn("[function] WebView2 Runtime not found. Downloading installer...");
                    
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
                        this->logger->error("[function] Failed to download WebView2 installer.");
                        this->logger->error("[function] Please download manually: https://developer.microsoft.com/microsoft-edge/webview2/");
                        throw std::runtime_error("[function] WebView2 not installed");
                    }

                    this->logger->info("[function] Download complete. Launching installer...");
                    
                    // Launch installer and wait for completion
                    SHELLEXECUTEINFOA sei = { sizeof(sei) };
                    sei.fMask = SEE_MASK_NOCLOSEPROCESS;
                    sei.lpFile = installerPath.c_str();
                    sei.nShow = SW_SHOW;
                    
                    if (!ShellExecuteExA(&sei) || !sei.hProcess) {
                        DeleteFileA(installerPath.c_str());
                        this->logger->error("[function] Failed to launch WebView2 installer.");
                        throw std::runtime_error("[function] Failed to launch installer");
                    }
                    
                    // Wait for installer to complete
                    WaitForSingleObject(sei.hProcess, INFINITE);
                    CloseHandle(sei.hProcess);
                    
                    // Clean up
                    DeleteFileA(installerPath.c_str());

                    this->logger->info("[function] WebView2 installation complete. Continuing...");
                } else {
                    RegCloseKey(hKey);
                }
            #endif
            return json::value(nullptr);
        }))->add("process_permissions",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            #if defined(__linux__)
                auto widget_result = this->app->w->widget();
                if (!widget_result.has_value()) {
                    this->logger->error("[function] Failed to get webview widget for permission setup");
                    return json::value(nullptr);
                }
                WebKitWebView* webview = WEBKIT_WEB_VIEW(widget_result.value());
                
                WebKitSettings* settings = webkit_web_view_get_settings(webview);
                webkit_settings_set_enable_developer_extras(settings, TRUE);
                webkit_settings_set_enable_context_menu(settings, FALSE);

                struct PermissionCtx { App* app; std::shared_ptr<ILogger> logger; };
                auto *ctx = new PermissionCtx{ this->app, this->logger };
                g_object_set_data_full(G_OBJECT(webview), "renweb-perm-ctx", ctx,
                                    [](gpointer p){ delete static_cast<PermissionCtx*>(p); });
                g_signal_connect(webview, "permission-request", G_CALLBACK(+[](WebKitWebView* /*webview*/, WebKitPermissionRequest* request, gpointer user_data) -> gboolean {
                    auto *ctx = static_cast<PermissionCtx*>(user_data);
                    App* app = ctx->app;
                    std::shared_ptr<ILogger> logger = ctx->logger;
                    (void)user_data;
                    
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
                        logger->info("[permissions] Geolocation permission request: " + std::string(allowed ? "allowing" : "denying"));
                    } else if (WEBKIT_IS_NOTIFICATION_PERMISSION_REQUEST(request)) {
                        allowed = check_permission("notifications", true);
                        logger->info("[permissions] Notifications permission request: " + std::string(allowed ? "allowing" : "denying"));
                    } else if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(request)) {
                        allowed = check_permission("media_devices", false);
                        logger->info("[permissions] Media devices permission request: " + std::string(allowed ? "allowing" : "denying"));
                    } else if (WEBKIT_IS_POINTER_LOCK_PERMISSION_REQUEST(request)) {
                        allowed = check_permission("pointer_lock", false);
                        logger->info("[permissions] Pointer lock permission request: " + std::string(allowed ? "allowing" : "denying"));
                    } else if (WEBKIT_INSTALL_MISSING_MEDIA_PLUGINS_PERMISSION_REQUEST(request)) {
                        allowed = check_permission("install_missing_media_plugins", true);
                        logger->info("[permissions] Install missing media plugins permission request: " + std::string(allowed ? "allowing" : "denying"));
                    } else if (WEBKIT_DEVICE_INFO_PERMISSION_REQUEST(request)) {
                        allowed = check_permission("device_info", true);
                        logger->info("[permissions] Device info permission request: " + std::string(allowed ? "allowing" : "denying"));
                    }
                    allowed ? webkit_permission_request_allow(request) : webkit_permission_request_deny(request);
                    return TRUE;
                }), ctx);
            #elif defined(_WIN32)
                // Windows WebView2: Implement proper permission handling
                
                auto webview2_opt = this->app->w->widget();
                if (!webview2_opt.has_value()) {
                    this->logger->warn("[permissions] WebView2 not available, permission handling skipped");
                    return json::value(nullptr);
                }
                
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (!webview2) {
                    this->logger->warn("[permissions] WebView2 pointer invalid, permission handling skipped");
                    return json::value(nullptr);
                }
                
                // Enable DevTools manually (independent of debug flag)
                ICoreWebView2Settings* settings = nullptr;
                HRESULT hr = webview2->get_Settings(&settings);
                if (SUCCEEDED(hr) && settings) {
                    settings->put_AreDevToolsEnabled(TRUE);
                    settings->put_AreDefaultContextMenusEnabled(FALSE);
                    this->logger->info("[permissions] DevTools explicitly enabled");
                    this->logger->info("[permissions] Context menus disabled");
                }
                
                // Get permissions configuration from info.json
                const json::value& perms_from_info = this->app->info->getProperty("permissions");
                const json::object perms = (perms_from_info.is_object()) ? perms_from_info.as_object() : json::object{};
                
                auto check_permission = [&](const char* key, bool default_value) -> bool {
                    return (perms.contains(key) && perms.at(key).is_bool())
                        ? perms.at(key).as_bool()
                        : default_value;
                };
                
                // Log the permission configuration
                this->logger->info("[permissions] Permission policy from info.json:");
                this->logger->info("  - Geolocation: " + std::string(check_permission("geolocation", false) ? "allowed" : "denied"));
                this->logger->info("  - Media devices: " + std::string(check_permission("media_devices", false) ? "allowed" : "denied"));
                this->logger->info("  - Notifications: " + std::string(check_permission("notifications", true) ? "allowed" : "denied"));
                this->logger->info("  - Clipboard: allowed");
                this->logger->info("  - Autoplay: allowed");
                this->logger->info("  - Local fonts: allowed");
                
                // Create permission context to hold settings
                struct PermissionContext {
                    bool allow_geolocation;
                    bool allow_media_devices;
                    bool allow_notifications;
                    std::shared_ptr<ILogger> logger;
                };
                
                auto* perm_ctx = new PermissionContext{
                    check_permission("geolocation", false),
                    check_permission("media_devices", false),
                    check_permission("notifications", true),
                    this->logger
                };
                
                // Register PermissionRequested event handler
                hr = webview2->add_PermissionRequested(
                    Microsoft::WRL::Callback<ICoreWebView2PermissionRequestedEventHandler>(
                        [perm_ctx](ICoreWebView2* sender, ICoreWebView2PermissionRequestedEventArgs* args) -> HRESULT {
                            (void)sender;
                            
                            COREWEBVIEW2_PERMISSION_KIND kind;
                            args->get_PermissionKind(&kind);
                            
                            COREWEBVIEW2_PERMISSION_STATE state = COREWEBVIEW2_PERMISSION_STATE_DENY;
                            std::string permission_name = "unknown";
                            
                            switch (kind) {
                                case COREWEBVIEW2_PERMISSION_KIND_MICROPHONE:
                                case COREWEBVIEW2_PERMISSION_KIND_CAMERA:
                                    permission_name = "media device";
                                    if (perm_ctx->allow_media_devices) {
                                        state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;
                                    }
                                    break;
                                    
                                case COREWEBVIEW2_PERMISSION_KIND_GEOLOCATION:
                                    permission_name = "geolocation";
                                    if (perm_ctx->allow_geolocation) {
                                        state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;
                                    }
                                    break;
                                    
                                case COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS:
                                    permission_name = "notifications";
                                    if (perm_ctx->allow_notifications) {
                                        state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;
                                    }
                                    break;
                                    
                                case COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ:
                                    permission_name = "clipboard read";
                                    state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;  // Allow clipboard
                                    break;
                                    
                                case COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY:
                                    permission_name = "autoplay";
                                    state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;  // Allow autoplay
                                    break;
                                    
                                case COREWEBVIEW2_PERMISSION_KIND_LOCAL_FONTS:
                                    permission_name = "local fonts";
                                    state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;  // Allow local fonts
                                    break;
                                    
                                case COREWEBVIEW2_PERMISSION_KIND_MIDI_SYSTEM_EXCLUSIVE_MESSAGES:
                                    permission_name = "MIDI";
                                    state = COREWEBVIEW2_PERMISSION_STATE_ALLOW;  // Allow MIDI
                                    break;
                                    
                                default:
                                    // For other permissions, deny by default
                                    break;
                            }
                            
                            args->put_State(state);
                            
                            if (state == COREWEBVIEW2_PERMISSION_STATE_ALLOW) {
                                perm_ctx->logger->info("[permissions] Granted " + permission_name + " permission");
                            } else {
                                perm_ctx->logger->info("[permissions] Denied " + permission_name + " permission");
                            }
                            
                            return S_OK;
                        }
                    ).Get(),
                    nullptr
                );
                
                if (SUCCEEDED(hr)) {
                    this->logger->info("[permissions] PermissionRequested event handler registered successfully");
                } else {
                    this->logger->error("[permissions] Failed to register PermissionRequested handler, HRESULT: " + std::to_string(hr));
                    delete perm_ctx;
                }                
            #elif defined(__APPLE__)
                // macOS WKWebView permission handling via WKUIDelegate
                auto window_result = this->app->w->window();
                if (!window_result.has_value()) {
                    this->logger->error("[function] Failed to get window for permission setup");
                    return json::value(nullptr);
                }
                
                id nsWindow = (__bridge id)window_result.value();
                id webview = nil;
                for (id view in [[nsWindow contentView] subviews]) {
                    if ([view isKindOfClass:NSClassFromString(@"WKWebView")]) {
                        webview = view;
                        break;
                    }
                }
                
                if (!webview) {
                    this->logger->error("[function] Failed to find WKWebView for permission setup");
                    return json::value(nullptr);
                }
                
                // Enable developer extras
                id config = [webview configuration];
                id preferences = [config preferences];
                [preferences setValue:@YES forKey:@"developerExtrasEnabled"];
                [preferences setValue:@YES forKey:@"javaScriptEnabled"];
                [preferences setValue:@NO forKey:@"contextMenuEnabled"];
                
                const json::value& perms_from_info = this->app->info->getProperty("permissions");
                const json::object perms = (perms_from_info.is_object()) ? perms_from_info.as_object() : json::object{};
                
                auto check_permission = [&](const char* key, bool default_value) -> bool {
                    return (perms.contains(key) && perms.at(key).is_bool())
                        ? perms.at(key).as_bool()
                        : default_value;
                };
                
                // Create and configure permission delegate
                static Class delegateClass = nil;
                if (!delegateClass) {
                    delegateClass = objc_allocateClassPair([NSObject class], "RenWebPermissionDelegate", 0);
                    
                    // Consolidated permission handler
                    auto addPermHandler = [](Class cls, SEL selector, const char* permKey, bool defVal, const char* sig) {
                        IMP imp = imp_implementationWithBlock(^(id self, id wv, id org, id frm, id typeOrHandler, id handler) {
                            App* app = (__bridge App*)objc_getAssociatedObject(self, "app");
                            auto* logPtr = (std::shared_ptr<ILogger>*)[(NSValue*)objc_getAssociatedObject(self, "logger") pointerValue];
                            
                            const json::value& pInfo = app->info->getProperty("permissions");
                            const json::object perms = pInfo.is_object() ? pInfo.as_object() : json::object{};
                            bool allowed = perms.contains(permKey) && perms.at(permKey).is_bool() ? perms.at(permKey).as_bool() : defVal;
                            
                            if (logPtr) (*logPtr)->info(std::string("[function] ") + permKey + ": " + (allowed ? "allow" : "deny"));
                            
                            void (^h)(int) = handler ? handler : typeOrHandler;
                            h(allowed ? 1 : 0);
                        });
                        class_addMethod(cls, selector, imp, sig);
                    };
                    
                    addPermHandler(delegateClass, 
                        NSSelectorFromString(@"webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:"),
                        "media_devices", false, "v@:@@@@@");
                    addPermHandler(delegateClass,
                        NSSelectorFromString(@"webView:requestDeviceOrientationAndMotionPermissionForOrigin:initiatedByFrame:decisionHandler:"),
                        "device_info", true, "v@:@@@@");
                    
                    IMP geoImp = imp_implementationWithBlock(^(id self, id wv, id frame, id origin, id handler) {
                        App* app = (__bridge App*)objc_getAssociatedObject(self, "app");
                        auto* logPtr = (std::shared_ptr<ILogger>*)[(NSValue*)objc_getAssociatedObject(self, "logger") pointerValue];
                        
                        const json::value& pInfo = app->info->getProperty("permissions");
                        const json::object perms = pInfo.is_object() ? pInfo.as_object() : json::object{};
                        bool allowed = perms.contains("geolocation") && perms.at("geolocation").is_bool() ? perms.at("geolocation").as_bool() : false;
                        
                        if (logPtr) (*logPtr)->info(std::string("[permissions] geolocation: ") + (allowed ? "allow" : "deny"));
                        
                        if (allowed) [origin performSelector:NSSelectorFromString(@"allow")];
                        else [origin performSelector:NSSelectorFromString(@"deny")];
                    });
                    class_addMethod(delegateClass, 
                        NSSelectorFromString(@"webView:decidePolicyForGeolocationPermissionRequest:frame:"),
                        geoImp, "v@:@@@");
                    
                    objc_registerClassPair(delegateClass);
                }
                
                id delegate = [[delegateClass alloc] init];
                objc_setAssociatedObject(delegate, "app", (__bridge id)this->app, OBJC_ASSOCIATION_ASSIGN);
                auto* logger_ptr = new std::shared_ptr<ILogger>(this->logger);
                objc_setAssociatedObject(delegate, "logger", [NSValue valueWithPointer:logger_ptr], OBJC_ASSOCIATION_RETAIN);
                [webview setUIDelegate:delegate];
                
                this->logger->info("[permissions] Permission delegate installed");
                this->logger->info("[permissions] Permission policy from info.json:");
                this->logger->info("  - Geolocation: " + std::string(check_permission("geolocation", false) ? "allowed" : "denied"));
                this->logger->info("  - Media devices: " + std::string(check_permission("media_devices", false) ? "allowed" : "denied"));
                this->logger->info("  - Device info: " + std::string(check_permission("device_info", true) ? "allowed" : "denied"));
            #endif
            return json::value(nullptr);
    }))->add("process_security",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            #if defined(__linux__)
                auto widget_result = this->app->w->widget();
                if (!widget_result.has_value()) {
                    this->logger->error("[function] Failed to get webview widget for security setup");
                    return json::value(nullptr);
                }
                WebKitWebView* webview = WEBKIT_WEB_VIEW(widget_result.value());
                
                // Navigation policy handler - blocks disallowed URIs
                g_signal_connect(webview, "decide-policy", G_CALLBACK(+[](
                    WebKitWebView* web_view, WebKitPolicyDecision* decision, WebKitPolicyDecisionType type, gpointer user_data) -> gboolean {
                    auto* wf = static_cast<WF*>(user_data);
                    const char* uri = nullptr;
                    
                    if (type == WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION || type == WEBKIT_POLICY_DECISION_TYPE_NEW_WINDOW_ACTION) {
                        uri = webkit_uri_request_get_uri(webkit_navigation_action_get_request(
                            webkit_navigation_policy_decision_get_navigation_action(WEBKIT_NAVIGATION_POLICY_DECISION(decision))));
                    } else if (type == WEBKIT_POLICY_DECISION_TYPE_RESPONSE) {
                        uri = webkit_uri_request_get_uri(webkit_response_policy_decision_get_request(WEBKIT_RESPONSE_POLICY_DECISION(decision)));
                    }
                    
                    std::string uri_str = uri ? uri : "";
                    if (uri_str.find("about:") == 0 || uri_str.find("file:") == 0) {
                        webkit_policy_decision_use(decision);
                        return TRUE;
                    }
                    
                    if (uri && !wf->app->ws->isURIAllowed(uri)) {
                        wf->logger->warn("[security] Blocked: " + std::string(uri));
                        webkit_policy_decision_ignore(decision);
                        webkit_web_view_load_html(web_view, IWebServer::generateBlockedNavigationHTML(uri,
                            "This URL is not in the list of allowed origins. Only resources from trusted sources can be accessed.").c_str(), "about:blank");
                        return TRUE;
                    }
                    webkit_policy_decision_use(decision);
                    return TRUE;
                }), this);
                
                // Build content blocker using origins whitelist
                auto extract_domain = [](const std::string& url) {
                    size_t start = url.find("://");
                    if (start == std::string::npos) return std::string("");
                    start += 3;
                    size_t end = url.find('/', start);
                    return (end == std::string::npos) ? url.substr(start) : url.substr(start, end - start);
                };
                
                std::vector<std::string> allowed_domains;
                allowed_domains.push_back(extract_domain(this->app->ws->getURL()));
                
                const auto origins = this->app->info->getProperty("origins");
                if (origins.is_array()) {
                    for (const auto& origin : origins.as_array()) {
                        if (origin.is_string()) {
                            std::string domain = extract_domain(origin.as_string().c_str());
                            if (!domain.empty()) allowed_domains.push_back(domain);
                        }
                    }
                }
                
                json::array rules;
                if (!allowed_domains.empty()) {
                    json::array unless_domains;
                    for (const auto& d : allowed_domains) unless_domains.emplace_back(d);
                    
                    rules.emplace_back(json::object{
                        {"trigger", json::object{
                            {"url-filter", ".*"},
                            {"resource-type", json::array{"image", "style-sheet", "script", "font", "raw", "svg-document", "media"}},
                            {"load-type", json::array{"third-party"}},
                            {"unless-domain", unless_domains}
                        }},
                        {"action", json::object{{"type", "block"}}}
                    });
                }
                
                std::string rules_json = json::serialize(rules);
                this->logger->debug("[security] Content filter: " + std::to_string(allowed_domains.size()) + " allowed domains");
                
                GBytes* rules_bytes = g_bytes_new(rules_json.c_str(), rules_json.length());
                WebKitUserContentFilterStore* store = webkit_user_content_filter_store_new("/tmp/renweb-filters");
                
                webkit_user_content_filter_store_save(store, "renweb-filter", rules_bytes, nullptr,
                    +[](GObject* src, GAsyncResult* res, gpointer data) {
                        auto* wf = static_cast<WF*>(data);
                        GError* err = nullptr;
                        auto* filter = webkit_user_content_filter_store_save_finish(WEBKIT_USER_CONTENT_FILTER_STORE(src), res, &err);
                        
                        if (filter) {
                            webkit_user_content_manager_add_filter(
                                webkit_web_view_get_user_content_manager(WEBKIT_WEB_VIEW(wf->app->w->widget().value())), filter);
                            webkit_user_content_filter_unref(filter);
                            wf->logger->info("[security] Content filter active");
                        } else {
                            wf->logger->error("[security] Content filter failed: " + std::string(err ? err->message : "unknown"));
                            if (err) g_error_free(err);
                        }
                    }, this);
                
                g_bytes_unref(rules_bytes);
                g_object_unref(store);
                
                // Load failure handler - only show error page for main frame navigation, log resource failures
                g_signal_connect(webview, "load-failed", G_CALLBACK(+[](
                    WebKitWebView* web_view, WebKitLoadEvent, gchar* failing_uri, GError* error, gpointer user_data) -> gboolean {
                    auto* wf = static_cast<WF*>(user_data);
                    if (failing_uri && std::string(failing_uri).find("about:") == 0) return FALSE;
                    
                    std::string uri_str = failing_uri ? failing_uri : "unknown";
                    std::string error_msg = error ? error->message : "unknown";
                    
                    // Check if this is the main page URI (not a resource)
                    const char* page_uri = webkit_web_view_get_uri(web_view);
                    bool is_main_page = !page_uri || (failing_uri && std::string(page_uri) == uri_str);
                    
                    if (is_main_page) {
                        // Main page failed to load - show full error page
                        wf->logger->error("[security] Page load failed: " + uri_str + " - " + error_msg);
                        webkit_web_view_load_html(web_view, IWebServer::generateErrorHTML(error ? error->code : 0, 
                            "Failed to Load Page", "Could not load: " + uri_str + 
                            (error ? std::string("<br><br><strong>Details:</strong> ") + error_msg : "")).c_str(), failing_uri);
                        return TRUE;
                    }
                    
                    // Resource failed - just log, don't disrupt the page
                    wf->logger->warn("[security] Resource load failed: " + uri_str + " - " + error_msg);
                    return FALSE;
                }), this);
                
                
            #elif defined(_WIN32)
                // Windows WebView2: Implement navigation filtering using NavigationStarting event
                
                auto webview2_opt = this->app->w->widget();
                if (!webview2_opt.has_value()) {
                    this->logger->warn("[security] WebView2 not available, navigation filtering skipped");
                    return json::value(nullptr);
                }
                
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (!webview2) {
                    this->logger->warn("[security] WebView2 pointer invalid, navigation filtering skipped");
                    return json::value(nullptr);
                }
                
                // Get allowed origins from info.json
                auto extract_domain = [](const std::string& url) {
                    size_t start = url.find("://");
                    if (start == std::string::npos) return std::string("");
                    start += 3;
                    size_t end = url.find('/', start);
                    return (end == std::string::npos) ? url.substr(start) : url.substr(start, end - start);
                };
                
                std::vector<std::string> allowed_domains;
                allowed_domains.push_back(extract_domain(this->app->ws->getURL()));
                
                const auto origins = this->app->info->getProperty("origins");
                if (origins.is_array()) {
                    for (const auto& origin : origins.as_array()) {
                        if (origin.is_string()) {
                            std::string domain = extract_domain(origin.as_string().c_str());
                            if (!domain.empty()) {
                                allowed_domains.push_back(domain);
                            }
                        }
                    }
                }
                
                // Log the security configuration
                this->logger->info("[security] Security policy from info.json:");
                this->logger->info("[security] Allowed origins: " + std::to_string(allowed_domains.size()) + " domains");
                for (const auto& domain : allowed_domains) {
                    this->logger->info("  - " + domain);
                }
                
                // Create navigation handler context
                struct NavigationContext {
                    std::vector<std::string> allowed_domains;
                    std::shared_ptr<ILogger> logger;
                    std::string last_blocked_uri;  // Track last blocked URI
                };
                
                auto* nav_ctx = new NavigationContext{allowed_domains, this->logger, ""};
                
                // Register NavigationStarting event handler
                HRESULT hr = webview2->add_NavigationStarting(
                    Microsoft::WRL::Callback<ICoreWebView2NavigationStartingEventHandler>(
                        [nav_ctx](ICoreWebView2* sender, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                            (void)sender;
                            
                            LPWSTR uri_wide = nullptr;
                            args->get_Uri(&uri_wide);
                            
                            if (!uri_wide) return S_OK;
                            
                            // Convert wide string to UTF-8
                            int size_needed = WideCharToMultiByte(CP_UTF8, 0, uri_wide, -1, nullptr, 0, nullptr, nullptr);
                            std::string uri(size_needed - 1, 0);
                            WideCharToMultiByte(CP_UTF8, 0, uri_wide, -1, &uri[0], size_needed, nullptr, nullptr);
                            CoTaskMemFree(uri_wide);
                            
                            // Allow about:, data:, blob:, and file: URLs
                            if (uri.find("about:") == 0 || uri.find("data:") == 0 || 
                                uri.find("blob:") == 0 || uri.find("file:") == 0) {
                                return S_OK;
                            }
                            
                            // Check if URL matches any allowed domain
                            bool allowed = false;
                            for (const auto& domain : nav_ctx->allowed_domains) {
                                if (uri.find(domain) != std::string::npos) {
                                    nav_ctx->logger->debug("[security] Allowed navigation to: " + uri);
                                    allowed = true;
                                    break;
                                }
                            }
                            
                            if (!allowed) {
                                nav_ctx->logger->warn("[security] Blocked navigation to: " + uri);
                                nav_ctx->last_blocked_uri = uri;  // Store for error handler
                                args->put_Cancel(TRUE);
                            }
                            
                            return S_OK;
                        }
                    ).Get(),
                    nullptr
                );
                
                if (SUCCEEDED(hr)) {
                    this->logger->info("[security] NavigationStarting event handler registered successfully");
                } else {
                    this->logger->error("[security] Failed to register NavigationStarting handler, HRESULT: " + std::to_string(hr));
                    delete nav_ctx;
                }
                
                // Register NavigationCompleted event handler for error pages
                struct ErrorContext {
                    WF* wf;
                    std::shared_ptr<ILogger> logger;
                    NavigationContext* nav_ctx;  // Reference to navigation context
                };
                
                auto* error_ctx = new ErrorContext{this, this->logger, nav_ctx};
                
                hr = webview2->add_NavigationCompleted(
                    Microsoft::WRL::Callback<ICoreWebView2NavigationCompletedEventHandler>(
                        [error_ctx](ICoreWebView2* sender, ICoreWebView2NavigationCompletedEventArgs* args) -> HRESULT {
                            BOOL is_success = FALSE;
                            args->get_IsSuccess(&is_success);
                            
                            if (!is_success) {
                                COREWEBVIEW2_WEB_ERROR_STATUS error_status;
                                args->get_WebErrorStatus(&error_status);
                                
                                // For canceled operations (security blocks), show blocked page
                                if (error_status == COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED) {
                                    if (!error_ctx->nav_ctx->last_blocked_uri.empty()) {
                                        std::string blocked_html = IWebServer::generateBlockedNavigationHTML(
                                            error_ctx->nav_ctx->last_blocked_uri,
                                            "This URL is not in the list of allowed origins. Only resources from trusted sources can be accessed.");
                                        
                                        int wide_size = MultiByteToWideChar(CP_UTF8, 0, blocked_html.c_str(), -1, nullptr, 0);
                                        std::wstring blocked_html_wide(wide_size, 0);
                                        MultiByteToWideChar(CP_UTF8, 0, blocked_html.c_str(), -1, &blocked_html_wide[0], wide_size);
                                        
                                        sender->NavigateToString(blocked_html_wide.c_str());
                                        
                                        // Clear the blocked URI
                                        error_ctx->nav_ctx->last_blocked_uri.clear();
                                    }
                                    return S_OK;
                                }
                                
                                LPWSTR uri_wide = nullptr;
                                sender->get_Source(&uri_wide);
                                
                                std::string uri = "unknown";
                                if (uri_wide) {
                                    int size_needed = WideCharToMultiByte(CP_UTF8, 0, uri_wide, -1, nullptr, 0, nullptr, nullptr);
                                    uri = std::string(size_needed - 1, 0);
                                    WideCharToMultiByte(CP_UTF8, 0, uri_wide, -1, &uri[0], size_needed, nullptr, nullptr);
                                    CoTaskMemFree(uri_wide);
                                }
                                
                                std::string error_msg;
                                int error_code = static_cast<int>(error_status);
                                
                                switch (error_status) {
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_UNKNOWN:
                                        error_msg = "Unknown error";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_COMMON_NAME_IS_INCORRECT:
                                        error_msg = "Certificate common name is incorrect";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_EXPIRED:
                                        error_msg = "Certificate expired";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CLIENT_CERTIFICATE_CONTAINS_ERRORS:
                                        error_msg = "Client certificate contains errors";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_REVOKED:
                                        error_msg = "Certificate revoked";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CERTIFICATE_IS_INVALID:
                                        error_msg = "Certificate is invalid";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_SERVER_UNREACHABLE:
                                        error_msg = "Server unreachable";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_TIMEOUT:
                                        error_msg = "Connection timeout";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_ERROR_HTTP_INVALID_SERVER_RESPONSE:
                                        error_msg = "Invalid server response";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED:
                                        error_msg = "Connection aborted";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_RESET:
                                        error_msg = "Connection reset";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_DISCONNECTED:
                                        error_msg = "Disconnected";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_CANNOT_CONNECT:
                                        error_msg = "Cannot connect";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_HOST_NAME_NOT_RESOLVED:
                                        error_msg = "Host name not resolved";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED:
                                        error_msg = "Navigation blocked by security policy or canceled by user";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_REDIRECT_FAILED:
                                        error_msg = "Redirect failed";
                                        break;
                                    case COREWEBVIEW2_WEB_ERROR_STATUS_UNEXPECTED_ERROR:
                                        error_msg = "Unexpected error";
                                        break;
                                    default:
                                        error_msg = "Error " + std::to_string(error_code);
                                        break;
                                }
                                
                                error_ctx->logger->error("[security] Page load failed: " + uri + " - " + error_msg);
                                
                                std::string error_html = IWebServer::generateErrorHTML(error_code, 
                                    "Failed to Load Page", 
                                    "Could not load: " + uri + "<br><br><strong>Details:</strong> " + error_msg);
                                
                                int wide_size = MultiByteToWideChar(CP_UTF8, 0, error_html.c_str(), -1, nullptr, 0);
                                std::wstring error_html_wide(wide_size, 0);
                                MultiByteToWideChar(CP_UTF8, 0, error_html.c_str(), -1, &error_html_wide[0], wide_size);
                                
                                sender->NavigateToString(error_html_wide.c_str());
                            }
                            
                            return S_OK;
                        }
                    ).Get(),
                    nullptr
                );
                
                if (SUCCEEDED(hr)) {
                    this->logger->info("[security] NavigationCompleted event handler registered successfully");
                } else {
                    this->logger->error("[security] Failed to register NavigationCompleted handler, HRESULT: " + std::to_string(hr));
                    delete error_ctx;
                }
                
            #elif defined(__APPLE__)
                auto window_result = this->app->w->window();
                if (!window_result.has_value()) {
                    this->logger->error("[function] Failed to get window for security setup");
                    return json::value(nullptr);
                }
                
                id nsWindow = (__bridge id)window_result.value();
                id webview = nil;
                for (id view in [[nsWindow contentView] subviews]) {
                    if ([view isKindOfClass:NSClassFromString(@"WKWebView")]) {
                        webview = view;
                        break;
                    }
                }
                
                if (!webview) {
                    this->logger->error("[function] Failed to find WKWebView for security setup");
                    return json::value(nullptr);
                }
                
                // Build allowed domains list
                auto extract_domain = [](const std::string& url) {
                    size_t start = url.find("://");
                    if (start == std::string::npos) return std::string("");
                    start += 3;
                    size_t end = url.find('/', start);
                    return (end == std::string::npos) ? url.substr(start) : url.substr(start, end - start);
                };
                
                std::vector<std::string> allowed_domains;
                allowed_domains.push_back(extract_domain(this->app->ws->getURL()));
                
                const auto origins = this->app->info->getProperty("origins");
                if (origins.is_array()) {
                    for (const auto& origin : origins.as_array()) {
                        if (origin.is_string()) {
                            std::string domain = extract_domain(origin.as_string().c_str());
                            if (!domain.empty()) allowed_domains.push_back(domain);
                        }
                    }
                }
                
                this->logger->debug("[security] Content filter: " + std::to_string(allowed_domains.size()) + " allowed domains");
                
                // Set up WKContentRuleList for blocking third-party resources
                if (!allowed_domains.empty()) {
                    json::array unless_domains;
                    for (const auto& d : allowed_domains) unless_domains.emplace_back(d);
                    
                    json::array rules;
                    rules.emplace_back(json::object{
                        {"trigger", json::object{
                            {"url-filter", ".*"},
                            {"resource-type", json::array{"image", "style-sheet", "script", "font", "raw", "svg-document", "media"}},
                            {"load-type", json::array{"third-party"}},
                            {"unless-domain", unless_domains}
                        }},
                        {"action", json::object{{"type", "block"}}}
                    });
                    
                    std::string rules_json = json::serialize(rules);
                    NSString* rulesString = [NSString stringWithUTF8String:rules_json.c_str()];
                    
                    id ruleStore = [NSClassFromString(@"WKContentRuleListStore") defaultStore];
                    [ruleStore compileContentRuleListForIdentifier:@"RenWebContentBlocker"
                                                 encodedContentRuleList:rulesString
                                                      completionHandler:^(id ruleList, NSError* error) {
                        if (ruleList) {
                            id userContentController = [[webview configuration] userContentController];
                            [userContentController addContentRuleList:ruleList];
                            this->logger->info("[security] Content filter active");
                        } else {
                            this->logger->error("[security] Content filter failed: " + 
                                std::string(error ? [[error localizedDescription] UTF8String] : "unknown"));
                        }
                    }];
                }
                
                // Set up WKNavigationDelegate for URI filtering and error handling
                static Class navDelegateClass = nil;
                if (!navDelegateClass) {
                    navDelegateClass = objc_allocateClassPair([NSObject class], "RenWebSecurityNavigationDelegate", 0);
                    
                    // Shared policy check logic
                    auto (^checkPolicy)(id, id, NSURL*, void (^)(int)) = ^(id self, id webView, NSURL* url, void (^handler)(int)) {
                        WF* wf = (__bridge WF*)objc_getAssociatedObject(self, "wf");
                        std::string uri_str([[url absoluteString] UTF8String]);
                        
                        // Allow about: and file: URLs
                        if (uri_str.find("about:") == 0 || uri_str.find("file:") == 0) {
                            handler(1); // WKNavigationActionPolicyAllow
                            return;
                        }
                        
                        // Check if URI is allowed
                        if (!wf->app->ws->isURIAllowed(uri_str)) {
                            wf->logger->warn("[security] Blocked: " + uri_str);
                            NSString* htmlString = [NSString stringWithUTF8String:
                                IWebServer::generateBlockedNavigationHTML(uri_str,
                                    "This URL is not in the list of allowed origins. Only resources from trusted sources can be accessed.").c_str()];
                            [webView loadHTMLString:htmlString baseURL:[NSURL URLWithString:@"about:blank"]];
                            handler(0); // WKNavigationActionPolicyCancel
                        } else {
                            handler(1); // WKNavigationActionPolicyAllow
                        }
                    };
                    
                    // decidePolicyForNavigationAction
                    class_addMethod(navDelegateClass, NSSelectorFromString(@"webView:decidePolicyForNavigationAction:decisionHandler:"),
                        imp_implementationWithBlock(^(id self, id webView, id navAction, void (^handler)(int)) {
                            NSURL* url = [[navAction valueForKey:@"request"] URL];
                            checkPolicy(self, webView, url, handler);
                        }), "v@:@@?");
                    
                    // decidePolicyForNavigationResponse
                    class_addMethod(navDelegateClass, NSSelectorFromString(@"webView:decidePolicyForNavigationResponse:decisionHandler:"),
                        imp_implementationWithBlock(^(id self, id webView, id navResponse, void (^handler)(int)) {
                            NSURL* url = [[navResponse valueForKey:@"response"] URL];
                            checkPolicy(self, webView, url, handler);
                        }), "v@:@@?");
                    
                    // didFailProvisionalNavigation - handle main page load failures
                    class_addMethod(navDelegateClass, NSSelectorFromString(@"webView:didFailProvisionalNavigation:withError:"),
                        imp_implementationWithBlock(^(id self, id webView, id navigation, NSError* error) {
                            WF* wf = (__bridge WF*)objc_getAssociatedObject(self, "wf");
                            NSURL* failingURL = [error.userInfo objectForKey:NSURLErrorFailingURLErrorKey];
                            std::string uri_str = failingURL ? [[failingURL absoluteString] UTF8String] : "unknown";
                            std::string error_msg = [[error localizedDescription] UTF8String];
                            
                            // Skip about: URLs
                            if (uri_str.find("about:") == 0) return;
                            
                            wf->logger->error("[security] Page load failed: " + uri_str + " - " + error_msg);
                            
                            NSString* htmlString = [NSString stringWithUTF8String:
                                IWebServer::generateErrorHTML(static_cast<int>([error code]),
                                    "Failed to Load Page",
                                    "Could not load: " + uri_str + "<br><br><strong>Details:</strong> " + error_msg).c_str()];
                            [webView loadHTMLString:htmlString baseURL:failingURL];
                        }), "v@:@@@");
                    
                    // didFailNavigation - handle resource failures (NOT page-breaking, just log)
                    class_addMethod(navDelegateClass, NSSelectorFromString(@"webView:didFailNavigation:withError:"),
                        imp_implementationWithBlock(^(id self, id webView, id navigation, NSError* error) {
                            WF* wf = (__bridge WF*)objc_getAssociatedObject(self, "wf");
                            NSURL* failingURL = [error.userInfo objectForKey:NSURLErrorFailingURLErrorKey];
                            std::string uri_str = failingURL ? [[failingURL absoluteString] UTF8String] : "unknown";
                            
                            if (uri_str.find("about:") == 0) return;
                            
                            // Resource load failure - just log, don't show error page
                            wf->logger->warn("[security] Resource load failed: " + uri_str);
                        }), "v@:@@@");
                    
                    objc_registerClassPair(navDelegateClass);
                }
                
                id navDelegate = [[navDelegateClass alloc] init];
                objc_setAssociatedObject(navDelegate, "wf", (__bridge id)this, OBJC_ASSOCIATION_ASSIGN);
                [webview setNavigationDelegate:navDelegate];
            #endif
            
            return json::value(nullptr);
    }))->add("performance_settings",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            #if defined(__linux__)
                auto widget_result = this->app->w->widget();
                if (!widget_result.has_value()) {
                    this->logger->warn("[function] Webview widget not ready yet - skipping performance settings");
                    return json::value(nullptr);
                }
                WebKitWebView* webview = WEBKIT_WEB_VIEW(widget_result.value());
                WebKitSettings* settings = webkit_web_view_get_settings(webview);
                                
                webkit_settings_set_hardware_acceleration_policy(settings, 
                    WEBKIT_HARDWARE_ACCELERATION_POLICY_ALWAYS);
                webkit_settings_set_enable_2d_canvas_acceleration(settings, TRUE);
                webkit_settings_set_enable_webgl(settings, TRUE);
                webkit_settings_set_enable_page_cache(settings, TRUE);
                webkit_settings_set_enable_javascript(settings, TRUE);
                webkit_settings_set_javascript_can_access_clipboard(settings, TRUE);
                webkit_settings_set_javascript_can_open_windows_automatically(settings, TRUE);
                webkit_settings_set_enable_media(settings, TRUE);
                webkit_settings_set_enable_media_capabilities(settings, TRUE);
                webkit_settings_set_enable_mediasource(settings, TRUE);
                webkit_settings_set_enable_encrypted_media(settings, TRUE);
                webkit_settings_set_enable_html5_local_storage(settings, TRUE);
                webkit_settings_set_enable_html5_database(settings, TRUE);
                webkit_settings_set_enable_smooth_scrolling(settings, TRUE);
                webkit_settings_set_enable_back_forward_navigation_gestures(settings, TRUE);
                webkit_settings_set_enable_javascript_markup(settings, TRUE);
                webkit_settings_set_enable_resizable_text_areas(settings, TRUE);
                webkit_settings_set_enable_site_specific_quirks(settings, TRUE);
                webkit_settings_set_enable_tabs_to_links(settings, TRUE);
                webkit_settings_set_enable_fullscreen(settings, TRUE);
                webkit_settings_set_enable_webaudio(settings, TRUE);
                webkit_settings_set_enable_media_stream(settings, TRUE);
                webkit_settings_set_enable_write_console_messages_to_stdout(settings, TRUE);
                webkit_settings_set_media_playback_requires_user_gesture(settings, FALSE); 
                webkit_settings_set_zoom_text_only(settings, FALSE); 
                webkit_settings_set_default_charset(settings, "UTF-8");
                webkit_settings_set_enable_caret_browsing(settings, FALSE);
                webkit_settings_set_allow_file_access_from_file_urls(settings, TRUE); 
                webkit_settings_set_allow_universal_access_from_file_urls(settings, TRUE);
                
                this->logger->info("[performance] WebKitGTK performance settings configured successfully");
                this->logger->info("[performance] Hardware acceleration: enabled");
                this->logger->info("[performance] WebGL: enabled");
                this->logger->info("[performance] 2D Canvas acceleration: enabled");
                this->logger->info("[performance] Media playback: optimized");
                
            #elif defined(_WIN32)
                // Windows WebView2: Configure performance and feature settings
                
                auto webview2_opt = this->app->w->widget();
                if (!webview2_opt.has_value()) {
                    this->logger->warn("[function] WebView2 not yet initialized - skipping performance settings");
                    return json::value(nullptr);
                }
                
                ICoreWebView2* webview2 = static_cast<ICoreWebView2*>(webview2_opt.value());
                if (!webview2) {
                    this->logger->warn("[function] WebView2 pointer invalid - skipping performance settings");
                    return json::value(nullptr);
                }
                
                ICoreWebView2Settings* settings = nullptr;
                HRESULT hr = webview2->get_Settings(&settings);
                if (FAILED(hr) || !settings) {
                    this->logger->error("[function] Failed to get WebView2 settings interface");
                    return json::value(nullptr);
                }
                
                // Configure base settings for optimal performance and UX
                settings->put_IsZoomControlEnabled(TRUE);
                settings->put_AreDefaultContextMenusEnabled(TRUE);
                settings->put_AreDefaultScriptDialogsEnabled(TRUE);
                settings->put_IsBuiltInErrorPageEnabled(FALSE);
                settings->put_IsStatusBarEnabled(FALSE);
                settings->put_AreDevToolsEnabled(TRUE);
                settings->put_IsScriptEnabled(TRUE);
                settings->put_IsWebMessageEnabled(TRUE);
                settings->put_AreHostObjectsAllowed(TRUE);
                
                this->logger->info("[performance] WebView2 base settings configured");
                
                // ICoreWebView2Settings2 (WebView2 SDK 1.0.721+): User agent
                ICoreWebView2Settings2* settings2 = nullptr;
                hr = settings->QueryInterface(IID_PPV_ARGS(&settings2));
                if (SUCCEEDED(hr) && settings2) {
                    settings2->put_UserAgent(L"RenWeb-Engine/0.0.5");
                    this->logger->info("[performance] User agent set to RenWeb-Engine/0.0.5");
                    settings2->Release();
                }
                
                // ICoreWebView2Settings4 (WebView2 SDK 1.0.1072+): General autofill
                ICoreWebView2Settings4* settings4 = nullptr;
                hr = settings->QueryInterface(IID_PPV_ARGS(&settings4));
                if (SUCCEEDED(hr) && settings4) {
                    settings4->put_IsGeneralAutofillEnabled(TRUE);
                    settings4->put_IsPasswordAutosaveEnabled(FALSE);
                    this->logger->info("[performance] Autofill enabled, password autosave disabled");
                    settings4->Release();
                }
                
                // ICoreWebView2Settings3 (WebView2 SDK 1.0.1018+): Accelerator keys
                ICoreWebView2Settings3* settings3 = nullptr;
                hr = settings->QueryInterface(IID_PPV_ARGS(&settings3));
                if (SUCCEEDED(hr) && settings3) {
                    settings3->put_AreBrowserAcceleratorKeysEnabled(TRUE);
                    this->logger->info("[function] Browser accelerator keys enabled");
                    settings3->Release();
                }
                                
                // ICoreWebView2Settings5 (WebView2 SDK 1.0.1150+): Pinch zoom
                ICoreWebView2Settings5* settings5 = nullptr;
                hr = settings->QueryInterface(IID_PPV_ARGS(&settings5));
                if (SUCCEEDED(hr) && settings5) {
                    settings5->put_IsPinchZoomEnabled(TRUE);
                    this->logger->info("[performance] Pinch zoom enabled");
                    settings5->Release();
                }
                
                // ICoreWebView2Settings6 (WebView2 SDK 1.0.1185+): Swipe navigation
                ICoreWebView2Settings6* settings6 = nullptr;
                hr = settings->QueryInterface(IID_PPV_ARGS(&settings6));
                if (SUCCEEDED(hr) && settings6) {
                    settings6->put_IsSwipeNavigationEnabled(TRUE);
                    this->logger->info("[performance] Swipe navigation enabled");
                    settings6->Release();
                }
                
                // ICoreWebView2Settings8 (WebView2 SDK 1.0.1587+): Hidden PDF toolbar
                ICoreWebView2Settings8* settings8 = nullptr;
                hr = settings->QueryInterface(IID_PPV_ARGS(&settings8));
                if (SUCCEEDED(hr) && settings8) {
                    settings8->put_HiddenPdfToolbarItems(COREWEBVIEW2_PDF_TOOLBAR_ITEMS_NONE);
                    this->logger->info("[performance] PDF toolbar customization enabled");
                    settings8->Release();
                }
                
                settings->Release();
                this->logger->info("[performance] WebView2 performance settings configured successfully");
                this->logger->info("[performance] Hardware acceleration: enabled (via Chromium)");
                this->logger->info("[performance] WebGL/WebGPU: enabled");
                this->logger->info("[performance] Canvas acceleration: enabled");
                this->logger->info("[performance] Media playback: optimized");
                
            #elif defined(__APPLE__)
                auto window_result = this->app->w->window();
                if (!window_result.has_value()) {
                    this->logger->warn("[function] Window not ready yet - skipping performance settings");
                    return json::value(nullptr);
                }
                
                id nsWindow = (__bridge id)window_result.value();
                id webview = nil;
                for (id view in [[nsWindow contentView] subviews]) {
                    if ([view isKindOfClass:NSClassFromString(@"WKWebView")]) {
                        webview = view;
                        break;
                    }
                }
                
                if (!webview) {
                    this->logger->warn("[function] WKWebView not ready yet - skipping performance settings");
                    return json::value(nullptr);
                }
                
                id config = [webview configuration];
                id prefs = [config preferences];
                
                // Core JavaScript
                [prefs setJavaScriptEnabled:YES];
                [prefs setJavaScriptCanOpenWindowsAutomatically:YES];
                
                // Media settings (10.15+ compatible)
                if ([config respondsToSelector:@selector(setMediaTypesRequiringUserActionForPlayback:)]) {
                    [config setMediaTypesRequiringUserActionForPlayback:0]; // Allow autoplay
                }
                if ([config respondsToSelector:@selector(setAllowsInlineMediaPlayback:)]) {
                    [config setAllowsInlineMediaPlayback:YES];
                }
                if ([config respondsToSelector:@selector(setAllowsAirPlayForMediaPlayback:)]) {
                    [config setAllowsAirPlayForMediaPlayback:YES];
                }
                if ([config respondsToSelector:@selector(setAllowsPictureInPictureMediaPlayback:)]) {
                    [config setAllowsPictureInPictureMediaPlayback:YES];
                }
                
                // Advanced features via KVC (safe fallback for older versions)
                int enabled_count = 0;
                @try {
                    NSArray* advancedSettings = @[
                        @[@"webGLEnabled", @YES],
                        @[@"acceleratedCompositingEnabled", @YES],
                        @[@"accelerated2dCanvasEnabled", @YES],
                        @[@"webGPUEnabled", @YES],  // WebGPU (macOS 11.3+)
                        @[@"offlineWebApplicationCacheEnabled", @YES],
                        @[@"localStorageEnabled", @YES],
                        @[@"databasesEnabled", @YES],
                        @[@"mediaCaptureRequiresSecureConnection", @NO],
                        @[@"fullScreenEnabled", @YES],
                        @[@"acceleratedDrawingEnabled", @YES],
                        @[@"canvasUsesAcceleratedDrawing", @YES],
                        @[@"usesBackForwardCache", @YES],
                        @[@"requiresUserActionForAudioPlayback", @NO],
                        @[@"requiresUserActionForVideoPlayback", @NO]
                    ];
                    
                    for (NSArray* setting in advancedSettings) {
                        @try {
                            if ([prefs respondsToSelector:@selector(setValue:forKey:)]) {
                                [prefs setValue:setting[1] forKey:setting[0]];
                                enabled_count++;
                            }
                        } @catch (NSException *e) { /* Skip unavailable */ }
                    }
                } @catch (NSException *exception) { }
                
                this->logger->info("[performance] WKWebView performance settings configured successfully");
                this->logger->info("[performance] Advanced features enabled: " + std::to_string(enabled_count) + "/" + std::to_string(14));
                this->logger->info("[performance] Hardware acceleration: enabled (Metal backend)");
                this->logger->info("[performance] WebGL/WebGPU: enabled");
                this->logger->info("[performance] Canvas acceleration: enabled");
                this->logger->info("[performance] Media playback: optimized");
                
            #endif
            
            return json::value(nullptr);
    }));
    return this;
}

WF* WF::setup() {
    const json::value req = json::value(nullptr);
    // #ifndef _WIN32
    const json::value& prop = this->app->config->getProperty("initially_shown");
    if (prop.is_bool() && !prop.as_bool()) {
        this->window_callbacks->run(
            "show", 
            json::value((prop.is_bool()) ? (prop.as_bool()) : true)
        );
    }
    // #endif
    if (this->saved_states.find("setup_complete") != this->saved_states.end()) {
        this->logger->warn("[function] Setup has already been completed previously - skipping");
        return this;
    }
    for (const auto& [key, fn] : this->internal_callbacks->getMap()) {
        try {
            fn(req);
        } catch (const std::exception& e) {
            this->logger->error("[function] Exception during internal callback '" + key + "': " + e.what());
        }
    }
    this->saved_states["setup_complete"] = json::value(true);
    return this;
}

WF* WF::teardown() {
    /* nothing here atm */
    return this;
}