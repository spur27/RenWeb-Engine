#pragma once

#include <string>
#include <regex>

namespace RenWeb {
    class IWebServer {
        public:
            virtual ~IWebServer() = default;
            virtual std::string getURL() const = 0;
            virtual void start() = 0;
            virtual void stop() = 0;
            inline static bool isURI(const std::string& uri) {
                static const std::regex uri_regex(
                    R"(^[a-zA-Z][a-zA-Z0-9+.-]*://[^\s]+$)"
                );
                return std::regex_match(uri, uri_regex);
            };
            inline static std::string generateErrorHTML(int status_code, const std::string& status_message, const std::string& description = "") {
                static const char* html_template = R"(<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>{{CODE}} {{MESSAGE}}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 40px;
            background: #212121;
            color: white;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #282828;
            padding: 40px;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        }
        h1 {
            color: #f44336;
            margin-top: 0;
            font-size: 1.8em;
        }
        .status-code {
            font-size: 4em;
            font-weight: bold;
            background: linear-gradient(180deg,
                rgba(255,0,0,1) 0%, rgba(255,154,0,1) 10%, rgba(208,222,33,1) 20%,
                rgba(79,220,74,1) 30%, rgba(63,218,216,1) 40%, rgba(47,201,226,1) 50%,
                rgba(28,127,238,1) 60%, rgba(95,21,242,1) 70%, rgba(186,12,248,1) 80%,
                rgba(251,7,217,1) 90%, rgba(255,0,0,1) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0;
        }
        p {
            color: #e0e0e0;
            line-height: 1.6;
        }
        .description {
            background: #1e1e1e;
            padding: 15px;
            border-radius: 4px;
            margin-top: 20px;
            color: #b0b0b0;
            font-size: 0.95em;
        }
        .back-button {
            display: none;
            margin-top: 20px;
            margin-right: 10px;
            padding: 12px 24px;
            background: #2196F3;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            border: none;
            cursor: pointer;
            font-size: 1em;
            transition: background 0.2s;
        }
        .back-button:hover {
            background: #1976D2;
        }
        .restart-button {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #f44336;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            border: none;
            cursor: pointer;
            font-size: 1em;
            transition: background 0.2s;
        }
        .restart-button:hover {
            background: #e53935;
        }
    </style>
</head>
<body>
    <div class='container'>
        <div class='status-code'>{{CODE}}</div>
        <h1>{{MESSAGE}}</h1>
        {{DESCRIPTION}}
        <button id='backButton' class='back-button' onclick='goBack()'>Back</button>
        <button class='restart-button' onclick='restartApp()'>Restart</button>
    </div>
    <script>
        if (window.history && window.history.length > 1) {
            document.getElementById('backButton').style.display = 'inline-block';
        }
        
        function goBack() {
            window.history.back();
        }
        
        async function restartApp() {
            try {
                if (typeof BIND_duplicate_process !== 'undefined' && typeof BIND_terminate !== 'undefined') {
                    await BIND_duplicate_process(null);
                    await BIND_terminate(null);
                } else {
                    window.location.reload();
                }
            } catch (err) {
                console.error('Failed to restart:', err);
                window.location.reload();
            }
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (window.history && window.history.length > 1) {
                    goBack();
                } else {
                    restartApp();
                }
            }
            else if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
                e.preventDefault();
                if (typeof BIND_reload_page !== 'undefined') {
                    BIND_reload_page(null);
                } else {
                    window.location.reload();
                }
            }
            else if ((e.ctrlKey && e.key === 'i') || e.key === 'F12') {
                e.preventDefault();
                if (typeof BIND_open_devtools !== 'undefined') {
                    BIND_open_devtools(null);
                }
            }
            else if (e.ctrlKey && (e.key === 'q' || e.key === 'w')) {
                e.preventDefault();
                if (typeof BIND_terminate !== 'undefined') {
                    BIND_terminate(null);
                }
            }
            else if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && !e.ctrlKey && !e.shiftKey) {
                if (window.history && window.history.length > 1) {
                    e.preventDefault();
                    goBack();
                }
            }
        });
    </script>
</body>
</html>)";
                
                std::string html(html_template);
                
                // Replace placeholders
                auto replace = [&html](const std::string& placeholder, const std::string& value) {
                    size_t pos = html.find(placeholder);
                    while (pos != std::string::npos) {
                        html.replace(pos, placeholder.length(), value);
                        pos = html.find(placeholder, pos + value.length());
                    }
                };
                
                replace("{{CODE}}", std::to_string(status_code));
                replace("{{MESSAGE}}", status_message);
                
                if (!description.empty()) {
                    replace("{{DESCRIPTION}}", "<div class='description'>" + description + "</div>");
                } else {
                    replace("{{DESCRIPTION}}", "");
                }
                
                return html;
            }
            
            inline static std::string generateBlockedNavigationHTML(const std::string& blocked_uri, const std::string& reason) {
                std::string description = "<p>The application's security policy prevented navigation to this URL:</p>"
                                        "<div style='background: #1a1a1a; padding: 10px; border-radius: 4px; word-break: break-all; "
                                        "font-family: monospace; font-size: 0.9em; color: #b0b0b0; margin: 15px 0;'>" 
                                        + blocked_uri + "</div>"
                                        "<div style='color: #e0e0e0; margin-top: 20px; padding: 15px; background: #1e1e1e; "
                                        "border-left: 4px solid transparent; border-image: linear-gradient(180deg, "
                                        "rgba(255,0,0,1) 0%, rgba(255,154,0,1) 10%, rgba(208,222,33,1) 20%, "
                                        "rgba(79,220,74,1) 30%, rgba(63,218,216,1) 40%, rgba(47,201,226,1) 50%, "
                                        "rgba(28,127,238,1) 60%, rgba(95,21,242,1) 70%, rgba(186,12,248,1) 80%, "
                                        "rgba(251,7,217,1) 90%, rgba(255,0,0,1) 100%) 1;'>"
                                        "<strong>Reason:</strong> " + reason + "</div>";
                return generateErrorHTML(403, "Navigation Blocked", description);
            }
            
            virtual bool isURIAllowed(const std::string& uri) const = 0;
    };
}