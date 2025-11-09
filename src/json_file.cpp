#include "../include/json_file.hpp"

#include <fstream>
#include "file.hpp"

using File = RenWeb::File;
using JSONFile = RenWeb::JSONFile;

JSONFile::JSONFile() {
    throw std::runtime_error("Tried to construct static class JSONFile");
}
/*static*/ json JSONFile::getFile(const std::filesystem::path& json_path) {
    try {
        if (!std::filesystem::exists(json_path)) {
            throw std::runtime_error("File not found at '" + json_path.string() + "'. Returning empty object");
        }
        json json_file;
        std::ifstream json_file_contents(json_path, std::ios_base::binary);
        json_file_contents >> json_file;
        json_file_contents.close();
        return json_file;
    } catch (const std::exception& e) {
        Log::error(e.what());
        return json::object();
    }
}
/*static*/ json JSONFile::getFile(const std::string& json_path) { 
    return JSONFile::getFile(std::filesystem::path(json_path));
}
/*static*/ void JSONFile::setFile(const std::filesystem::path& json_path, const json& json) {
    try {
        if (!std::filesystem::exists(json_path)) {
            Log::error("File not found at '" + json_path.string() +"'. A new one will be made.");
        }
        std::ofstream json_file(json_path, std::ios_base::trunc);
        json_file << json.dump(2);
        json_file.close();
    } catch (const std::exception& e) {
        Log::error(e.what());
    }
}
/*static*/ void JSONFile::setFile(const std::string& json_path, const json& json) {
    JSONFile::setFile(std::filesystem::path(json_path), json);
}