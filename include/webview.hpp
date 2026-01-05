#pragma once

#include "interfaces/Iwebview.hpp"
#include <webview/webview.h>
#include <memory>
#include <string>
#include <functional>

namespace RenWeb {
    class Webview : public IWebview {
        private:
            std::unique_ptr<webview::webview> webview_impl;
            
        public:
            Webview(bool debug, void* window) 
                : webview_impl(std::make_unique<webview::webview>(debug, window))
            { }
            ~Webview() override = default;
            
            void run() override {
                webview_impl->run();
            }
            void terminate() override {
                webview_impl->terminate();
            }
            void navigate(const std::string& url) override {
                webview_impl->navigate(url);
            }
            void bind(const std::string& name, std::function<std::string(std::string)> fn) override {
                webview_impl->bind(name, fn);
            }
            void unbind(const std::string& name) override {
                webview_impl->unbind(name);
            }
            void dispatch(std::function<void()> fn) override {
                webview_impl->dispatch(fn);
            }
            void set_title(const std::string& title) override {
                webview_impl->set_title(title);
            }
            void set_size(int width, int height) override {
                webview_impl->set_size(width, height, WEBVIEW_HINT_NONE);
            }
            void eval(const std::string& js) override {
                webview_impl->eval(js);
            }
            
            std::optional<void*> window() override {
                auto result = webview_impl->window();
                return result.has_value() ? std::optional<void*>(result.value()) : std::nullopt;
            }
            
            // Windows: ICoreWebView2*, Linux: WebKitWebView*, macOS: WKWebView*
            std::optional<void*> widget() override {
                #if defined(_WIN32)
                    // On Windows, widget() from library returns HWND, not the webview interface
                    // Use engine's get_webview() to get the actual ICoreWebView2* interface
                    auto engine_ptr = static_cast<webview::detail::win32_edge_engine*>(webview_impl.get());
                    if (!engine_ptr) return std::nullopt;
                    auto webview = engine_ptr->get_webview();
                    // get_webview() may return nullptr if WebView2 hasn't finished initializing yet
                    return webview ? std::optional<void*>(webview) : std::nullopt;
                #else
                    // Linux/macOS: widget() returns the correct type (WebKitWebView*/WKWebView*)
                    auto result = webview_impl->widget();
                    return result.has_value() ? std::optional<void*>(result.value()) : std::nullopt;
                #endif
            }
            
            #if defined(_WIN32)
                std::optional<void*> get_controller() override {
                    auto result = webview_impl->browser_controller();
                    return result.has_value() ? std::optional<void*>(result.value()) : std::nullopt;
                }
                
                void register_navigation_handler(std::function<bool(const std::string&)> callback) override {
                    auto engine_ptr = static_cast<webview::detail::win32_edge_engine*>(webview_impl.get());
                    if (engine_ptr) {
                        engine_ptr->set_navigation_callback(callback);
                    }
                }
            #endif
    };
}
