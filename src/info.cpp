#include "../include/info.hpp"

#include "file.hpp"

using Info = RenWeb::Info;
using JSONFile = RenWeb::JSONFile;
using File = RenWeb::File;

Info::Info() {
    throw std::runtime_error("Tried to construct static class Info");
}
/*static*/ json Info::getInfoFile() {
    return JSONFile::getFile(Info::getPath());
}
/*static*/ const json& Info::getInfo() {
    return Info::info_json;
}
/*static*/ std::filesystem::path Info::getPath() {
    return std::filesystem::path(File::getDir()).append(INFO_FILE_NAME);
}
/*static*/ void Info::saveInfoToFile(const json& Info) {
    JSONFile::setFile(Info::getPath(), Info);
}
