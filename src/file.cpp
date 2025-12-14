#include "../include/file.hpp" 

using File = RenWeb::File;

File::File(std::filesystem::path file_path) 
    : file_path(std::move(file_path)) 
{ };
// ~File() { }
/*virtual*/ const std::filesystem::path File::getName() const {
    return this->file_path.filename();
};
/*virtual*/ const std::filesystem::path File::getExtension() const {
    return this->file_path.extension();
};
/*virtual*/ std::filesystem::path File::getDir() const {
    return this->file_path.parent_path();
};
/*virtual*/ const std::filesystem::path& File::getPath() const {
    return this->file_path;
};
/*virtual*/ void File::clear() const {
    if (std::filesystem::exists(this->getPath())) {
        std::filesystem::resize_file(this->getPath(), 0);
    }
};
/*virtual*/ bool File::exists() const {
    return std::filesystem::exists(this->getPath());
};
/*virtual*/ std::shared_ptr<std::string> File::read() const {
    if (!this->exists()) {
        throw std::runtime_error("File not found at '" + this->getPath().string() + "'. Could not attempt read.");
    }
    std::ifstream file_stream(this->getPath(),  std::ios::in | std::ios::binary);
    auto contents = std::make_shared<std::string>("");
    if (file_stream) {
        file_stream.seekg(0, std::ios::end);
        contents->resize(file_stream.tellg());
        file_stream.seekg(0, std::ios::beg);
        file_stream.read(&(*contents)[0], contents->size());
        file_stream.close();
    } else {
        throw std::runtime_error("Could not open file at '" + this->getPath().string() + "' for reading.");
    }
    return contents;
};
/*virtual*/ void File::write(const std::string& data) const {
    std::ofstream file_stream(this->getPath(), std::ios::out | std::ios::binary);
    if (file_stream) {
        file_stream.write(data.c_str(), data.size());
        file_stream.close();
    } else {
        throw std::runtime_error("Could not open file at '" + this->getPath().string() + "' for writing.");
    }
};
