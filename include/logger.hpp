#pragma once

#include "info.hpp"
#include "interfaces/Ilogger.hpp"
#include "file.hpp"
#include "json.hpp"
#include "locate.hpp"
#include "spdlog/logger.h"
#include "spdlog/sinks/basic_file_sink.h"
#include "spdlog/sinks/stdout_color_sinks.h"
#include <memory>
#include <filesystem>
#if defined(_WIN32)
  #ifndef ENABLE_VIRTUAL_TERMINAL_PROCESSING
    #define ENABLE_VIRTUAL_TERMINAL_PROCESSING 0x0004
  #endif
#  include <windows.h>
#endif

namespace RenWeb {
    struct LogFlags {
        bool log_silent = false;
        spdlog::level::level_enum log_level = spdlog::level::trace;
        bool log_clear = false;
    };
    class FakeLogger : public RenWeb::ILogger {
        public:
            ~FakeLogger() override = default;
            void trace(const std::string& msg) override { (void)msg; };
            void debug(const std::string& msg) override { (void)msg; };
            void info(const std::string& msg) override { (void)msg; };
            void warn(const std::string& msg) override { (void)msg; };
            void error(const std::string& msg) override { (void)msg; };
            void critical(const std::string& msg) override { (void)msg; };
            void refresh(std::map<std::string, std::string> fmt) override { (void)fmt; };
    };
    class Logger : public RenWeb::ILogger {
        private: 
            std::unique_ptr<struct RenWeb::LogFlags> flags;
            std::unique_ptr<spdlog::logger> logger;
            std::shared_ptr<File> file;
        public:
            Logger(
                std::unique_ptr<LogFlags> flags = std::make_unique<LogFlags>()
            )
            : flags(std::move(flags))
            { 
                auto info_file = RenWeb::Info::getInfoFile();
                auto info_packaging_obj = JSON::peek(info_file.get(), "packaging");
                if (info_packaging_obj.is_object() && info_packaging_obj.as_object()["log_path"].is_string()) {
                    std::filesystem::path log_path = (info_packaging_obj.as_object()["log_path"].as_string().c_str());
                    if (!log_path.is_absolute()) {
                        log_path = RenWeb::Locate::currentDirectory() / log_path;
                    }
                    this->file = std::shared_ptr<File>(new File(log_path));
                } else {
                    this->file = std::shared_ptr<File>(new File(Locate::currentDirectory() / "log.txt"));
                }
                this->refresh({});
            };
            Logger(
                std::shared_ptr<File> file,
                std::unique_ptr<LogFlags> flags = std::make_unique<LogFlags>()
            )
            : flags(std::move(flags)),
              file(file)
            { 
                this->refresh({});
            };
            void trace(const std::string& msg) override {
                this->logger->trace(msg);
            }
            void debug(const std::string& msg) override {
                this->logger->debug(msg);
            };
            void info(const std::string& msg) override {
                this->logger->info(msg);
            };
            void warn(const std::string& msg) override {
                this->logger->warn(msg);
            };
            void error(const std::string& msg) override {
                this->logger->error(msg);
            };
            void critical(const std::string& msg) override {
                this->logger->critical(msg);
            };
            void refresh(std::map<std::string, std::string> fmt) override {
                const std::string date_str = "%Y-%m-%d %H:%M:%S.%e";
                const std::string thread_str = "%t";
                const std::string log_type_str = "%^%l%$";
                const std::string msg_str = "%v";
                const std::string page = (fmt.find("page") != fmt.end()) ? fmt.at("page") : "";
                std::stringstream colored_log_str, boring_log_str;
                if (!page.empty()) {
                    colored_log_str << "[\x1b[35m" << page << "\x1b[0m] ";
                    boring_log_str << "[" << page << "] ";
                }
                colored_log_str << "\x1b[34m" << date_str << "\x1b[0m"
                            << " [\x1b[3m" << thread_str << "\x1b[0m] "
                            << "[" << log_type_str << "] "
                            << msg_str;
                boring_log_str << date_str
                            << " [" << thread_str << "] "
                            << "[" << log_type_str << "] "
                            << msg_str;
                auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
                console_sink->set_level(this->flags->log_level);
                console_sink->set_pattern(colored_log_str.str());

                auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(this->file->getPath().string(), false);
                file_sink->set_level(spdlog::level::trace);
                file_sink->set_pattern(boring_log_str.str());
                std::vector<spdlog::sink_ptr> log_sinks;
                if (!this->flags->log_silent) {
                    log_sinks.push_back(console_sink);
                }
                log_sinks.push_back(file_sink);
                
                this->logger.reset(new spdlog::logger("default", begin(log_sinks), end(log_sinks)));
                this->logger->set_level(spdlog::level::trace);

                #if defined(_WIN32)
                    HANDLE console_handle = GetStdHandle(STD_OUTPUT_HANDLE);
                    DWORD mode = 0;
                    BOOL have_console = (console_handle != NULL && console_handle != INVALID_HANDLE_VALUE
                        && GetConsoleMode(console_handle, &mode));

                    if (have_console) {
                        if (!(mode & ENABLE_VIRTUAL_TERMINAL_PROCESSING)) {
                            DWORD new_mode = mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING;
                            SetConsoleMode(console_handle, new_mode);
                        }
                    } else if (this->flags->log_level < spdlog::level::info) {
                        if (AllocConsole()) {
                            console_handle = GetStdHandle(STD_OUTPUT_HANDLE);
                            if (console_handle != NULL && console_handle != INVALID_HANDLE_VALUE) {
                                if (GetConsoleMode(console_handle, &mode)) {
                                    DWORD new_mode = mode | ENABLE_VIRTUAL_TERMINAL_PROCESSING;
                                    SetConsoleMode(console_handle, new_mode);
                                }
                            }
                        }
                    }
                #endif
            };
    };
}

// Commented out to avoid namespace conflicts with cpp-httplib
// using Logger = RenWeb::Logger;
