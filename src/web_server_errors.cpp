#include "../include/web_server.hpp"

using WebServer = RenWeb::WebServer;

std::string WebServer::generateErrorHTML(int status_code, const std::string& status_message, const std::string& description) {
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
            background: linear-gradient(135deg,
                rgba(255,0,0,1) 5%, rgba(255,154,0,1) 10%, rgba(208,222,33,1) 20%,
                rgba(79,220,74,1) 30%, rgba(63,218,216,1) 40%, rgba(47,201,226,1) 50%,
                rgba(28,127,238,1) 60%, rgba(95,21,242,1) 70%, rgba(186,12,248,1) 80%,
                rgba(251,7,217,1) 90%, rgba(255,0,0,1) 95%);
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
        .reset-button {
            display: inline-block;
            margin-top: 20px;
            margin-right: 10px;
            padding: 12px 24px;
            background: #f321c9;
            color: white;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            border: none;
            cursor: pointer;
            font-size: 1em;
            transition: background 0.2s;
        }
        .reset-button:hover {
            background: #d219a1;
        }
        .restart-button {
            display: inline-block;
            margin-top: 20px;
            margin-right: 10px;
            padding: 12px 24px;
            background: #f48236;
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
            background: #e59035;
        }
        .close-button {
            display: inline-block;
            margin-top: 20px;
            margin-right: 10px;
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
        .close-button:hover {
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
        <button class='reset-button' onclick='resetApp()'>Reset</button>
        <button class='restart-button' onclick='restartApp()'>Restart</button>
        <button class='close-button' onclick='closeApp()'>Close</button>
    </div>
    <script>
        function encode(enc, { string } = { string: "base64" }) {
            switch (typeof enc) {
                case "string":
                    switch (string) {
                        case "base64":
                            return {
                                __encoding_type__: "base64",
                                __val__: Array.from(new TextEncoder().encode(enc))
                            };
                        default:
                            return {
                                __encoding_type__: "none",
                                __val__: []
                            };
                    }
                case "object":
                    if (enc === null) {
                        return null;
                    }
                    else if (Array.isArray(enc)) {
                        return enc.map(el => encode(el, { string }));
                    }
                    else {
                        const encodedObj = {};
                        for (const key in enc) {
                            encodedObj[key] = encode(enc[key], { string });
                        }
                        return encodedObj;
                    }
                default:
                    return enc;
            }
        }

        if (window.history && window.history.length > 1) {
            document.getElementById('backButton').style.display = 'inline-block';
        }
        
        function goBack() {
            window.history.back();
        }
        
        async function resetApp() {
            try {
                if (typeof BIND_reset_page !== 'undefined') {
                    await BIND_reset_page(null);
                } else {
                    window.location.reload();
                }
            } catch (err) {
                console.error('Failed to reset:', err);
                window.location.reload();
            }
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
        async function closeApp() {
            try {
                if (typeof BIND_terminate !== 'undefined') {
                    await BIND_terminate(null);
                } else {
                    window.location.reload();
                }
            } catch (err) {
                console.error('Failed to close:', err);
                window.location.reload();
            }
        }
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (window.history && window.history.length > 1) {
                    goBack();
                } else {
                    closeApp();
                }
            }
            else if ((e.ctrlKey && e.key === 'r') || e.key === 'F5') {
                e.preventDefault();
                resetApp();
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