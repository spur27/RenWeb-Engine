#pragma once

#include <string>
#include <map>

namespace RenWeb {
    class ILogger {
        public:
            virtual ~ILogger() = default;
            virtual void trace(const std::string& msg) = 0;
            virtual void debug(const std::string& msg) = 0;
            virtual void info(const std::string& msg) = 0;
            virtual void warn(const std::string& msg) = 0;
            virtual void error(const std::string& msg) = 0;
            virtual void critical(const std::string& msg) = 0;
            virtual void refresh(std::map<std::string, std::string> fmt) = 0;
    };
}