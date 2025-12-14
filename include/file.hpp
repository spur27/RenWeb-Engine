#pragma once

#include <filesystem>
#include <fstream>
#include <memory>

namespace RenWeb {
    class File {
        private: 
            std::filesystem::path file_path;
        public:
            File(std::filesystem::path file_path);
            virtual const std::filesystem::path getName() const;
            virtual const std::filesystem::path getExtension() const;
            virtual std::filesystem::path getDir() const;
            virtual const std::filesystem::path& getPath() const;
            virtual void clear() const;
            virtual bool exists() const;
            virtual std::shared_ptr<std::string> read() const;
            virtual void write(const std::string& data) const;
    };
};
