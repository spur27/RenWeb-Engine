#pragma once

#include <string>
#include <functional>
#include <optional>

namespace RenWeb {
    class IWebview {
        public:
            virtual ~IWebview() = default;
            virtual void run() = 0;
            virtual void terminate() = 0;
            virtual void navigate(const std::string& url) = 0;
            virtual void bind(const std::string& name, std::function<std::string(std::string)> fn) = 0;
            virtual void unbind(const std::string& name) = 0;
            virtual void dispatch(std::function<void()> fn) = 0;
            virtual void set_title(const std::string& title) = 0;
            virtual void set_size(int width, int height) = 0;
            virtual void eval(const std::string& js) = 0;
            virtual std::optional<void*> window() = 0;
            virtual std::optional<void*> widget() = 0;
    };
}