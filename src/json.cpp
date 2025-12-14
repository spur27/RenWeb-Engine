#include "../include/json.hpp"

#include <boost/json/parse.hpp>
#include <memory>
#include <stdexcept>
#include "file.hpp"

using File = RenWeb::File;
using ILogger = RenWeb::ILogger;
using JSON = RenWeb::JSON;
namespace json = boost::json;

JSON::JSON(std::shared_ptr<ILogger> logger, std::shared_ptr<File> file)
    : logger(logger), file(file)
{ 
    if (this->file->exists()) {
        this->json_data = json::parse(this->file->read()->data()).as_object();
    } else {
        this->logger->error("JSON file at '" + this->file->getPath().string() + "' does not exist. Setting to null");
        this->json_data = json::value(nullptr);
    }
}


// JSON::~JSON();

/*static*/ json::value JSON::peek(File* file, const std::string& key) {
    if (file->exists()) {
        try {
            json::object json_contents = json::parse(file->read()->data()).as_object();
            if (json_contents.contains(key)) {
                return json_contents[key];
            } else {
                throw std::runtime_error("Could not find key '" + key + "' when peeking on " + file->getPath().string());
            }
        } catch (...) {
            return json::value(nullptr);
        }
    } else {
        throw std::runtime_error("File does not exist: " + file->getPath().string());
    }
}

/*static*/ json::object JSON::merge(json::object old_data, const json::object& new_data) {
    for (const auto& [key, val] : new_data) {
        if (val.is_object() && old_data.contains(key) && old_data.at(key).is_object()) {
            old_data[key] = JSON::merge(old_data.at(key).get_object(), val.get_object());
        } else {
            old_data[key] = val;
        }
    }
    return old_data;
}

/*virtual*/ const json::value& JSON::getJson() const {
    return this->json_data;
}


/*virtual*/ json::value JSON::getProperty(const std::string& key) const {
    try {
        return this->json_data.as_object().at(key);
    } catch (const std::exception& e) {
        this->logger->error(e.what());
        return json::value(nullptr);
    }
}

/*virtual*/ void JSON::setProperty(const std::string& key, const json::value& value) {
    try {
        this->json_data.as_object()[key] = value;
    } catch (const std::exception& e) {
        this->logger->error(e.what());
    }
}

/*virtual*/ void JSON::update(const json::object& new_data) {
    try {
        // Read file once and cache
        json::object file_data = json::parse(this->file->read()->data()).as_object();
        
        // Merge in order: file → memory → new
        this->json_data = JSON::merge(
            JSON::merge(file_data, this->json_data.as_object()),
            new_data
        );
        
        this->file->write(json::serialize(this->json_data));
    } catch (const std::exception& e) {
        this->logger->error(e.what());
    }
}
