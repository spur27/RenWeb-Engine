#include "../include/args.hpp"

#include <chrono>
#include <cstdio>
#include <iostream>
#include <boost/process.hpp>
#include "boost/program_options/value_semantic.hpp"
#include <thread>
#include "file.hpp"
#include "info.hpp"
#include "page.hpp"
#include "logger.hpp"
#include "window.hpp"

using CM = RenWeb::CallbackManager<std::string, boost::any>;
using Args = RenWeb::Args;
using File = RenWeb::File;
using Info = RenWeb::Info;
using Page = RenWeb::Page;

Args::Args()
    : arg_callbacks(std::unique_ptr<CM>(new CM())) 
{
    this->addDefaultArgs();
}

Args::~Args() { }

Args* Args::addArg(
    const std::string& names,
    const boost::program_options::value_semantic* val,
    const std::string& description,
    std::function<void(boost::any)> callback
) {
    this->desc.add_options()(names.c_str(), val, description.c_str());
    const std::string name = names.substr(0, names.rfind(','));
    this->arg_callback_order_vec.push_back(name);
    this->arg_callbacks->add(name, callback);
    return this;
}


Args* Args::addDefaultArgs() {
    return this
    ->addArg(
        "help,h",
        boost::program_options::bool_switch()->default_value(false),
        "Displays help info)",
        [&](boost::any bool_switch)
        {

            if (boost::any_cast<bool>(bool_switch)) {
                std::cout << this->desc << std::endl;
                exit(1);
            }
        })
    ->addArg(
        "version,v",
        boost::program_options::bool_switch()->default_value(false),
        "Displays version info)",
        [&](boost::any bool_switch)
        {
            if (boost::any_cast<bool>(bool_switch)) {
                std::string title = Info::getProperty<std::string>("title", "UNKNOWN TITLE");
                std::string version = Info::getProperty<std::string>("version", "?.?.?");
                std::cout 
                    << title
                    << " ("
                    << version
                    << ")"
                    << std::endl;
                exit(1);
            }
        })
    ->addArg(
        "log_silent,s",
        boost::program_options::bool_switch()->default_value(false),
        "Sets whether log prints to console",
        [&](boost::any log_level)
        {
            Log::log_silent = boost::any_cast<bool>(log_level);
            Log::refresh();
        })
    ->addArg(
        "log_level,l",
        boost::program_options::value<unsigned int>()->default_value(2, "2 (info)"),
        "Sets log level (n>=0)",
        [&](boost::any log_level)
        {
            Log::log_level = spdlog::level::level_enum(boost::any_cast<unsigned int>(log_level));
            Log::refresh();
        })
    ->addArg(
        "clear_log,c",
        boost::program_options::bool_switch()->default_value(false),
        "Clears the log file",
        [&](boost::any bool_switch)
        {
            if (boost::any_cast<bool>(bool_switch)) {
                std::cout << "Log file at " << Log::getPath().string() << " cleared." << std::endl;
                Log::clear();
                exit(1);
            }
        })
    ->addArg(
        "port,p",
        boost::program_options::value<unsigned short>()->default_value(8270, "8270"),
        "Web server port (n>=0)",
        [&](boost::any port)
        {
            this->opts["port"] = std::to_string(boost::any_cast<unsigned short>(port)); 
        })
    ->addArg(
        "ip,i",
        boost::program_options::value<std::string>()->default_value("127.0.0.1", "IP Address"),
        "IP of web server",
        [&](boost::any ip)
        {
            this->opts["ip"] = boost::any_cast<std::string>(ip); 
        })
    ->addArg(
        "pages,P",
        boost::program_options::value<std::vector<std::string>>()->multitoken()->default_value(std::vector<std::string>{}, "Starting Page(s)"),
        "List of pages to open",
        [&](boost::any pages)
        {
            std::vector<std::string>& pages_vec(boost::any_cast<std::vector<std::string>&>(pages));
            while (true) {
                if (pages_vec.size() > 1) {
                    std::vector<boost::process::child> child_procs;
                    child_procs.reserve(pages_vec.size());
                    for (const auto& page_name_v : pages_vec) {
                        child_procs.push_back(boost::process::child(File::getPath().string(), "-P", page_name_v, "-l", std::to_string(Log::log_level), boost::process::std_out > stdout, boost::process::std_err > stderr, boost::process::std_in < stdin));
                    }
                    for (auto& proc : child_procs) {
                        while (proc.running()) {
                            std::this_thread::sleep_for(std::chrono::milliseconds(500));
                        }
                    }
                    exit(1);
                } else {
                    if (pages_vec.empty() || pages_vec[0] == "_") {
                        pages_vec.clear();
                        std::vector<std::string> starting_pages({});
                        try {
                            starting_pages = Info::getProperty<std::vector<std::string>>("starting_pages");
                            if (starting_pages.empty()) {
                                throw std::runtime_error("The \"starting_pages\" property in " + Info::getPath().string() + " is empty!!");
                            }
                        } catch (const std::exception& e) {
                            Log::critical("No/incorrectly-formatted starting pages found in " + Info::getPath().string() + " nor were there any pages provided in arguments.");
                            Log::critical(e.what());
                            exit(-1);
                        }
                        pages_vec.insert(pages_vec.begin(), starting_pages.begin(), starting_pages.end());
                        // continue;
                    } else {
                        Page::setPage(pages_vec[0]);
                        Log::refresh();
                        std::unique_ptr<RenWeb::Window> window(new RenWeb::Window(this->opts));
                        window->run();
                        break;
                    }
                }
            } // while
        });
}

void Args::runArgs(int argc, char** argv) {
    boost::program_options::variables_map vm;
    try {
        boost::program_options::store(boost::program_options::parse_command_line(argc, argv, this->desc), vm);
        for (const std::string& callback_name : this->arg_callback_order_vec) {
            const auto& it = vm.find(callback_name);
            if (it != vm.end()) {
                this->arg_callbacks->run(it->first, it->second.value());
            }
        }
    } catch (const std::exception& e) {
        Log::critical(std::string("[RUNNING ARGS] ") + e.what());
    }
}