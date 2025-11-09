#include "../include/file.hpp"

#include <stdexcept>
#include <whereami.hpp>

using File = RenWeb::File;

File::File() {
    throw std::runtime_error("Tried to construct static class File");
}

// File::~File() { }

/*static*/ const std::string& File::getName() {
    if (File::name.empty()) File::refresh();
	return File::name;
}
/*static*/ const std::filesystem::path& File::getDir() {
    if (File::dir.empty()) File::refresh();
    return File::dir;
}
/*static*/ const std::filesystem::path& File::getPath() {
    if (File::path.empty()) File::refresh();
    return File::path;
}
/*static*/ void File::refresh() {
	std::string path_str = whereami::getExecutablePath();
    File::path = std::filesystem::path(path_str);
    // File::path = std::filesystem::path(boost::dll::program_location().string());
    File::name = File::path.filename();
    File::dir = File::path.parent_path();
}