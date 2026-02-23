# RenWeb Plugins

This directory contains example plugins for the RenWeb engine.

## What are Plugins?

Plugins extend RenWeb's functionality by allowing you to register custom functions that can be called from JavaScript in your web application. They are dynamically loaded shared libraries (.so on Linux, .dylib on macOS, .dll on Windows).

## Building the Example Plugin

### Using Make (Recommended)

```bash
cd plugins
make              # Build the plugin
make install      # Build and copy to ../build/plugins/
```

### Manual Compilation

**Linux:**
```bash
g++ -shared -fPIC example_plugin.cpp -o example_plugin.so -I../include -std=c++17
```

**macOS:**
```bash
g++ -shared -fPIC example_plugin.cpp -o example_plugin.dylib -I../include -std=c++17
```

**Windows:**
```bash
cl /LD example_plugin.cpp /I..\include /Fe:example_plugin.dll
```

## Using Plugins

1. Build your plugin (see above)
2. Copy the plugin file to `build/plugins/`
3. Run RenWeb - plugins are automatically loaded at startup

## Example Plugin Functions

The example plugin provides the following functions:

### `square`
Calculates the square of a number.
```javascript
renweb.call("ExamplePlugin_square", {value: 5})
// Returns: {result: 25, input: 5}
```

### `factorial`
Calculates the factorial of a number (max 20).
```javascript
renweb.call("ExamplePlugin_factorial", {n: 5})
// Returns: {result: 120, input: 5}
```

### `power`
Raises a base to an exponent.
```javascript
renweb.call("ExamplePlugin_power", {base: 2, exponent: 10})
// Returns: {result: 1024, base: 2, exponent: 10}
```

### `reverse_string`
Reverses a string.
```javascript
renweb.call("ExamplePlugin_reverse_string", {text: "hello"})
// Returns: {result: "olleh", original: "hello"}
```

### `info`
Gets plugin information.
```javascript
renweb.call("ExamplePlugin_info", {})
// Returns plugin metadata
```

## Creating Your Own Plugin

1. **Include the plugin header:**
```cpp
#include "../include/plugin.hpp"
```

2. **Create a class that extends `RenWeb::Plugin`:**
```cpp
class MyPlugin : public RenWeb::Plugin {
public:
    MyPlugin(std::shared_ptr<RenWeb::ILogger> logger)
        : RenWeb::Plugin("MyPlugin", "1.0.0", "My custom plugin", logger) {
        
        // Register your functions
        functions["my_function"] = [](const json::value& req) -> json::value {
            // Your implementation here
            return json::object{{"result", "success"}};
        };
    }
};
```

3. **Implement the factory function:**
```cpp
extern "C" {
    RenWeb::Plugin* createPlugin(std::shared_ptr<RenWeb::ILogger> logger) {
        return new MyPlugin(logger);
    }
}
```

4. **Compile as a shared library** (see build instructions above)

5. **Deploy to `build/plugins/`**

## Plugin Function Naming

Functions are automatically prefixed with the plugin name when registered:
- Plugin: "ExamplePlugin", Function: "square" → `ExamplePlugin_square`
- You can also get a list of all plugins: `get_plugins_list`

## Tips

- Use `logger->info()`, `logger->error()`, etc. for debugging
- All functions receive and return `boost::json::value`
- Wrap your code in try-catch blocks for error handling
- The `functions` map is protected - populate it in your constructor
- Plugins are loaded at startup and remain active for the application lifetime

## Troubleshooting

**Plugin not loading:**
- Check the logs for error messages
- Verify the plugin file is in `build/plugins/`
- Ensure the plugin has the correct extension (.so/.dylib/.dll)
- Check that the `createPlugin` function is properly exported

**Function not found:**
- Remember functions are prefixed with plugin name: `PluginName_function`
- Check the function was added to the `functions` map
- Verify the plugin loaded successfully in the logs

## Documentation

For more information about the plugin system architecture, see:
- `../docs/PLUGIN_SYSTEM.md` (if available)
- `../include/plugin.hpp` - Plugin interface definition
- `../include/managers/plugin_manager.hpp` - Plugin loading system
