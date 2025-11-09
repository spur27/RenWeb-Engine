#pragma once

#include <boost/any.hpp>
#include <functional>
#include <string>
#include <map>
#include <vector>
#include <memory>
#include <boost/program_options.hpp>
#include "managers.hpp"

namespace RenWeb {
  class App;
}

namespace RenWeb {
    class Args {
        private:
            std::unique_ptr<RenWeb::CallbackManager<std::string, boost::any>> arg_callbacks;
            std::vector<std::string> arg_callback_order_vec;
            boost::program_options::options_description desc 
                = boost::program_options::options_description("Available Options");            
            std::map<std::string, std::string> opts;
            RenWeb::Args* addDefaultArgs();
        public:
            Args();
            ~Args();
          // ----------
            RenWeb::Args* addArg(
                const std::string& names,
                const boost::program_options::value_semantic* val,
                const std::string& description,
                std::function<void(boost::any)> callback
            );
          // ----------
            void runArgs(int, char**);
    };
};
