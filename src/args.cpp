#include "../include/args.hpp"

#include "../include/json.hpp"
#include "../include/locate.hpp"
#include "../include/managers/callback_manager.hpp"
#include "../include/managers/process_manager.hpp"
#include "../include/app.hpp"
#include "../include/info.hpp"
#include "../include/logger.hpp"
#include <boost/json.hpp>
#include <iostream>
#include <memory>

using namespace RenWeb;
using ArgsCM = RenWeb::CallbackManager<std::string, void, boost::any>;
using PM = RenWeb::ProcessManager<int>;
namespace json = boost::json;

Args::Args(int argc, char** argv)
    : arg_callbacks(std::unique_ptr<ArgsCM>(new ArgsCM())) 
{
    this->argc = argc;
    this->argv = argv;
    this->addDefaults();
}

Args::~Args() { }

Args* Args::add(
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


Args* Args::addDefaults() {
    return this
    ->add(
        "help,h",
        boost::program_options::bool_switch()->default_value(false),
        "Displays help info)",
        [this](boost::any bool_switch)
        {
            if (boost::any_cast<bool>(bool_switch)) {
                std::cout << this->desc << std::endl;
                exit(1);
            }
        })
    ->add(
        "version,v",
        boost::program_options::bool_switch()->default_value(false),
        "Displays version info)",
        [this](boost::any bool_switch)
        {
            if (boost::any_cast<bool>(bool_switch)) {
                auto info = Info::getInfoFile();
                if (!info->exists()) {
                    std::cerr << "\033[31m[ERROR]\033[0m [ARGS] 'info.json' not found at: " << info->getPath().string() << std::endl;
                    std::cerr << "\033[31m[ERROR]\033[0m [ARGS] Cannot proceed without file." << std::endl;
                    exit(2);
                }
                json::value title = JSON::peek(info.get(), "title");
                json::value version = JSON::peek(info.get(), "version");
                std::cout 
                    << (title.is_string() ? std::string(title.as_string()) : Info::UNKNOWN_TITLE)
                    << " ("
                    << (version.is_string() ? std::string(version.as_string()) : Info::UNKNOWN_VERSION)
                    << ")"
                    << std::endl;
                exit(1);
            }
        })
    ->add(
        "log-silent,s",
        boost::program_options::bool_switch()->default_value(false),
        "Sets whether log prints to console",
        [this](boost::any log_silent)
        {
            this->opts["log_silent"] = boost::any_cast<bool>(log_silent) ? "true" : "false";
        })
    ->add(
        "log-level,l",
        boost::program_options::value<unsigned int>()->default_value(2, "2 (info)"),
        "Sets log level (n>=0)",
        [this](boost::any log_level)
        {
            this->opts["log_level"] = std::to_string(boost::any_cast<unsigned int>(log_level));
        })
    ->add(
        "log-clear,c",
        boost::program_options::bool_switch()->default_value(false),
        "Clears the log file",
        [this](boost::any bool_switch)
        {
            this->opts["log_clear"] = boost::any_cast<bool>(bool_switch) ? "true" : "false";
        })
    ->add(
        "ip,i",
        boost::program_options::value<std::string>()->default_value("127.0.0.1", "IP Address"),
        "IP of web server",
        [this](boost::any ip)
        {
            this->opts["ip"] = boost::any_cast<std::string>(ip); 
        })
    ->add(
        "port,p",
        boost::program_options::value<unsigned short>()->default_value(8270, "8270"),
        "Web server port (n>=0)",
        [this](boost::any port)
        {
            this->opts["port"] = std::to_string(boost::any_cast<unsigned short>(port)); 
        })
    ->add(
        "pages,P",
        boost::program_options::value<std::vector<std::string>>()->multitoken()->default_value(std::vector<std::string>{}, "Starting Page(s)"),
        "List of pages to open",
        [this](boost::any pages)
        {
            std::vector<std::string>& pages_vec(boost::any_cast<std::vector<std::string>&>(pages));
            
            if (pages_vec.size() > 1) {
                auto pm = std::make_unique<PM>(std::make_shared<FakeLogger>());
                std::vector<std::string> args;
                for (int arg_num = 0; arg_num < this->argc; arg_num++) {
                    std::string arg = this->argv[arg_num];
                    if (arg.rfind("-P", 0) != 0) {
                        args.emplace_back(std::move(arg));
                    }
                }
                for (int page_num = 0; page_num < (int)pages_vec.size(); page_num++) {
                    std::vector<std::string> updated_args = args;
                    updated_args.emplace_back("-P" + pages_vec[page_num]);
                    pm->add(page_num, updated_args);
                }
                pm->waitAll();
                exit(0);
            } else if (pages_vec.empty() || pages_vec[0] == "_") {
                pages_vec.clear();
                auto info = Info::getInfoFile();
                if (!info->exists()) {
                    std::cerr << "\033[31m[ERROR]\033[0m [ARGS] 'info.json' not found at: " << info->getPath().string() << std::endl;
                    std::cerr << "\033[31m[ERROR]\033[0m [ARGS] Cannot proceed without file." << std::endl;
                    exit(2);
                }
                json::value starting_pages = JSON::peek(info.get(), "starting_pages");
                if (starting_pages.is_string()) {
                    pages_vec.emplace_back(starting_pages.as_string());
                } else if (starting_pages.is_array()) {
                    for (const auto& item : starting_pages.as_array()) {
                        if (item.is_string()) {
                            pages_vec.emplace_back(item.as_string());
                        }
                    }
                    if (pages_vec.empty()) {
                        std::cerr << "\033[31m[ERROR]\033[0m [ARGS] 'starting_pages' property in '" << info->getPath().string() << "' is empty or malformed!" << std::endl;
                        exit(3);
                    }
                } else {
                    std::cerr << "\033[31m[ERROR]\033[0m [ARGS] 'starting_pages' property in '" << info->getPath().string() << "' is missing or isn't a string or string[]!" << std::endl;
                    exit(3);
                }
                if (pages_vec.size() > 1) {
                    auto pm = std::make_unique<PM>(std::make_shared<FakeLogger>());
                    std::vector<std::string> args;
                    for (int arg_num = 0; arg_num < this->argc; arg_num++) {
                        std::string arg = this->argv[arg_num];
                        if (arg.rfind("-P", 0) != 0) {
                            args.emplace_back(std::move(arg));
                        }
                    }
                    for (int page_num = 0; page_num < (int)pages_vec.size(); page_num++) {
                        std::vector<std::string> updated_args = args;
                        updated_args.emplace_back("-P" + pages_vec[page_num]);
                        pm->add(page_num, updated_args);
                    }
                    pm->waitAll();
                    exit(0);
                }
            }
            
            this->opts["page"] = pages_vec[0];
            std::unique_ptr<App> app = AppBuilder(this->opts, this->argc, this->argv).build();
            app->run();
        });
}

void Args::run() /*override*/ {
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
        std::cerr << "\x1b[31m[ERROR]\x1b[0m [args] " << e.what() << std::endl;
        throw;
    }
}