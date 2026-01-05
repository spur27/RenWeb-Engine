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
            inline static std::string generateBlockedNavigationHTML(const std::string& blocked_uri, const std::string& reason) {
                static const char* html_template = R"(<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
    <title>Navigation Blocked</title>
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
            color: #ff5555;
            margin-top: 0;
        }
        p {
            color: #e0e0e0;
            line-height: 1.6;
        }
        .uri {
            background: #1a1a1a;
            padding: 10px;
            border-radius: 4px;
            word-break: break-all;
            font-family: monospace;
            font-size: 0.9em;
            color: #b0b0b0;
        }
        .reason {
            color: #e0e0e0;
            margin-top: 20px;
            padding: 15px;
            background: #1e1e1e;
            border-left: 4px solid transparent;
            border-image: linear-gradient(180deg,
                rgba(255,0,0,1) 0%, rgba(255,154,0,1) 10%, rgba(208,222,33,1) 20%,
                rgba(79,220,74,1) 30%, rgba(63,218,216,1) 40%, rgba(47,201,226,1) 50%,
                rgba(28,127,238,1) 60%, rgba(95,21,242,1) 70%, rgba(186,12,248,1) 80%,
                rgba(251,7,217,1) 90%, rgba(255,0,0,1) 100%) 1;
        }
        .back-button {
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
        .back-button:hover {
            background: #e53935;
        }
    </style>
</head>
<body>
    <div class='container'>
        <h1>Navigation Blocked</h1>
        <p>The application's security policy prevented navigation to this URL:</p>
        <div class='uri'>{{URI}}</div>
        <div class='reason'>
            <strong>Reason:</strong> {{REASON}}
        </div>
        <button class='back-button' onclick='window.history.back()'>← Go Back</button>
    </div>
</body>
</html>)";
                
                std::string html(html_template);
                
                // Replace placeholders with actual values
                size_t pos = html.find("{{URI}}");
                if (pos != std::string::npos) {
                    html.replace(pos, 7, blocked_uri);
                }
                
                pos = html.find("{{REASON}}");
                if (pos != std::string::npos) {
                    html.replace(pos, 10, reason);
                }
                
                return html;
            }
            
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
        <button class='restart-button' onclick='restartApp()'>&larr; Restart</button>
    </div>
    <script>
        async function restartApp() {
            try {
                // Try using the bindings
                if (typeof BIND_duplicate_process !== 'undefined' && typeof BIND_terminate !== 'undefined') {
                    await BIND_duplicate_process(null);
                    await BIND_terminate(null);
                } else {
                    // Fallback: reload the page
                    window.location.reload();
                }
            } catch (err) {
                console.error('Failed to restart:', err);
                window.location.reload();
            }
        }
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
            
            virtual bool isURIAllowed(const std::string& uri) const = 0;
    };
}