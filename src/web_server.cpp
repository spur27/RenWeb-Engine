#include "web_server.hpp" 

#include "app.hpp"
#include "json.hpp"
#include "info.hpp"
#include "config.hpp"

using WebServer = RenWeb::WebServer;
using MethodsCM = RenWeb::CallbackManager<std::string, void, const httplib::Request&, httplib::Response&>;
// namespace WH = RenWeb::WindowHelpers;


WebServer::WebServer(
    App* app,
    const unsigned short& port, 
    const std::string& ip
) : app(app)
    , method_callbacks(new MethodsCM())
    , server()
    , port(port)
    , ip(ip)
{ 
    auto base_path = this->app->info->getProperty("base_path");
    if (base_path.is_string()) {
        this->base_path = std::filesystem::path(base_path.as_string().c_str());
    } else {
        this->base_path = Locate::currentDirectory();
    }
    this->app->logger->debug("Base path is " + this->base_path.string());
    this->setHandles();
    this->setMethodCallbacks();
}

WebServer::~WebServer() {
    // Stop the server if it's still running
    if (this->server.is_running()) {
        this->app->logger->trace("Stopping server during WebServer destruction");
        try {
            this->server.stop();
        } catch (...) {
            // Ignore exceptions during destruction
        }
    }
    
    // Wait for the server thread to finish
    if (this->server_thread.joinable()) {
        try {
            this->server_thread.join();
        } catch (...) {
            // Ignore exceptions during destruction
        }
    }
    
    this->app->logger->trace("Deconstructing WebServer");
}


std::string WebServer::getURL() const /*override*/ {
    return "http://" + this->ip + ":" + std::to_string(this->port);
}

void WebServer::start() /*override*/ {
    if (this->server.is_running()) {
        this->app->logger->error("Can't start server while it's already running.");
        return;
    } else if (this->server_thread.joinable()) {
        this->app->logger->error("Can't start server while the server thread is in use.");
        return;
    }
    this->server_thread = std::thread([this](){
        for (; this->port < 65535; this->port++) {
            try {
                this->app->logger->trace("[SERVER] trying port " + std::to_string(this->port));
                this->server.listen(this->ip, this->port);
                return;
            } catch (...) { }
        }
        this->app->logger->critical("[SERVER] Exhausted all possible ports.");
        throw std::runtime_error("Couldn't find port to start webserver on.");
    });
    this->app->logger->info("[SERVER] running on " + this->getURL());
    this->server.wait_until_ready();
}

void WebServer::stop() /*override*/ {
    if (!this->server.is_running()) {
        this->app->logger->error("Can't stop server while it isn't running.");
        return;
    } else if (!this->server_thread.joinable()) {
        this->app->logger->error("Can't stop server while the server thread isn't being used.");
        return;
    }
    try {
        if (this->server.is_running()) {
            this->server.wait_until_ready();
            this->server.stop();
        }
        if (this->server_thread.joinable()) {
            this->server_thread.join();
        }
    } catch (const std::exception& e) {
        this->app->logger->error(e.what());
    }
    this->app->logger->trace("Deconstructing WebServer");
}

void WebServer::setHandles() {
    this->server.set_keep_alive_max_count(100);
    this->server.set_read_timeout(10, 0);
    this->server.set_write_timeout(10, 0);
    
    this->server.set_logger([this](const httplib::Request& req, const httplib::Response& res) {
        this->app->logger->info("[SERVER] " + req.method + " " + req.path + " -> " + std::to_string(res.status));
    });
    this->server.set_error_logger([this](const httplib::Error& err, const httplib::Request* req) {
        (void)req;
        this->app->logger->error("[SERVER] " + httplib::to_string(err));
    });
    this->server.set_error_handler([](const httplib::Request& req, httplib::Response& res) {
        (void)req;
        auto fmt = "<p>Error Status: <span style='color:red;'>%d</span></p>";
        char buf[BUFSIZ];
        snprintf(buf, sizeof(buf), fmt, res.status);
        res.set_content(buf, "text/html");    
    });
    this->server.set_exception_handler([this](const auto& req, auto& res, std::exception_ptr ep) {
        (void)req;
        auto fmt = "<h1>Error 500</h1><p>%s</p>";
        char buf[BUFSIZ];
        try {
            std::rethrow_exception(ep);
        } catch (const std::exception &e) {
            this->app->logger->error(std::string("[SERVER]") + e.what());
            snprintf(buf, sizeof(buf), fmt, e.what());
        }
        res.set_content(buf, "text/html");
        res.status = httplib::StatusCode::InternalServerError_500;
    });
    this->server.set_file_request_handler([this](const httplib::Request &req, httplib::Response &res) {
        this->app->logger->debug("Sending (" + std::to_string(res.body.length()) + ") " + req.target);
    });
}

void WebServer::setMethodCallbacks() {
    this->server.Get(".*", [this](const httplib::Request &req, httplib::Response &res) {
        std::filesystem::path target_dir = (req.target == "/")
            ? "index.html"
            : std::filesystem::path(req.target.substr(1)).string();  
            std::array<std::filesystem::path, 4> search_paths = {
                this->base_path / "custom" / target_dir,
                this->base_path / "content" / this->app->config->current_page / target_dir,
                this->base_path / target_dir,
                this->base_path / "backup" / target_dir
            };
        for (const auto& path : search_paths) {
            if (std::filesystem::exists(path)) {
                this->sendFile(req, res, path);
                return;
            }
        }
    });
    this->server.Put(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::MethodNotAllowed_405);
    });
    this->server.Post(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::MethodNotAllowed_405);
    });
    this->server.Patch(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::MethodNotAllowed_405);
    });
    this->server.Delete(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::NotFound_404, "Resource not found at target " + req.target);
    });
}

void WebServer::sendStatus(const httplib::Request& req, httplib::Response& res, const httplib::StatusCode& code, const std::string& desc) {
    (void)req;
    // res.status = code;
    std::stringstream body;
    body << "<p><strong>" << code << "</strong> - " << httplib::status_message(code) << "</p>";
    if (!desc.empty()) {
        body << "<p>" << desc << "</p>";
    }
    res.set_content(body.str(), "text/html");
}

void WebServer::sendFile(const httplib::Request& req, httplib::Response& res, const std::filesystem::path& path) {
    std::error_code ec;
    auto file_size = std::filesystem::file_size(path, ec);
    if (ec) {
        this->app->logger->critical("Error getting file size");
        res.status = 500;
        this->sendStatus(req, res, httplib::StatusCode::PreconditionFailed_412, ec.message());
        return;
    }
    
    res.set_header("Accept-Ranges", "bytes");
    
    res.set_content_provider(
        file_size,
        this->getMimeType(path),
        [path, file_size](size_t offset, size_t length, httplib::DataSink &sink) {
            if (offset >= file_size) return false;
            if (offset + length > file_size) length = file_size - offset;
            
            std::ifstream ifs(path, std::ios::binary);
            if (!ifs || !ifs.seekg(offset, std::ios::beg)) return false;
            
            const size_t chunk_size = 262144; // 256KB
            size_t remaining = length;
            std::vector<char> buffer(std::min(chunk_size, length));
            
            while (remaining > 0) {
                size_t to_read = std::min(remaining, buffer.size());
                ifs.read(buffer.data(), to_read);
                std::streamsize bytes_read = ifs.gcount();
                
                if (bytes_read <= 0) break;
                if (!sink.write(buffer.data(), static_cast<size_t>(bytes_read))) return false;
                
                remaining -= bytes_read;
                if (!ifs.good() && !ifs.eof()) break;
            }
            
            return remaining == 0;
        }
    );
}
// https://github.com/yhirose/cpp-httplib