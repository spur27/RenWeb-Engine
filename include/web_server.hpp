#pragma once

#include "interfaces/Ilogger.hpp"
#define MAX_NUM_PORTS_TO_TRY 64
#define BUFFER_SIZE 16 * 1024

#include "httplib.h"
#include "managers/callback_manager.hpp"
#include "interfaces/Iweb_server.hpp"
#include <filesystem>

namespace RenWeb {
    class App;
}

namespace RenWeb {
    class WebServer: public RenWeb::IWebServer {
        public:
            WebServer(
                std::shared_ptr<ILogger> logger,
                App* app,
                const unsigned short& port, 
                const std::string& ip
            );
            ~WebServer();
            std::string getURL() const override;
            void start() override;
            void stop() override;
        private:
            std::shared_ptr<ILogger> logger;
            App* app;
            std::filesystem::path base_path;
            std::unique_ptr<RenWeb::CallbackManager<std::string, void, const httplib::Request&, httplib::Response&>> method_callbacks;
            httplib::Server server;
            std::thread server_thread;
            unsigned short port;
            const std::string ip;
            void setHandles();
            void setMethodCallbacks();
            void sendFile(
                const httplib::Request& req, 
                httplib::Response& res,
                const std::filesystem::path& path
            );
            void sendStatus(
                const httplib::Request& req, 
                httplib::Response& res, 
                const httplib::StatusCode& code,
                const std::string& desc =""
            );
            std::string getMimeType(const std::filesystem::path& file);
            static std::map<std::string, std::string> mime_types;
    };
}