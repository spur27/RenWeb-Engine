#pragma once

#include <fstream>
#include <filesystem>
#include <memory>

namespace RenWeb {
    class File {
        private: 
            std::filesystem::path file_path;
        public:
            File();
            File(std::filesystem::path file_path);
            ~File() = default;
            
            const std::filesystem::path getName() const;
            const std::filesystem::path getExtension() const;
            std::filesystem::path getDir() const;
            const std::filesystem::path& getPath() const;
            void clear() const;
            bool exists() const;
            std::shared_ptr<std::string> read() const;
            void write(const std::string& data) const;
    };
};
