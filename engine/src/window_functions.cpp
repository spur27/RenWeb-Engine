#include "../include/window_functions.hpp"

#if defined(_WIN32)
    #include <windows.h>
#elif defined(__APPLE__)
    #include <Cocoa/Cocoa.h>
#elif defined(__linux__)
    #include <gtk/gtk.h>
    #include "gdk/gdk.h"
#endif

#include <portable-file-dialogs-mod.hpp>
#include <string>
#include "managers.hpp"
#include "window.hpp"
#include "window_helpers.hpp"
#include "process_manager.hpp"
#include "web_server.hpp"
#include "page.hpp"
#include "info.hpp"
#include "logger.hpp"

namespace WH = RenWeb::WindowHelpers;
using WF = RenWeb::WindowFunctions;
using Page = RenWeb::Page;
using Info = RenWeb::Info;
using GSM = RenWeb::GetSetManager<std::string, json, const json&>;

WF::WindowFunctions(RenWeb::__Window__*  window_ref) 
    : getsets(new GSM())
{ 
    this->window_ref = window_ref;
    this->setGetSets();
}
WF::~WindowFunctions() {
    Log::trace("Deconstructing WindowFunctions");
}
json WF::get(const std::string& property) {
    return this->getsets->get(property);
}
void WF::set(const std::string& property, const json& value) {
    this->getsets->set(property, value);
}
json WF::getState() {
    json state = json::object();
    for (const auto& [key, getset] : this->getsets->getMap()) {
        try {
            Log::info("Getting for " + key);
            state[key] = this->get(key);
        } catch (...) { }
    }
    return state;
}
void WF::setState(const json& json) {
    std::cout << json << std::endl;
    for (const auto& property : json.items()) {
        try {
            Log::info("Setting for " + property.key());
            this->set(property.key(), property.value());
        } catch (...) { }
    }
}
void WF::saveState() {
    Page::savePageConfig(this->getState());
}
std::vector<std::string> WF::getNames() {
    std::vector<std::string> keys;
    for (const auto& [key, value] : this->getsets->getMap()) {
        keys.push_back(key);
    }
    return keys;
}
void WF::setGetSets() {
// -----------------------------------------
    this->getsets->add("size", std::make_pair(
        [this](){
            int width, height;
            json dims = json::object();
        #if defined(_WIN32)
            RECT rect;
            HWND hwnd = GetActiveWindow();
            GetClientRect(hwnd, &rect);
            width = rect.right - rect.left;
            height = rect.bottom - rect.top;
        #elif defined(__APPLE__)
            // On macOS, get the window content size
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            NSRect contentRect = [nsWindow contentRectForFrameRect:[nsWindow frame]];
            width = (int)contentRect.size.width;
            height = (int)contentRect.size.height;
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            gtk_window_get_size(GTK_WINDOW(window_widget), &width, &height);
        #endif
            dims["width"] = width;
            dims["height"] = height;
            return dims;
        },
    // -----------------------------------------
        [this](const json& req) {
            std::cout << req << std::endl;
            int width = req["width"].get<int>();
            int height = req["height"].get<int>();
            this->window_ref->set_size(width, height, WEBVIEW_HINT_NONE);
            return this;
        }
    ))
// -----------------------------------------
    ->add("position", std::make_pair(
        [this](){
            int x, y;
            json position = json::object();
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            RECT rect;
            GetWindowRect(hwnd, &rect);
            x = rect.left;
            y = rect.top;
        #elif defined(__APPLE__)
            // On macOS, get the window origin
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            NSRect frame = [nsWindow frame];
            NSRect screenFrame = [[NSScreen mainScreen] frame];
            x = (int)frame.origin.x;
            y = (int)(screenFrame.size.height - frame.origin.y - frame.size.height); // Convert from Cocoa coordinates
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            gtk_window_get_position(GTK_WINDOW(window_widget), &x, &y);
        #endif
            position["x"] = x;
            position["y"] = y;
            return position;
        },
    // -----------------------------------------
        [this](const json& req){
            int x = req["x"].get<int>();
            int y = req["y"].get<int>();
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            SetWindowPos(hwnd, NULL, x, y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
        #elif defined(__APPLE__)
            // On macOS, set the window origin
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            NSRect screenFrame = [[NSScreen mainScreen] frame];
            NSPoint newOrigin = NSMakePoint(x, screenFrame.size.height - y); // Convert to Cocoa coordinates
            [nsWindow setFrameOrigin:newOrigin];
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            gtk_window_move(GTK_WINDOW(window_widget), x, y);
        #endif
            return this;
        }
    ))
// -----------------------------------------
    ->add("decorated", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
            return json((style & (WS_CAPTION | WS_THICKFRAME | WS_BORDER | WS_DLGFRAME)) != 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            return json(([nsWindow styleMask] & NSWindowStyleMaskTitled) != 0);
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            return json(gtk_window_get_decorated(GTK_WINDOW(window_widget)));
        #endif
        },
    // -----------------------------------------
        [this](const json& req){
            const bool decorated = req.get<bool>();
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
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            NSUInteger styleMask = [nsWindow styleMask];
            if (decorated) {
                styleMask |= NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable;
            } else {
                styleMask &= ~(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable);
            }
            [nsWindow setStyleMask:styleMask];
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            gtk_window_set_decorated(GTK_WINDOW(window_widget), decorated);
        #endif
            return this;
        }
    ))
// -----------------------------------------
    ->add("resizable", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            LONG_PTR style = GetWindowLongPtr(hwnd, GWL_STYLE);
            return json((style & (WS_THICKFRAME | WS_MAXIMIZEBOX)) != 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            return json(([nsWindow styleMask] & NSWindowStyleMaskResizable) != 0);
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            return json(gtk_window_get_resizable(GTK_WINDOW(window_widget)));
        #endif
        },
    // -----------------------------------------
        [this](const json& req){
            const bool resizable = req.get<bool>();
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
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            NSUInteger styleMask = [nsWindow styleMask];
            if (resizable) {
                styleMask |= NSWindowStyleMaskResizable;
            } else {
                styleMask &= ~NSWindowStyleMaskResizable;
            }
            [nsWindow setStyleMask:styleMask];
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            gtk_window_set_resizable(GTK_WINDOW(window_widget), resizable);
        #endif
            return this;
        }
    ))
// -----------------------------------------
    ->add("keepabove", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
            return json((exStyle & WS_EX_TOPMOST) != 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            return json([nsWindow level] == NSFloatingWindowLevel);
        #elif defined(__linux__)
            if (this->saved_states.find("keepabove") == this->saved_states.end()) {
                Log::warn("State 'keepabove' has not been set in 'saved_states' yet.");
                return json(false);
            }
            return this->saved_states["keepabove"];
        #endif
        },
    // -----------------------------------------
        [this](const json& req){
            const bool keep_above = req.get<bool>();
            this->saved_states["keepabove"] = json(keep_above);
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            SetWindowPos(hwnd, (keep_above) ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            [nsWindow setLevel:(keep_above) ? NSFloatingWindowLevel : NSNormalWindowLevel];
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            gtk_window_set_keep_above(GTK_WINDOW(window_widget), keep_above);
        #endif
            return this;
        }
    ))
// -----------------------------------------
    ->add("minimize", std::make_pair(
        [this](){
            #if defined(_WIN32)
                HWND hwnd = GetActiveWindow();
                return json(IsIconic(hwnd) != 0);
            #elif defined(__APPLE__)
                NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
                return json([nsWindow isMiniaturized]);
            #elif defined(__linux__)
                auto window_widget = this->window_ref->window().value();
                return json((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget)))
                    & GDK_WINDOW_STATE_ICONIFIED) != 0);
            #endif
        },
    // -----------------------------------------
        [this](const json& req){
            const bool minimize = req.get<bool>();
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            ShowWindow(hwnd, minimize ? SW_MINIMIZE : SW_RESTORE);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            if (minimize) {
                [nsWindow miniaturize:nil];
            } else {
                [nsWindow deminiaturize:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            bool is_currently_minimize = ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) & GDK_WINDOW_STATE_ICONIFIED) != 0);
            if (minimize && !is_currently_minimize) {
                gtk_window_iconify(GTK_WINDOW(window_widget));
            } else if (!minimize && is_currently_minimize) {
                gtk_window_deiconify(GTK_WINDOW(window_widget));
            }
        #endif
            return this;
        }
    ))
// -----------------------------------------
    ->add("maximize", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            return json(IsZoomed(hwnd) != 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            return json([nsWindow isZoomed]);
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            return json((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget)))
                & GDK_WINDOW_STATE_MAXIMIZED) != 0);
        #endif
        },
    // -----------------------------------------
        [this](const json& req){
            const bool maximize = req.get<bool>();
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            ShowWindow(hwnd, maximize ? SW_MAXIMIZE : SW_RESTORE);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            if (maximize != [nsWindow isZoomed]) {
                [nsWindow zoom:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            bool is_currently_maximize = ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) & GDK_WINDOW_STATE_MAXIMIZED) != 0);
            if (maximize && !is_currently_maximize) {
                gtk_window_maximize(GTK_WINDOW(window_widget));
            } else if (!maximize && is_currently_maximize) {
                gtk_window_unmaximize(GTK_WINDOW(window_widget));
            }
        #endif
            return this;
        }
    ))
// -----------------------------------------
    ->add("fullscreen", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            DWORD style = GetWindowLongPtr(hwnd, GWL_STYLE);
            return json((style & WS_POPUP) != 0 && (style & (WS_CAPTION | WS_THICKFRAME)) == 0);
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            return json(([nsWindow styleMask] & NSWindowStyleMaskFullScreen) != 0);
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            return json((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) 
                & GDK_WINDOW_STATE_FULLSCREEN) != 0);
        #endif
        },
    // -----------------------------------------
        [this](const json& req){
            const bool fullscreen = req.get<bool>();
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
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            BOOL isCurrentlyFullscreen = ([nsWindow styleMask] & NSWindowStyleMaskFullScreen) != 0;
            if (fullscreen != isCurrentlyFullscreen) {
                [nsWindow toggleFullScreen:nil];
            }
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            bool is_currently_fullscreen = ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window_widget))) & GDK_WINDOW_STATE_FULLSCREEN) != 0);
            if (fullscreen && !is_currently_fullscreen) {
                gtk_window_fullscreen(GTK_WINDOW(window_widget));
            } else if (!fullscreen && is_currently_fullscreen) {
                gtk_window_unfullscreen(GTK_WINDOW(window_widget));
            }
        #endif
            return this;
        }
    ))
// -----------------------------------------
    // ->add("show", std::make_pair(
    //     [this](){
    //     #if defined(_WIN32)
    //         Log::critical("getShow NOT IMPLEMENTED FOR windows");
    //     #elif defined(__APPLE__)
    //         Log::critical("getShow NOT IMPLEMENTED FOR apple");
    //     #elif defined(__linux__)
    //         auto window_widget = this->window_ref->window().value();
    //         return json(gtk_widget_is_visible(GTK_WIDGET(window_widget)));
    //     #endif
    //     },
    // // -----------------------------------------
    //     [this](const json& req){
    //         const bool show = req.get<bool>();
    //     #if defined(_WIN32)
    //         HWND hwnd = GetActiveWindow();
    //         (show) ? ShowWindow(hwnd, SW_SHOW)
    //             : ShowWindow(hwnd, SW_HIDE);
    //     #elif defined(__APPLE__)
    //         Log::critical("setShow NOT IMPLEMENTED FOR apple");
    //     #elif defined(__linux__)
    //         auto window_widget = this->window_ref->window().value();
    //         (show) ? gtk_widget_show(GTK_WIDGET(window_widget))
    //             : gtk_widget_hide(GTK_WIDGET(window_widget));
    //     #endif
    //         return this;
    //     }
    // ))
// -----------------------------------------
    ->add("taskbar_show", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
            return json((exStyle & WS_EX_TOOLWINDOW) == 0); // Inverted: toolwindow hides from taskbar
        #elif defined(__APPLE__)
            Log::warn("getTaskbarShow has not been tested for Apple");
            return json(true); // Default assumption
        #elif defined(__linux__)
            Log::warn("getTaskbarShow has not been tested for Linux");
            auto window_widget = this->window_ref->window().value();
            return json(!gtk_window_get_skip_taskbar_hint(GTK_WINDOW(window_widget))); // Inverted: skip means not shown
        #endif    
        },
    // -----------------------------------------
        [this](const json& req){
            const bool taskbar_show = req.get<bool>();
        #if defined(_WIN32)
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
            Log::warn("setTaskbarShow has not been tested for Apple");
            // On macOS, this would typically be controlled by LSUIElement in Info.plist
            // Runtime changes are complex and not commonly supported
        #elif defined(__linux__)
            Log::warn("setTaskbarShow has not been tested for Linux");
            auto window_widget = this->window_ref->window().value();
            gtk_window_set_skip_taskbar_hint(GTK_WINDOW(window_widget), !taskbar_show); // Inverted logic
        #endif    
            return this;
        }
    ))
// -----------------------------------------
    ->add("opacity", std::make_pair(
        [this](){
        #if defined(_WIN32)
            HWND hwnd = GetActiveWindow();
            BYTE alpha;
            DWORD flags;
            if (GetLayeredWindowAttributes(hwnd, NULL, &alpha, &flags) && (flags & LWA_ALPHA)) {
                return json(static_cast<float>(alpha) / 255.0f);
            }
            return json(1.0f); // Default fully opaque
        #elif defined(__APPLE__)
            NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
            return json(static_cast<float>([nsWindow alphaValue]));
        #elif defined(__linux__)
            auto window_widget = this->window_ref->window().value();
            return json(gtk_widget_get_opacity(GTK_WIDGET(window_widget)));
        #endif
        },
    // -----------------------------------------
        [this](const json& req){
            double opacity_amt = req.get<double>();
            if (opacity_amt > 1.0 || opacity_amt < 0.0) {
                Log::error("Invalid opacity: " + std::to_string(opacity_amt) + " only enter values between 0.0 and 1.0 inclusive");
            } else {
        #if defined(_WIN32)
                HWND hwnd = GetActiveWindow();
                DWORD exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE);
                SetWindowLongPtr(hwnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
                BYTE alpha = static_cast<BYTE>(opacity_amt * 255.0f);
                SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA);
        #elif defined(__APPLE__)
                NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
                [nsWindow setAlphaValue:opacity_amt];
        #elif defined(__linux__)
                Log::warn("setOpacity has not been tested for Linux");
                auto window_window = this->window_ref->window().value();
                gtk_widget_set_opacity(GTK_WIDGET(window_window), opacity_amt);
        #endif
            }
            return this;
        }
    ));
}
// -----------------------------------------
// ----------------- state -----------------
// -----------------------------------------
bool WF::isFocus() {
#if defined(_WIN32)
    HWND hwnd = GetActiveWindow();
    return (hwnd == GetForegroundWindow());
#elif defined(__APPLE__)
    NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
    return [nsWindow isKeyWindow];
#elif defined(__linux__)
    auto window_widget = this->window_ref->window().value();
    return gtk_window_has_toplevel_focus(GTK_WINDOW(window_widget));
#endif
}
// -----------------------------------------
// -------------- augmenters ---------------
// -----------------------------------------
WF* WF::show(bool is_window_shown) {
#if defined(_WIN32)
    HWND hwnd = GetActiveWindow();
    ShowWindow(hwnd, is_window_shown ? SW_SHOW : SW_HIDE);
#elif defined(__APPLE__)
    NSWindow* nsWindow = (NSWindow*)this->window_ref->window();
    if (is_window_shown) {
        [nsWindow orderFront:nil];
    } else {
        [nsWindow orderOut:nil];
    }
#elif defined(__linux__)
    auto window_widget = this->window_ref->window().value();
    auto webview_widget = this->window_ref->widget().value();
    if (is_window_shown) {
        gtk_widget_show_all(GTK_WIDGET(window_widget));
    } else {
        Log::critical("HIDING STUFF");
        gtk_widget_hide(GTK_WIDGET(window_widget));
        gtk_widget_hide(GTK_WIDGET(webview_widget));
    }
#endif
    return this;
}
// -----------------------------------------
WF* WF::changeTitle(const std::string& title) {
    this->window_ref->set_title(title);
    return this;
}
WF* WF::resetTitle() {
    this->window_ref->set_title(Page::getProperty<std::string>("title", Info::getProperty<std::string>("title", "")));
    return this;
}
WF* WF::reloadPage() {
    this->navigatePage(Page::getPage());
    return this;
}
// -----------------------------------------
WF* WF::navigatePage(const std::string& uri) {
    if (uri != "_") Page::setPage(uri);
    if (WH::isURI(uri)) {
        Log::warn("Navigating to page " + uri);
        this->window_ref->navigate(uri);
    } else {
        Log::warn("Navigating to " + this->window_ref->ws->getURL() + " to display page of name " + uri);
        this->window_ref->navigate(this->window_ref->ws->getURL());
    }
    return this;
}
// -----------------------------------------
WF* WF::terminate() { 
    this->window_ref->terminate();
    return this;
}
// -----------------------------------------
// -------------- windowing ----------------
// -----------------------------------------
std::vector<std::string> WF::openChooseFilesDialog(
    const bool& multi, 
    const bool& dirs, 
    const std::vector<std::string>& filteration, 
    const std::filesystem::path& initial_dir
) { 
    std::stringstream instructions;
    instructions << "Choose ";
    if (multi) {
        instructions << "some ";
        if (dirs) {
            instructions << " directories";
        } else {
            instructions << " files";
        }
    } else {
        instructions << "a ";
        if (dirs) {
            instructions << " directory";
        } else {
            instructions << " file";
        }
    }
    std::vector<std::string> filepaths;
    if (dirs) {
        filepaths.push_back(pfd::select_folder(instructions.str(), initial_dir, (multi) ? pfd::opt::multiselect : pfd::opt::none).result());
    } else {
        filepaths = pfd::open_file(instructions.str(), initial_dir, filteration, (multi) ? pfd::opt::multiselect : pfd::opt::none).result();
    }
    return filepaths;
}
// -----------------------------------------
WF* WF::openWindow(std::string uri, bool is_single) { 
    if (uri.empty() || (uri == "_")) {
        Log::debug(std::string("Attempting to start duplicate process. Single? ") + ((is_single) ? "true" : "false"));
        uri = Page::getPage();
    }
    if (is_single) {
        if (!this->window_ref->pm->hasProcess(uri)) {
            Log::debug("Attempting to start single process for uri '" + uri + "'");
            this->window_ref->pm->startProcess(uri);
        } else {
            Log::debug("Process of name '" + uri + "' is already running. Bringing it to foreground...");
            this->window_ref->pm->bringToForeground(uri);
        }
    } else {
        Log::debug("Attempting to start process for uri '" + uri + "'");
        this->window_ref->pm->startProcess(uri);
    }
    return this;
}
// -----------------------------------------
WF* WF::sendNotif(
    const std::string& title, 
    const std::string& message, 
    const std::filesystem::path& icon_path_from_resource
) {
    std::filesystem::path icon_path =
        std::filesystem::path(File::getDir()
        / "resource"
        / icon_path_from_resource);
#if defined(_WIN32)
    Log::error("sendNotif has a BROKEN piece of code for windows");
    // Log::debug(icon_path.substr(icon_path.length()-3, 3));
    // if (icon_path.length() > 2 && icon_path.substr(icon_path.length()-3, 3) != "ico") {
    //     icon_path = icon_path.substr(0, icon_path.find_last_of('.')) + ".ico";
    // }
#endif
    Log::debug("Trying to display icon with path " + icon_path.string());
    (void)pfd::notify(title, message, icon_path);
    return this;
}
// -----------------------------------------
WF* WF::openURI(std::string resource) { 
    if (WindowHelpers::isURI(resource)) {
        for (size_t i = 0; i < resource.length(); i++) {
            if (resource[i] == '\\') resource[i] = '/';
        }
    } else {
        resource = WindowHelpers::formatPath(resource);
    }
#if defined(_WIN32)
    system(("start " + resource).c_str());
    Log::warn("openURI has not been tested for Windows");
#elif defined(__APPLE__)
    system(("open " + resource).c_str());
    Log::warn("openURI has not been tested for Apple");
#elif defined(__linux__)
    int res = system(("xdg-open " + resource).c_str());
    (void)res;
#endif
    return this;
}
// -----------------------------------------