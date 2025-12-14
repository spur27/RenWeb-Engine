#pragma once

#include <boost/any.hpp>
#include <boost/program_options.hpp>
#include "managers/callback_manager.hpp"

namespace RenWeb {
  class App;
}

namespace RenWeb {
    class Args {
        private:
            int argc;
            char** argv;
            std::unique_ptr<RenWeb::CallbackManager<std::string, void, boost::any>> arg_callbacks;
            std::vector<std::string> arg_callback_order_vec;
            boost::program_options::options_description desc 
                = boost::program_options::options_description("Available Options");            
            std::map<std::string, std::string> opts;
            RenWeb::Args* addDefaults();
        public:
            Args(int argc, char** argv);
            ~Args();
          // ----------
            RenWeb::Args* add(
                const std::string& names,
                const boost::program_options::value_semantic* val,
                const std::string& description,
                std::function<void(boost::any)> callback
            );
          // ----------
            void run();
    };
};
