#pragma once

#include <filesystem>

namespace RenWeb {
    class File {
        private: 
            inline static std::string name{};
            inline static std::filesystem::path dir{};
            inline static std::filesystem::path path{};
            File();
        public:
            static const std::string& getName();
            static const std::filesystem::path& getDir();
            static const std::filesystem::path& getPath();
            static void refresh();
    };
};
