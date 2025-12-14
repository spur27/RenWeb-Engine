#pragma once

#include <string>

namespace RenWeb {
    class IWebServer {
        public:
            virtual ~IWebServer() = default;
            virtual std::string getURL() const = 0;
            virtual void start() = 0;
            virtual void stop() = 0;
    };
}