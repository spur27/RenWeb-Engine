#include "../include/web_server.hpp"

#include "../include/app.hpp"
#include "../include/json.hpp"
#include "../include/info.hpp"
#include "../include/config.hpp"

using WebServer = RenWeb::WebServer;
using MethodsCM = RenWeb::CallbackManager<std::string, void, const httplib::Request&, httplib::Response&>;
// namespace WH = RenWeb::WindowHelpers;


WebServer::WebServer(
    std::shared_ptr<ILogger> logger,
    App* app
) : logger(logger)
    , app(app)
    , method_callbacks(new MethodsCM())
{ 
    auto info_file = RenWeb::Info::getInfoFile();
    const json::value server_obj = JSON::peek(info_file.get(), "server");
    if (server_obj.is_object()) {
        const json::object server_object = server_obj.as_object();
        if (server_object.find("ip") != server_object.end() && server_object.at("ip").is_string())
            this->ip = server_object.at("ip").as_string().c_str();
        if (server_object.find("port") != server_object.end() && server_object.at("port").is_int64())
            this->port =  static_cast<unsigned short>(server_object.at("port").as_int64());
        if (server_object.find("protocol") != server_object.end() && server_object.at("protocol").is_bool())
            this->https = server_object.at("protocol").as_bool();
        if (server_object.find("ssl_cert_path") != server_object.end() && server_object.at("ssl_cert_path").is_string()) {
            this->ssl_cert_path = std::filesystem::path(server_object.at("ssl_cert_path").as_string().c_str());
            if (this->ssl_cert_path.is_relative()) {
                this->ssl_cert_path = this->base_path / this->ssl_cert_path;
            }
        }
        if (server_object.find("ssl_key_path") != server_object.end() && server_object.at("ssl_key_path").is_string()) {
            this->ssl_key_path = std::filesystem::path(server_object.at("ssl_key_path").as_string().c_str());
            if (this->ssl_key_path.is_relative()) {
                this->ssl_key_path = this->base_path / this->ssl_key_path;
            }
        }
    }
    
    if (this->https) {
        if (this->ssl_cert_path.empty() || this->ssl_key_path.empty()) {
            this->logger->error("[server] HTTPS enabled but ssl_cert and/or ssl_key not specified in config. Falling back to HTTP.");
            this->https = false;
            this->server = std::make_unique<httplib::Server>();
        } else {
#ifdef CPPHTTPLIB_OPENSSL_SUPPORT
            this->logger->info("[server] Initializing HTTPS server with cert: " + this->ssl_cert_path.string());
            this->server = std::make_unique<httplib::SSLServer>(this->ssl_cert_path.c_str(), this->ssl_key_path.c_str());
            if (!this->server->is_valid()) {
                this->logger->error("[server] Failed to initialize SSL server. Check certificate and key paths. Falling back to HTTP.");
                this->https = false;
                this->server = std::make_unique<httplib::Server>();
            }
#else
            this->logger->error("[server] HTTPS requested but cpp-httplib was not compiled with OpenSSL support. Falling back to HTTP.");
            this->https = false;
            this->server = std::make_unique<httplib::Server>();
#endif
        }
    } else {
        this->server = std::make_unique<httplib::Server>();
    }
    this->logger->debug("[server] URL is " + std::string(this->https ? "https" : "http") + "://" + this->ip + ":" + (this->port == 0 ? "?????" : std::to_string(this->port)));
    auto info_packaging_obj = JSON::peek(info_file.get(), "packaging");
    if (info_packaging_obj.is_object() && info_packaging_obj.as_object()["base_path"].is_string()) {
        std::filesystem::path unformatted_base_path = std::filesystem::path(
            info_packaging_obj.as_object().at("base_path").as_string().c_str()
        );
        if (!unformatted_base_path.is_absolute()) {
            unformatted_base_path = Locate::currentDirectory() / unformatted_base_path;
        }
        this->base_path = unformatted_base_path;
    } else {
        this->base_path = Locate::currentDirectory();
    }
    this->logger->debug("[server] Base path is " + this->base_path.string());
    
    this->cached_allowed_origins = "'self'";
    const auto origins = JSON::peek(info_file.get(), "origins");
    if (origins.is_array()) {
        for (const auto& origin : origins.as_array()) {
            if (origin.is_string()) {
                this->cached_allowed_origins += " " + std::string(origin.as_string().c_str());
            }
        }
    }
    this->logger->debug("[server] CSP allowed origins:\n\t" + this->cached_allowed_origins);
    
    this->setHandles();
    this->setMethodCallbacks();
}

WebServer::~WebServer() {
    // Stop the server if it's still running
    if (this->server && this->server->is_running()) {
        this->logger->trace("[server] Stopping server during WebServer destruction");
        try {
            this->server->stop();
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

    this->logger->trace("[server] Deconstructing WebServer");
}


std::string WebServer::getURL() const /*override*/ {
    return std::string(this->https ? "https" : "http") + "://" + this->ip + ":" + std::to_string(this->port);
}

void WebServer::start() /*override*/ {
    if (this->server->is_running()) {
        this->logger->error("[server] Can't start server while it's already running.");
        return;
    } else if (this->server_thread.joinable()) {
        this->logger->error("[server] Can't start server while the server thread is in use.");
        return;
    }
    this->server_thread = std::thread([this](){
        try {
            if (this->port == 0) {
                this->port = this->server->bind_to_any_port(this->ip);
                this->logger->info("[server] running on " + this->getURL());
                this->server->listen_after_bind();
            } else {
                this->logger->info("[server] running on " + this->getURL());
                this->server->listen(this->ip, this->port);
            }
            return;
        } catch (...) { }
        this->logger->critical("[server] Something very bad happened to the server.");
        throw std::runtime_error("[server] Something very bad happened to the server.");
    });
    this->server->wait_until_ready();
}

void WebServer::stop() /*override*/ {
    if (!this->server->is_running()) {
        this->logger->error("[server] Can't stop server while it isn't running.");
        return;
    } else if (!this->server_thread.joinable()) {
        this->logger->error("[server] Can't stop server while the server thread isn't being used.");
        return;
    }
    try {
        if (this->server->is_running()) {
            this->server->wait_until_ready();
            this->server->stop();
        }
        if (this->server_thread.joinable()) {
            this->server_thread.join();
        }
    } catch (const std::exception& e) {
        this->logger->error("[server] " + std::string(e.what()));
    }
    this->logger->trace("[server] Deconstructing WebServer");
}

void WebServer::setHandles() {
    this->server->set_keep_alive_max_count(100);
    this->server->set_read_timeout(10, 0);
    this->server->set_write_timeout(10, 0);
    
    this->server->set_logger([this](const httplib::Request& req, const httplib::Response& res) {
        this->logger->info("[server] " + req.method + " " + req.path + " -> " + std::to_string(res.status));
    });
    this->server->set_error_logger([this](const httplib::Error& err, const httplib::Request* req) {
        (void)req;
        this->logger->error("[server] " + httplib::to_string(err));
    });
    this->server->set_error_handler([](const httplib::Request& req, httplib::Response& res) {
        (void)req;
        auto fmt = "<p>Error Status: <span style='color:red;'>%d</span></p>";
        char buf[BUFSIZ];
        snprintf(buf, sizeof(buf), fmt, res.status);
        res.set_content(buf, "text/html");    
    });
    this->server->set_exception_handler([this](const auto& req, auto& res, std::exception_ptr ep) {
        (void)req;
        auto fmt = "<h1>Error 500</h1><p>%s</p>";
        char buf[BUFSIZ];
        try {
            std::rethrow_exception(ep);
        } catch (const std::exception &e) {
            this->logger->error("[server] " + std::string(e.what()));
            snprintf(buf, sizeof(buf), fmt, e.what());
        }
        res.set_content(buf, "text/html");
        res.status = httplib::StatusCode::InternalServerError_500;
    });
    this->server->set_file_request_handler([this](const httplib::Request &req, httplib::Response &res) {
        this->logger->debug("[server] Sending (" + std::to_string(res.body.length()) + ") " + req.target);
    });
}

void WebServer::setMethodCallbacks() {
    this->server->Get(".*", [this](const httplib::Request &req, httplib::Response &res) {
        std::filesystem::path target_dir = (req.target == "/")
            ? "index.html"
            : std::filesystem::path(req.target.substr(1)).string();  
            std::array<std::filesystem::path, 4> search_paths = {
                this->base_path / "custom" / this->app->config->current_page / target_dir,
                this->base_path / "content" / this->app->config->current_page / target_dir,
                this->base_path / target_dir,
                this->base_path / "backup" / this->app->config->current_page / target_dir
            };
        for (const auto& path : search_paths) {
            if (std::filesystem::exists(path)) {
                this->sendFile(req, res, path);
                return;
            }
        }
        // Build clickable file:// links for searched paths
        auto make_link = [](const std::filesystem::path& p) {
            return "<a href=\"file://" + p.string() + "\" style=\"color: #64b5f6; text-decoration: underline;\">" + p.string() + "</a>";
        };
        this->sendStatus(req, res, httplib::StatusCode::NotFound_404, 
            "File not found: <code>" + req.target + "</code><br><br>Searched in:<br>" +
            "• " + make_link(this->base_path / "custom" / this->app->config->current_page / target_dir) + "<br>" +
            "• " + make_link(this->base_path / "content" / this->app->config->current_page / target_dir) + "<br>" +
            "• " + make_link(this->base_path / target_dir) + "<br>" +
            "• " + make_link(this->base_path / "backup" / this->app->config->current_page / target_dir));
    });
    this->server->Put(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::MethodNotAllowed_405);
    });
    this->server->Post(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::MethodNotAllowed_405);
    });
    this->server->Patch(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::MethodNotAllowed_405);
    });
    this->server->Delete(".*", [this](const httplib::Request &req, httplib::Response &res) {
        this->sendStatus(req, res, httplib::StatusCode::NotFound_404, "Resource not found at target " + req.target);
    });
}

void WebServer::sendStatus(const httplib::Request& req, httplib::Response& res, const httplib::StatusCode& code, const std::string& desc) {
    (void)req;
    // res.status = code;
    std::string html = IWebServer::generateErrorHTML(
        static_cast<int>(code),
        httplib::status_message(code),
        desc
    );
    res.set_content(html, "text/html");
}

void WebServer::sendFile(const httplib::Request& req, httplib::Response& res, const std::filesystem::path& path) {
    std::error_code ec;
    auto file_size = std::filesystem::file_size(path, ec);
    if (ec) {
        this->logger->critical("[server] Error getting file size");
        res.status = 500;
        this->sendStatus(req, res, httplib::StatusCode::PreconditionFailed_412, ec.message());
        return;
    }
    
    res.set_header("Accept-Ranges", "bytes");
    
    // Security: Add exhaustive CSP header with whitelisted origins
    std::string csp = "default-src " + this->cached_allowed_origins + "; "
                     "img-src " + this->cached_allowed_origins + " data:; "
                     "script-src " + this->cached_allowed_origins + " 'unsafe-inline' 'unsafe-eval'; "
                     "style-src " + this->cached_allowed_origins + " 'unsafe-inline'; "
                     "font-src " + this->cached_allowed_origins + " data:; "
                     "connect-src " + this->cached_allowed_origins + "; "
                     "media-src " + this->cached_allowed_origins + "; "
                     "frame-src " + this->cached_allowed_origins + "; "
                     "worker-src " + this->cached_allowed_origins + "; "
                     "manifest-src " + this->cached_allowed_origins + "; "
                     "form-action " + this->cached_allowed_origins + " file:; "
                     "frame-ancestors 'self'; "
                     "object-src 'none'; "
                     "base-uri 'self';";
    res.set_header("Content-Security-Policy", csp);
    
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

bool WebServer::isURIAllowed(const std::string& uri) const /*override*/ {
    if (uri.rfind(this->getURL(), 0) == 0) {
        return true;
    }
    const auto origins = this->app->info->getProperty("origins");
    if (origins.is_null()) {
        this->logger->warn("[server] No origins specified in info file; denying all external URIs");
        return false;
    } else if (!origins.is_array()) {
        this->logger->warn("[server] Origins property in info file is not an array; denying all external URIs");
        return false;
    } else {
        for (const auto& origin : origins.as_array()) {
            if (origin.is_string() && uri.rfind(origin.as_string(), 0) == 0) {
                return true;
            }
        }
        return false;
    }
}