#pragma once

#define MAX_NUM_PORTS_TO_TRY 64
#define BUFFER_SIZE 16 * 1024

#include <filesystem>
#include <string>
#include <httplib.h>
#include "managers.hpp"


namespace RenWeb {
    template<typename Key, typename... Args>
    class CallbackManager;
}

namespace RenWeb {
    class WebServer {
        public:
            WebServer(
                const unsigned short& port, 
                const std::string& ip
            );
            ~WebServer();
            std::string getURL();
            void start();
            void stop();
        private:
            std::unique_ptr<RenWeb::CallbackManager<std::string, const httplib::Request&, httplib::Response&>> method_callbacks;
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