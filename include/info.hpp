#pragma once

#include "file.hpp"
#include "locate.hpp"

namespace RenWeb {
    namespace Info {
        inline static const std::string UNKNOWN_TITLE = "UNKNOWN"; 
        inline static const std::string UNKNOWN_VERSION = "?.?.?"; 
        inline std::filesystem::path getInfoPath() {
            return Locate::currentDirectory() / "info.json";
        }
        inline std::unique_ptr<File> getInfoFile() {
            return std::make_unique<File>(getInfoPath());
        }
    }
}
