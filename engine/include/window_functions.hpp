#pragma once

#include <filesystem>
#include <functional>
#include <nlohmann/json.hpp>
#include "file.hpp"
#include "page.hpp"
#include "managers.hpp"

using File = RenWeb::File;
using Page = RenWeb::Page;
using json = nlohmann::json;
using GSM = RenWeb::GetSetManager<std::string, json, const json&>;

namespace RenWeb {
   class __Window__;
}

namespace RenWeb {
    class WindowFunctions {
        private:
            RenWeb::__Window__* window_ref;
            std::unique_ptr<RenWeb::GetSetManager<std::string, json, const json&>> getsets;
            void setGetSets();
            std::map<std::string, json> saved_states;
        public:
            WindowFunctions(RenWeb::__Window__*  window_ref);
            ~WindowFunctions();
            json get(const std::string& property);
            void set(const std::string& property, const json& value);
            json getState();
            void setState(const json& json);
            void saveState();
            std::vector<std::string> getNames();
         // ------------ state ------------
            bool isFocus();
         // ------------ augmenters ------------
            RenWeb::WindowFunctions* show(bool is_window_shown);
            RenWeb::WindowFunctions* changeTitle(const std::string& title);
            RenWeb::WindowFunctions* resetTitle();
            RenWeb::WindowFunctions* reloadPage();
            RenWeb::WindowFunctions* navigatePage(const std::string&);
            RenWeb::WindowFunctions* terminate();
         // ------------ windowing ------------
            std::vector<std::string> openChooseFilesDialog(
               const bool& multi =false, 
               const bool& dirs =false, 
               const std::vector<std::string>& filteration =std::vector<std::string>(), 
               const std::filesystem::path& initial_dir =File::getDir()
            );
            RenWeb::WindowFunctions* openWindow(std::string uri, bool is_single =false);
            RenWeb::WindowFunctions* sendNotif(
               const std::string& title, 
               const std::string& message, 
               const std::filesystem::path& =std::filesystem::path("app.png"));
            RenWeb::WindowFunctions* openURI(std::string resource);
    };
};