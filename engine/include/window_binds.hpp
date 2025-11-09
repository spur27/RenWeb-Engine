#pragma once

#include <memory>
#include <functional>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace RenWeb {
  class __Window__;
  class App;
}

namespace RenWeb {
    class WindowBinds {
        private:
            RenWeb::__Window__* window_ref;
            RenWeb::WindowBinds* bindBaseFunctions();
            RenWeb::WindowBinds* bindGetSetFunctions();
        public:
            WindowBinds(RenWeb::__Window__* window_ref);
            ~WindowBinds();
            RenWeb::WindowBinds* bindFunction(const std::string&, std::function<std::string(std::string)>);
            RenWeb::WindowBinds* unbindFunction(const std::string&);
    };
};
