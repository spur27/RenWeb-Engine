#pragma once

#include <map>
#include <memory>
#include <string>
// v Included to prevent naming conflict with webview v
    #include <httplib.h>
// ^ Included to prevent naming conflict with webview ^
#include <webview/webview.h>
#include "nlohmann/json.hpp"
#include "managers.hpp"

namespace RenWeb {
    class WindowBinds;
    class WindowFunctions;
    class ProcessManager;
    class WebServer;
    class SignalHandler;
}

using json = nlohmann::json;

namespace RenWeb {
    class __Window__ : public webview::webview {
        public:
            std::unique_ptr<RenWeb::WindowFunctions> fns;
            std::unique_ptr<RenWeb::ProcessManager> pm;
            std::unique_ptr<RenWeb::WebServer> ws;
            std::unique_ptr<RenWeb::SignalHandler> sh;
            std::unique_ptr<RenWeb::WindowBinds> binds;
            // std::unique_ptr<RenWeb::WindowFunctions> fns;
            __Window__(std::map<std::string, std::string>&);
            ~__Window__();
            void __init__();
            void __run__();
    };
    class Window {
        private:
            std::unique_ptr<RenWeb::__Window__> w;
        public:
            Window(std::map<std::string, std::string>&);
            ~Window();
            void run();
    };
};
