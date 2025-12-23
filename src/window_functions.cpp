#include "../include/window_functions.hpp"
#include <boost/json/object.hpp>
#include <boost/json/serialize.hpp>
#include <boost/json/value.hpp>
#include <sstream>

#if defined(_WIN32)
    #include <windows.h>
#elif defined(__APPLE__)
    #include <Cocoa/Cocoa.h>
    #include <WebKit/WebKit.h>
#elif defined(__linux__)
    #include <gtk/gtk.h>
    #include "gdk/gdk.h"
    #include <webkit2/webkit2.h>
#endif

#include <string>
#include <fstream>
#include <regex>
#include <chrono>
#include <boost/process.hpp>
#include "web_server.hpp"
#include "app.hpp"
#include "locate.hpp"
#include "../include/managers/pipe_manager.hpp"


using WF = RenWeb::WindowFunctions;
using IOM = RenWeb::InOutManager<std::string, json::value, const json::value&>;

#if defined(__APPLE__)
static id getWKWebViewFromWindow(void* window_ptr) {
    if (!window_ptr) return nil;
    
    id nsWindow = (__bridge id)window_ptr;
    id contentView = [nsWindow contentView];
    
    // Find the WKWebView in the view hierarchy
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

WF::WindowFunctions(RenWeb::App* app)
    : app(app),
      getsets(new IOM()),
    //   startstops(new IOM()),
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
        ->setNavigateCallbacks();
    this->bindDefaults();
}

WF::~WindowFunctions() {
    this->app->logger->trace("Deconstructing WindowFunctions");
}

json::value WF::processInput(const std::string& input) {
    return this->processInput(json::parse(input));
}

json::value WF::processInput(const json::value& input) {
    switch (input.kind()) {
        case json::kind::string:
            this->app->logger->warn("Received string in processInput(std::string)");
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
            throw std::runtime_error("Unsupported JSON value kind in processInput(std::string)");
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
        throw std::runtime_error("Unsupported encoding type in processInput(json::object): " + std::string(input.at("__encoding_type__").as_string()));
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
            throw std::runtime_error("Unsupported JSON value kind in formatOutput");
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
            this->app->logger->warn("Expected single parameter but received array of size " + std::to_string(param.as_array().size()) + ". Using first element.");
            return param.as_array()[0];
        } else if (param.as_array().size() == 0) {
            this->app->logger->warn("Expected single parameter but received empty array. Using null.");
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
    this->app->logger->trace("Bound " + fn_name);
    return this;
}
WF* WF::unbindFunction(const std::string& fn_name) {
    this->app->w->unbind(fn_name);
    this->app->logger->trace("Unbound " + fn_name);
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
                    this->app->logger->error(std::string("[CLIENT] ") + e.what());
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
                    this->app->logger->error(std::string("[CLIENT] ") + e.what());
                    return json::serialize(this->formatOutput(nullptr));
                }
            })
            ->bindFunction("BIND_set_" + key, [pair, this](const std::string& req) -> std::string {
                try {
                    pair.second(this->processInput(req));
                } catch (const std::exception& e) {
                    this->app->logger->error(std::string("[CLIENT] ") + e.what());
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
            this->app->logger->info("Getting for " + key);
            state[key] = this->get(key);
        } catch (...) { }
    }
    return state;
}
void WF::setState(const json::object& json) {
    std::cout << json << std::endl;
    for (const auto& property : json) {
        try {
            this->app->logger->info("Setting for " + std::string(property.key()));
            this->set(property.key(), property.value());
        } catch (...) { }
    }
}
void WF::saveState() {
    // this->app->config->update(this->getState())
    // Page::savePageConfig(this->getState());
    this->app->logger->critical("SAVE STATE NOT IMPLEMENTED");
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
            HWND hwnd = GetActiveWindow();
            GetClientRect(hwnd, &rect);
            width = rect.right - rect.left;
            height = rect.bottom - rect.top;
        #elif defined(__APPLE__)
            // On macOS, get the window content size
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
            // std::cout << req << std::endl;
            json::object obj = this->getSingleParameter(req).as_object();
            int width = obj.at("width").as_int64();
            int height = obj.at("height").as_int64();
            this->app->w->set_size(width, height);
        })
    ))
// -----------------------------------------
    ->add("position", std::make_pair(
        std::function<json::value()>([this]() -> json::value {
            int x, y;
            json::object position = json::object();
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            RECT rect;
            GetWindowRect(hwnd, &rect);
            x = rect.left;
            y = rect.top;
        #elif defined(__APPLE__)
            // On macOS, get the window origin
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
            int x = obj.at("x").as_int64();
            int y = obj.at("y").as_int64();
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            SetWindowPos(hwnd, NULL, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
        #elif defined(__APPLE__)
            // On macOS, set the window origin
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
            HWND hwnd = GetActiveWindow();
            LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
            return json::value((style & (WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME)) != 0);
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
            HWND hwnd = GetActiveWindow();
            LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
            if (decorated) {
                style |= (WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME);
            } else {
                style &= ~(WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME);
            }
            SetWindowLongPtr(hwnd, GWL_STYLE, style);
            SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
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
            HWND hwnd = GetActiveWindow();
            LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
            return json::value((style & (WS_THICKFRAME | WS_MAXIMIZEBOX)) != 0);
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
            HWND hwnd = GetActiveWindow();
            LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
            if (resizable) {
                style |= (WS_THICKFRAME | WS_MAXIMIZEBOX);
            } else {
                style &= ~(WS_THICKFRAME | WS_MAXIMIZEBOX);
            }
            SetWindowLongPtr(hwnd, GWL_STYLE, style);
            SetWindowPos(hwnd, nullptr, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
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
            HWND hwnd = GetActiveWindow();
            DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
            return json::value((exStyle & WS_EX_TOPMOST) != 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            return json::value([nsWindow level] == NSFloatingWindowLevel);
        #elif defined(__linux__)
            if (this->saved_states.find("keepabove") == this->saved_states.end()) {
                this->app->logger->warn("State 'keepabove' has not been set in 'saved_states' yet.");
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
            HWND hwnd = GetActiveWindow();
            SetWindowPos(hwnd, (keep_above) ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
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
                HWND hwnd = GetActiveWindow();
                return json::value(IsIconic(hwnd) != 0);
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
            HWND hwnd = GetActiveWindow();
            ShowWindow(hwnd, minimize ? SW_MINIMIZE : SW_RESTORE);
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
            HWND hwnd = GetActiveWindow();
            return json::value(IsZoomed(hwnd) != 0);
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
            HWND hwnd = GetActiveWindow();
            ShowWindow(hwnd, maximize ? SW_MAXIMIZE : SW_RESTORE);
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
            HWND hwnd = GetActiveWindow();
            DWORD style = GetWindowLongPtr(hwnd, GWL_STYLE);
            return json::value((style & WS_POPUP) != 0 && (style & (WS_CAPTION | WS_THICKFRAME)) == 0);
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
            HWND hwnd = GetActiveWindow();
            if (fullscreen) {
                SetWindowLongPtr(hwnd, GWL_STYLE, WS_POPUP | WS_VISIBLE);
                ShowWindow(hwnd, SW_MAXIMIZE);
            } else {
                SetWindowLongPtr(hwnd, GWL_STYLE, WS_OVERLAPPEDWINDOW | WS_VISIBLE);
                ShowWindow(hwnd, SW_RESTORE);
            }
            SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
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
            HWND hwnd = GetActiveWindow();
            DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
            return json::value((exStyle & WS_EX_TOOLWINDOW) == 0); // Inverted: toolwindow hides from taskbar
        #elif defined(__APPLE__)
            this->app->logger->warn("getTaskbarShow can't be set via RenWeb on Apple");
            return json::value(true); // Default assumption
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            return json::value(!gtk_window_get_skip_taskbar_hint(GTK_WINDOW(window_widget))); // Inverted: skip means not shown
        #endif    
        }),
    // -----------------------------------------
        std::function<void(const json::value&)>([this](const json::value& req){
        #if defined(_WIN32)
            const bool taskbar_show = this->getSingleParameter(req).as_bool();
            HWND hwnd = GetActiveWindow();
            DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
            if (taskbar_show) {
                exStyle &= ~WS_EX_TOOLWINDOW; // Remove toolwindow to show in taskbar
            } else {
                exStyle |= WS_EX_TOOLWINDOW; // Add toolwindow to hide from taskbar
            }
            SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle);
            SetWindowPos(hwnd, NULL, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
        #elif defined(__APPLE__)
            (void)req; 
            this->app->logger->warn("setTaskbarShow can't be set via RenWeb on Apple");
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
            HWND hwnd = GetActiveWindow();
            BYTE alpha;
            DWORD flags;
            if (GetLayeredWindowAttributes(hwnd, NULL, &alpha, &flags) && (flags & LWA_ALPHA)) {
                return json::value(static_cast<float>(alpha) / 255.0f);
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
                this->app->logger->error("Invalid opacity: " + std::to_string(opacity_amt) + " only enter values between 0.0 and 1.0 inclusive");
            } else {
        #if defined(_WIN32)
                HWND hwnd = GetActiveWindow();
                DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
                SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
                BYTE alpha = static_cast<BYTE>(opacity_amt * 255.0f);
                SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
        #elif defined(__APPLE__)
                NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
                [nsWindow setAlphaValue:opacity_amt];
        #elif defined(__linux__)
                this->app->logger->warn("setOpacity has not been tested for Linux");
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
            HWND hwnd = GetActiveWindow();
            return json::value(hwnd == GetForegroundWindow());
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
            HWND hwnd = GetActiveWindow();
            ShowWindow(hwnd, show_window ? SW_SHOW : SW_HIDE);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            if (show_window) {
                [nsWindow orderFront:nil];
            } else {
                [nsWindow orderOut:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            auto webview_widget = this->app->w->widget().value();
            if (show_window) {
                gtk_widget_show_all(GTK_WIDGET(window_widget));
            } else {
                this->app->logger->critical("HIDING STUFF");
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
                this->app->logger->warn("Title has not been set yet, returning empty string");
                return json::value(Locate::executable().filename().string());
            }
            return this->saved_states["current_title"];
    }))->add("reload_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            this->app->w->navigate(this->app->ws->getURL());
            return json::value(nullptr);
    }))->add("navigate_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            const std::string uri = this->getSingleParameter(req).as_string().c_str();
            static const std::regex uri_regex(
                R"(^[a-zA-Z][a-zA-Z0-9+.-]*://[^\s]+$)"
            );
            if (uri != "_") this->app->config->current_page = uri;
            if (std::regex_match(uri, uri_regex)) {
                this->app->logger->warn("Navigating to page " + uri);
                this->app->w->navigate(uri);
            } else {
                this->app->logger->warn("Navigating to " + this->app->ws->getURL() + " to display page of name " + uri);
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
            this->app->logger->info("start_window_drag called");
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            ReleaseCapture();
            SendMessage(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->app->w->window().value();
            [nsWindow performWindowDragWithEvent:[NSApp currentEvent]];
        #elif defined(__linux__)
            auto window_widget = this->app->w->window().value();
            GdkWindow* gdk_window = gtk_widget_get_window(GTK_WIDGET(window_widget));
            
            // Get the current pointer position
            GdkDisplay* display = gdk_window_get_display(gdk_window);
            GdkSeat* seat = gdk_display_get_default_seat(display);
            GdkDevice* device = gdk_seat_get_pointer(seat);
            
            gint root_x, root_y;
            gdk_device_get_position(device, NULL, &root_x, &root_y);
            
            this->app->logger->info("Attempting window drag from position: " + std::to_string(root_x) + ", " + std::to_string(root_y));
            
            // Use gdk_window_begin_move_drag instead - it doesn't require an event
            gdk_window_begin_move_drag(gdk_window, 1, root_x, root_y, GDK_CURRENT_TIME);
        #endif
            return json::value(nullptr);
    }))->add("print_page",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
        #if defined(_WIN32)
            this->app->logger->warn("print_page not yet implemented for Windows");
        #elif defined(__APPLE__)
        this->app->logger->error("Print page BROKEN on apple");    
        auto window_result = this->app->w->window();
            if (window_result.has_value()) {
                id webview = getWKWebViewFromWindow(window_result.value());
                if (webview) {
                    // Retain the webview to prevent deallocation before block executes
                    id retainedWebview = [webview retain];
                    
                    // Use dispatch_async to ensure print dialog appears on main thread
                    dispatch_async(dispatch_get_main_queue(), ^{
                        // Create print info with default settings
                        NSPrintInfo* printInfo = [NSPrintInfo sharedPrintInfo];
                        
                        // Create print operation
                        NSPrintOperation* printOp = [NSPrintOperation printOperationWithView:retainedWebview printInfo:printInfo];
                        [printOp setShowsPrintPanel:YES];
                        [printOp setShowsProgressPanel:YES];
                        
                        // Run the print operation
                        [printOp runOperation];
                        
                        // Release after use
                        [retainedWebview release];
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
            this->app->logger->warn("zoom_in not yet implemented for Windows");
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
            this->app->logger->warn("zoom_out not yet implemented for Windows");
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
            this->app->logger->warn("zoom_reset not yet implemented for Windows");
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
            this->app->logger->warn("get_zoom_level not yet implemented for Windows");
            return json::value(1.0);
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
            this->app->logger->warn("set_zoom_level not yet implemented for Windows");
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
            this->app->logger->warn("find_in_page not yet implemented for Windows");
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
            this->app->logger->warn("find_next not yet implemented for Windows");
        #elif defined(__APPLE__)
            this->app->logger->warn("apple doesn't have bindings for this findNext");
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
            this->app->logger->warn("find_previous not yet implemented for Windows");
        #elif defined(__APPLE__)
            this->app->logger->warn("apple doesn't have bindings for this findPrevious");
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
            this->app->logger->warn("clear_find not yet implemented for Windows");
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
            this->app->logger->trace("[CLIENT] " + msg);
            return json::value(nullptr);
    }))->add("log_debug",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->app->logger->debug("[CLIENT] " + msg);
            return json::value(nullptr);
    }))->add("log_info",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->app->logger->info("[CLIENT] " + msg);
            return json::value(nullptr);
    }))->add("log_warn",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->app->logger->warn("[CLIENT] " + msg);
            return json::value(nullptr);
    }))->add("log_error",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->app->logger->error("[CLIENT] " + msg);
            return json::value(nullptr);
    }))->add("log_critical",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::string msg = this->getSingleParameter(req).as_string().c_str();
            this->app->logger->critical("[CLIENT] " + msg);
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
                this->app->logger->error("No file exists at " + path.string());
                return json::value(nullptr);
            }
            else if (std::filesystem::is_directory(path)) {
                this->app->logger->error("readFile can't read directory contents. Use ls for that.");
                return json::value(nullptr);
            }
            std::ifstream file(path, std::ios::binary);
            if (!file.good()) {
                this->app->logger->error("Failed to open file for reading: " + path.string());
                return json::value(nullptr);
            }
            std::vector<char> buffer(std::istreambuf_iterator<char>(file), {});
            file.close();
            this->app->logger->debug("Read " + std::to_string(buffer.size()) + " bytes from " + path.string());
            
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
                this->app->logger->error("Can't write to a directory " + path.string());
                return json::value(false);
            } else if (!std::filesystem::exists(parent_path)) {
                this->app->logger->error("Directory '" + parent_path.string() + "' doesn't exist.");
                return json::value(false);
            }
            
            std::ofstream file(path, mode);
            if (file.bad()) {
                this->app->logger->error("Bad file " + path.string());
                return json::value(false);
            }
            if (contents.empty()) {
                this->app->logger->debug("Input content empty. Attempting empty write");
            }
            file.write(contents.data(), contents.size());
            file.close();
            this->app->logger->debug((append ? "Appended " : "Wrote ") + std::to_string(contents.size()) + " bytes to " + path.string());
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
                this->app->logger->error("File/dir already exists at '" + path.string() + "'");
                return json::value(false);
            }
            std::error_code ec;
            std::filesystem::create_directory(path, ec);
            if (ec) {
                this->app->logger->error(ec.message());
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
                this->app->logger->error("Cannot delete file/dir that doesn't exist: " + path.string());
                return json::value(false);
            } else if (std::filesystem::is_directory(path)) {
                if (recursive) {
                    std::filesystem::remove_all(path, ec);
                } else {
                    std::filesystem::remove(path, ec);
                }
                if (ec) {
                    this->app->logger->error(ec.message());
                    return json::value(false);
                }
                return json::value(true);
            }
            std::filesystem::remove(path, ec);
            if (ec) {
                this->app->logger->error(ec.message());
                return json::value(false);
            }
            return json::value(true);
    }))->add("ls",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            std::filesystem::path path(this->getSingleParameter(req).as_string().c_str());
            if (!std::filesystem::is_directory(path)) {
                this->app->logger->error("Path entered to ls wasn't a dir: " + path.string());
                return json::value(nullptr);
            }
            std::error_code ec;
            json::array array;
            for (const auto& entry : std::filesystem::directory_iterator(path, ec)) {
                array.push_back(json::string(entry.path().string()));
            }
            if (ec) {
                this->app->logger->error(ec.message());
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
                this->app->logger->error("Can't rename path that doesn't exist: " + orig_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path) && !overwrite) {
                this->app->logger->error("Can't overwrite already-existing new path if settings.overwrite is false: " + new_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path)) {
                if (std::filesystem::is_directory(new_path)) {
                    std::filesystem::remove_all(new_path, ec);
                } else {
                    std::filesystem::remove(new_path, ec);
                }
                if (ec) {
                    this->app->logger->error(ec.message());
                    return json::value(false);
                }
            }
            std::filesystem::rename(orig_path, new_path, ec);
            if (ec) {
                this->app->logger->error(ec.message());
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
                this->app->logger->error("Can't copy path that doesn't exist: " + orig_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path) && !overwrite) {
                this->app->logger->error("Can't overwrite already-existing new path if settings.overwrite is false: " + new_path.string());
                return json::value(nullptr);
            } else if (std::filesystem::exists(new_path)) {
                if (std::filesystem::is_directory(new_path)) {
                    std::filesystem::remove_all(new_path, ec);
                } else {
                    std::filesystem::remove(new_path, ec);
                }
                if (ec) {
                    this->app->logger->error(ec.message());
                    return json::value(false);
                }
            }
            if (std::filesystem::is_directory(orig_path)) {
                std::filesystem::copy(orig_path, new_path, std::filesystem::copy_options::recursive, ec);
            } else {
                std::filesystem::copy(orig_path, new_path, ec);
            }
            if (ec) {
                this->app->logger->error(ec.message());
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
            this->app->logger->warn("download_uri not yet implemented for Windows");
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
                        this->app->logger->warn("WKWebView download not available on this macOS version");
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
            this->app->logger->error("load_config doesn't do anything!");
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
            this->app->logger->critical("reset_to_defaults NOT IMPLEMENTED");
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
            int pid = params[1].as_int64();
            
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
            int pid = params[1].as_int64();
            
            getManager(process_type)->waitPID(pid);
            return json::value(nullptr);
    }))->add("duplicate_process",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            (void)req;
            
            if (this->app->orig_args.empty()) {
                this->app->logger->error("Cannot duplicate process - no original arguments available");
                return json::value(nullptr);
            }
            
            std::string unique_key = "duplicate_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
            
            int pid = this->app->procm->add(unique_key, this->app->orig_args);
            this->app->logger->debug("Duplicated process with PID: " + std::to_string(pid));
            
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
            int pid = params[0].as_int64();
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
            this->app->logger->warn("open_uri has not been tested for Windows");
        #elif defined(__APPLE__)
            system(("open " + resource).c_str());
            this->app->logger->warn("open_uri has not been tested for Apple");
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
            
            if (is_single) {
                if (!this->app->procm->has(uri)) {
                    this->app->logger->debug("Attempting to start single process for uri '" + uri + "'");
                    
                    std::vector<std::string> args = this->app->orig_args;
                    if (args.size() > 1) {
                        args.resize(2);
                        args[1] = uri;
                    } else {
                        args.push_back(uri);
                    }
                    
                    int pid = this->app->procm->add(uri, args);
                    return json::value(pid);
                } else {
                    this->app->logger->debug("Process of name '" + uri + "' is already running");
                    return json::value(nullptr);
                }
            } else {
                this->app->logger->debug("Attempting to start process for uri '" + uri + "'");
                
                std::string unique_key = uri + "_" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
                
                std::vector<std::string> args = this->app->orig_args;
                if (args.size() > 1) {
                    args.resize(2);
                    args[1] = uri;
                } else {
                    args.push_back(uri);
                }
                
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
            int signal_num = params[0].as_int64();
            std::string callback_name = params[1].as_string().c_str();
            
            this->app->signalm->add(signal_num, [this, callback_name](int sig) {
                std::string js_code = callback_name + "(" + std::to_string(sig) + ");";
                this->app->w->eval(js_code);
            });
            
            return json::value(nullptr);
    }))->add("signal_remove",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            int signal_num = req.as_array()[0].as_int64();
            this->app->signalm->remove(signal_num);
            return json::value(nullptr);
    }))->add("signal_has",
        std::function<json::value(const json::value&)>([this](const json::value& req) -> json::value {
            int signal_num = req.as_array()[0].as_int64();
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
            int signal_num = req.as_array()[0].as_int64();
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
            this->app->logger->warn("open_devtools not yet implemented for Windows");
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
            this->app->logger->warn("close_devtools not yet implemented for Windows");
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
            this->app->logger->warn("get_load_progress not yet implemented for Windows");
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
            this->app->logger->warn("is_loading not yet implemented for Windows");
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
            this->app->logger->warn("navigate_back not yet implemented for Windows");
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
            this->app->logger->warn("navigate_forward not yet implemented for Windows");
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
            this->app->logger->warn("stop_loading not yet implemented for Windows");
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
            this->app->logger->warn("can_go_back not yet implemented for Windows");
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
            this->app->logger->warn("can_go_forward not yet implemented for Windows");
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
