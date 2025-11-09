#pragma once

#if defined(_WIN32)
  #ifndef ENABLE_VIRTUAL_TERMINAL_PROCESSING
    #define ENABLE_VIRTUAL_TERMINAL_PROCESSING 0x0004
  #endif
#endif
#define LOGGER_NAME "default"
#define LOG_FILE_NAME "log.txt"

#include <spdlog/spdlog.h>
#include <filesystem>


namespace RenWeb {
    namespace Log {
        inline spdlog::level::level_enum log_level = spdlog::level::trace;
        inline bool log_silent = false;
        // inline unsigned int log_refresh_count = 0;
        template <typename T>
            inline void trace(const T& msg) {
                spdlog::trace(msg);
            }
        template <typename T>
            inline void debug(const T& msg) {
                spdlog::debug(msg);
            }
        template <typename T>
            inline void info(const T& msg) {
                spdlog::info(msg);
            }
        template <typename T>
            inline void warn(const T& msg) {
                spdlog::warn(msg);
            }
        template <typename T>
            inline void error(const T& msg) {
                spdlog::error(msg);
            }
        template <typename T>
            inline void critical(const T& msg) {
                spdlog::critical(msg);
            }
        void clear();
        std::filesystem::path getPath();
        void refresh();
    }
}

namespace Log = RenWeb::Log;
