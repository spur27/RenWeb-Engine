#pragma once

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
                std::shared_ptr<File> info_file(new File(Locate::currentDirectory() / "info.json"));
                auto log_path = JSON::peek(info_file.get(), "log_path");
                if (log_path.is_string()) {
                    this->file = std::shared_ptr<File>(new File(std::filesystem::path(log_path.as_string().c_str())));
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
                    colored_log_str << "[\e[35m" << page << "\e[0m] ";
                    boring_log_str << "[" << page << "] ";
                }
                colored_log_str << "\e[34m" << date_str << "\e[0m"
                            << " [\e[3m" << thread_str << "\e[0m] "
                            << "[" << log_type_str << "] "
                            << msg_str;
                boring_log_str << date_str
                            << " [" << thread_str << "] "
                            << "[" << log_type_str << "] "
                            << msg_str;
                auto console_sink = std::make_shared<spdlog::sinks::stdout_color_sink_mt>();
                console_sink->set_level(this->flags->log_level);
                console_sink->set_pattern(colored_log_str.str());

                auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(this->file->getPath(), false);
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
                // https://solarianprogrammer.com/2019/04/08/c-programming-ansi-escape-codes-windows-macos-linux-terminals/
                    HWND console_handle = GetStdHandle(STD_OUTPUT_HANDLE);
                    DWORD out_mode;
                    if (console_handle == INVALID_HANDLE_VALUE
                    && this->flags->log_level < spdlog::level::info) {
                        AllocConsole();
                        console_window = GetStdHandle(STD_OUTPUT_HANDLE);
                        GetConsoleMode(console_handle, &outMode);
                        outMode |= ENABLE_VIRTUAL_TERMINAL_PROCESSING;
                        SetConsoleMode(console_handle, out_mode)
                    }
                #endif
                // Log::trace("Logger refresh count: " + std::to_string(Log::log_refresh_count));
            };
    };
}

using Logger = RenWeb::Logger;
