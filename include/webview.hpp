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
            std::optional<void*> widget() override {
                auto result = webview_impl->widget();
                return result.has_value() ? std::optional<void*>(result.value()) : std::nullopt;
            }
    };
}
