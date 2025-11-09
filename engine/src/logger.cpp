#include "../include/logger.hpp"

#include <spdlog/sinks/basic_file_sink.h>
#include <spdlog/sinks/stdout_color_sinks.h>
#include <string>
#include "file.hpp"
#include "page.hpp"

using File = RenWeb::File;
using Page = RenWeb::Page;

void Log::clear() {
    if (std::filesystem::exists(Log::getPath())) {
        std::filesystem::resize_file(Log::getPath(), 0);
    }
}

std::filesystem::path Log::getPath() {
    return std::filesystem::path(File::getDir()).append(LOG_FILE_NAME);
}

void Log::refresh() {
    const std::string date_str = "%Y-%m-%d %H:%M:%S.%e";
    const std::string thread_str = "%t";
    const std::string log_type_str = "%^%l%$";
    const std::string msg_str = "%v";
    const std::string title = Page::getTitle();
    std::stringstream colored_log_str, boring_log_str;
    if (!title.empty()) {
        colored_log_str << "[\e[1;2;31m" << title << "\e[0m] ";
        boring_log_str << "[" << title << "] ";
    }
    if (!Page::getPage().empty()) {
        colored_log_str << "[\e[35m" << Page::getPage() << "\e[0m] ";
        boring_log_str << "[" << Page::getPage() << "] ";
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
    console_sink->set_level(Log::log_level);
    console_sink->set_pattern(colored_log_str.str());

    auto file_sink = std::make_shared<spdlog::sinks::basic_file_sink_mt>(Log::getPath(), false);
    file_sink->set_level(spdlog::level::trace);
    file_sink->set_pattern(boring_log_str.str());
    std::vector<spdlog::sink_ptr> log_sinks;
    if (!Log::log_silent) {
        log_sinks.push_back(console_sink);
    }
    log_sinks.push_back(file_sink);
    auto default_logger = std::make_shared<spdlog::logger>(LOGGER_NAME, begin(log_sinks), end(log_sinks));

    // spdlog::register_logger(default_logger);
    spdlog::set_default_logger(default_logger);
    spdlog::set_level(Log::log_level);
    //spdlog::flush_on(spdlog::level::warn);
    #if defined(_WIN32)
    // https://solarianprogrammer.com/2019/04/08/c-programming-ansi-escape-codes-windows-macos-linux-terminals/
        HWND console_handle = GetStdHandle(STD_OUTPUT_HANDLE);
        DWORD out_mode;
        if (console_handle == INVALID_HANDLE_VALUE
          && spdlog::actual_level < spdlog::level::info) {
            AllocConsole();
            console_window = GetStdHandle(STD_OUTPUT_HANDLE);
            GetConsoleMode(console_handle, &outMode);
            outMode |= ENABLE_VIRTUAL_TERMINAL_PROCESSING;
            SetConsoleMode(console_handle, out_mode)
            Log::trace("WINDOWS: started console.");
        }
    #endif
    // Log::trace("Logger refresh count: " + std::to_string(Log::log_refresh_count));
}