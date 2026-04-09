/*
 * MIT License
 *
 * Copyright (c) 2017 Serge Zaitsev
 * Copyright (c) 2022 Steffen André Langnes
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

// PATCHED VERSION: Window starts hidden by default

#ifndef WEBVIEW_BACKENDS_COCOA_WEBKIT_HH
#define WEBVIEW_BACKENDS_COCOA_WEBKIT_HH

#if defined(__cplusplus) && !defined(WEBVIEW_HEADER)

#include "../../../../external/webview/core/include/webview/macros.h"

#if defined(WEBVIEW_PLATFORM_DARWIN) && defined(WEBVIEW_COCOA)

#include "../../../../external/webview/core/include/webview/types.hh"
#include "../../../../external/webview/core/include/webview/detail/engine_base.hh"
#include "../../../../external/webview/core/include/webview/detail/platform/darwin/cocoa/cocoa.hh"
#include "../../../../external/webview/core/include/webview/detail/platform/darwin/objc/objc.hh"
#include "../../../../external/webview/core/include/webview/detail/platform/darwin/webkit/webkit.hh"
#include "../../../../external/webview/core/include/webview/detail/user_script.hh"

#include <atomic>
#include <functional>
#include <list>
#include <memory>
#include <string>

#include <objc/objc-runtime.h>

namespace webview {
namespace detail {

class user_script::impl {
public:
  impl(id script) : m_script{objc::retain(script)} {}

  ~impl() { objc::release(m_script); }

  impl(const impl &) = delete;
  impl &operator=(const impl &) = delete;
  impl(impl &&) = delete;
  impl &operator=(impl &&) = delete;

  id get_native() const { return m_script; }

private:
  id m_script{};
};

namespace cocoa_webkit {

using namespace cocoa;
using namespace webkit;

class cocoa_wkwebview_engine : public engine_base {
public:
  cocoa_wkwebview_engine(bool debug, void *window)
      : engine_base{!window}, m_app{NSApplication_get_sharedApplication()} {
    window_init(window);
    window_settings(debug);
    dispatch_size_default();
    
    // PATCH: Ensure window is hidden after all initialization
    if (owns_window() && m_window) {
      objc::autoreleasepool arp;
      objc::msg_send<void>(m_window, objc::selector("orderOut:"), nullptr);
    }
  }

  cocoa_wkwebview_engine(const cocoa_wkwebview_engine &) = delete;
  cocoa_wkwebview_engine &operator=(const cocoa_wkwebview_engine &) = delete;
  cocoa_wkwebview_engine(cocoa_wkwebview_engine &&) = delete;
  cocoa_wkwebview_engine &operator=(cocoa_wkwebview_engine &&) = delete;

  virtual ~cocoa_wkwebview_engine() {
    objc::autoreleasepool arp;
    if (m_window) {
      if (m_webview) {
        if (auto ui_delegate{WKWebView_get_UIDelegate(m_webview)}) {
          WKWebView_set_UIDelegate(m_webview, nullptr);
          objc::release(ui_delegate);
        }
        objc::release(m_webview);
        m_webview = nullptr;
      }
      if (m_widget) {
        if (m_widget == NSWindow_get_contentView(m_window)) {
          NSWindow_set_contentView(m_window, nullptr);
        }
        objc::release(m_widget);
        m_widget = nullptr;
      }
      if (owns_window()) {
        NSWindow_set_delegate(m_window, nullptr);
        NSWindow_close(m_window);
        on_window_destroyed(true);
      }
      m_window = nullptr;
    }
    if (m_window_delegate) {
      objc::release(m_window_delegate);
      m_window_delegate = nullptr;
    }
    if (m_app_delegate) {
      NSApplication_set_delegate(m_app, nullptr);
      objc::release(m_app_delegate);
      m_app_delegate = nullptr;
    }
    if (owns_window()) {
      deplete_run_loop_event_queue();
    }
  }

protected:
  result<void *> window_impl() override {
    if (m_window) {
      return m_window;
    }
    return error_info{WEBVIEW_ERROR_INVALID_STATE};
  }

  result<void *> widget_impl() override {
    if (m_widget) {
      return m_widget;
    }
    return error_info{WEBVIEW_ERROR_INVALID_STATE};
  }

  result<void *> browser_controller_impl() override {
    if (m_webview) {
      return m_webview;
    }
    return error_info{WEBVIEW_ERROR_INVALID_STATE};
  }

  noresult terminate_impl() override {
    stop_run_loop();
    return {};
  }

  noresult run_impl() override {
    NSApplication_run(m_app);
    return {};
  }

  noresult dispatch_impl(std::function<void()> f) override {
    dispatch_async_f(dispatch_get_main_queue(), new dispatch_fn_t(f),
                     (dispatch_function_t)([](void *arg) {
                       auto f = static_cast<dispatch_fn_t *>(arg);
                       (*f)();
                       delete f;
                     }));
    return {};
  }

  noresult set_title_impl(const std::string &title) override {
    NSWindow_set_title(m_window, title);
    return {};
  }
  
  noresult set_size_impl(int width, int height, webview_hint_t hints) override {
    objc::autoreleasepool arp;

    auto style = static_cast<NSWindowStyleMask>(
        NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
        NSWindowStyleMaskMiniaturizable);
    if (hints != WEBVIEW_HINT_FIXED) {
      style =
          static_cast<NSWindowStyleMask>(style | NSWindowStyleMaskResizable);
    }
    NSWindow_set_styleMask(m_window, style);

    if (hints == WEBVIEW_HINT_MIN) {
      NSWindow_set_contentMinSize(m_window, NSSizeMake(width, height));
    } else if (hints == WEBVIEW_HINT_MAX) {
      NSWindow_set_contentMaxSize(m_window, NSSizeMake(width, height));
    } else {
      auto rect{NSWindow_get_frame(m_window)};
      NSWindow_setFrame(m_window,
                        NSRectMake(rect.origin.x, rect.origin.y, width, height),
                        true, false);
    }
    NSWindow_center(m_window);

    // PATCH: Don't automatically show window when size is set.
    // The window is already hidden by window_settings() before this runs,
    // so no explicit orderOut: is needed here.
    // Original: return window_show();
    return {};
  }
  
  noresult navigate_impl(const std::string &url) override {
    objc::autoreleasepool arp;

    WKWebView_loadRequest(
        m_webview, NSURLRequest_requestWithURL(NSURL_URLWithString(url)));

    return {};
  }
  
  noresult set_html_impl(const std::string &html) override {
    objc::autoreleasepool arp;
    WKWebView_loadHTMLString(m_webview, NSString_stringWithUTF8String(html),
                             nullptr);
    return {};
  }
  
  noresult eval_impl(const std::string &js) override {
    objc::autoreleasepool arp;
    auto nsurl{WKWebView_get_URL(m_webview)};
    if (!nsurl) {
      return {};
    }
    WKWebView_evaluateJavaScript(m_webview, NSString_stringWithUTF8String(js),
                                 nullptr);
    return {};
  }

  user_script add_user_script_impl(const std::string &js) override {
    objc::autoreleasepool arp;
    auto wk_script{WKUserScript_withSource(
        NSString_stringWithUTF8String(js),
        WKUserScriptInjectionTimeAtDocumentStart, true)};
    WKUserContentController_addUserScript(m_manager, wk_script);
    user_script script{
        js, user_script::impl_ptr{new user_script::impl{wk_script},
                                  [](user_script::impl *p) { delete p; }}};
    return script;
  }

  void remove_all_user_scripts_impl(
      const std::list<user_script> & /*scripts*/) override {
    objc::autoreleasepool arp;
    WKUserContentController_removeAllUserScripts(m_manager);
  }

  bool are_user_scripts_equal_impl(const user_script &first,
                                   const user_script &second) override {
    auto *wk_first = first.get_impl().get_native();
    auto *wk_second = second.get_impl().get_native();
    return wk_first == wk_second;
  }

private:
  id create_app_delegate() {
    objc::autoreleasepool arp;
    constexpr auto class_name = "WebviewAppDelegate";
    auto cls = objc_lookUpClass(class_name);
    if (!cls) {
      cls =
          objc_allocateClassPair(objc::get_class("NSResponder"), class_name, 0);
      class_addProtocol(cls, objc_getProtocol("NSTouchBarProvider"));
      class_addMethod(
          cls,
          objc::selector("applicationShouldTerminateAfterLastWindowClosed:"),
          (IMP)(+[](id, SEL, id) -> BOOL { return NO; }), "c@:@");
      class_addMethod(cls, objc::selector("applicationDidFinishLaunching:"),
                      (IMP)(+[](id self, SEL, id notification) {
                        auto app{NSNotification_get_object(notification)};
                        auto w = get_associated_webview(self);
                        w->on_application_did_finish_launching(self, app);
                      }),
                      "v@:@");
      objc_registerClassPair(cls);
    }
    return objc::Class_new(cls);
  }
  
  id create_script_message_handler() {
    objc::autoreleasepool arp;
    constexpr auto class_name = "WebviewWKScriptMessageHandler";
    auto cls = objc_lookUpClass(class_name);
    if (!cls) {
      cls =
          objc_allocateClassPair(objc::get_class("NSResponder"), class_name, 0);
      class_addProtocol(cls, objc_getProtocol("WKScriptMessageHandler"));
      class_addMethod(
          cls, objc::selector("userContentController:didReceiveScriptMessage:"),
          (IMP)(+[](id self, SEL, id, id msg) {
            auto w = get_associated_webview(self);
            w->on_message(
                NSString_get_UTF8String(WKScriptMessage_get_body(msg)));
          }),
          "v@:@@");
      objc_registerClassPair(cls);
    }
    auto instance{objc::Class_new(cls)};
    set_associated_webview(instance, this);
    return instance;
  }
  
  static id create_webkit_ui_delegate() {
    objc::autoreleasepool arp;
    constexpr auto class_name = "WebviewWKUIDelegate";
    auto cls = objc_lookUpClass(class_name);
    if (!cls) {
      cls = objc_allocateClassPair(objc::get_class("NSObject"), class_name, 0);
      class_addProtocol(cls, objc_getProtocol("WKUIDelegate"));
      class_addMethod(
          cls,
          objc::selector("webView:runOpenPanelWithParameters:initiatedByFrame:"
                         "completionHandler:"),
          (IMP)(+[](id, SEL, id, id parameters, id, id completion_handler) {
            auto allows_multiple_selection{
                WKOpenPanelParameters_get_allowsMultipleSelection(parameters)};
            auto allows_directories{
                WKOpenPanelParameters_get_allowsDirectories(parameters)};

            auto panel{NSOpenPanel_openPanel()};
            NSOpenPanel_set_canChooseFiles(panel, true);
            NSOpenPanel_set_canChooseDirectories(panel, allows_directories);
            NSOpenPanel_set_allowsMultipleSelection(panel,
                                                    allows_multiple_selection);
            auto modal_response{NSSavePanel_runModal(panel)};

            id urls{modal_response == NSModalResponseOK
                        ? NSOpenPanel_get_URLs(panel)
                        : nullptr};

            auto sig{NSMethodSignature_signatureWithObjCTypes("v@?@")};
            auto invocation{NSInvocation_invocationWithMethodSignature(sig)};
            NSInvocation_set_target(invocation, completion_handler);
            NSInvocation_setArgument(invocation, &urls, 1);
            NSInvocation_invoke(invocation);
          }),
          "v@:@@@@");
      objc_registerClassPair(cls);
    }
    return objc::Class_new(cls);
  }
  
  static id create_window_delegate() {
    objc::autoreleasepool arp;
    constexpr auto class_name = "WebviewNSWindowDelegate";
    auto cls = objc_lookUpClass(class_name);
    if (!cls) {
      cls = objc_allocateClassPair(objc::get_class("NSObject"), class_name, 0);
      class_addProtocol(cls, objc_getProtocol("NSWindowDelegate"));
      class_addMethod(cls, objc::selector("windowWillClose:"),
                      (IMP)(+[](id self, SEL, id notification) {
                        auto window{NSNotification_get_object(notification)};
                        auto w = get_associated_webview(self);
                        w->on_window_will_close(self, window);
                      }),
                      "v@:@");
      objc_registerClassPair(cls);
    }
    return objc::Class_new(cls);
  }
  
  static cocoa_wkwebview_engine *get_associated_webview(id object) {
    objc::autoreleasepool arp;
    if (id assoc_obj{objc_getAssociatedObject(object, "webview")}) {
      cocoa_wkwebview_engine *w{};
      NSValue_getValue(assoc_obj, &w, sizeof(w));
      return w;
    }
    return nullptr;
  }
  
  static void set_associated_webview(id object, cocoa_wkwebview_engine *w) {
    objc::autoreleasepool arp;
    objc_setAssociatedObject(object, "webview", NSValue_valueWithPointer(w),
                             OBJC_ASSOCIATION_RETAIN);
  }
  
  static bool is_app_bundled() noexcept {
    auto bundle = NSBundle_get_mainBundle();
    if (!bundle) {
      return false;
    }
    auto bundle_path = NSBundle_get_bundlePath(bundle);
    auto bundled =
        NSString_hasSuffix(bundle_path, NSString_stringWithUTF8String(".app"));
    return !!bundled;
  }
  
  void on_application_did_finish_launching(id /*delegate*/, id app) {
    if (owns_window()) {
      stop_run_loop();
    }

    if (!is_app_bundled()) {
      NSApplication_setActivationPolicy(app,
                                        NSApplicationActivationPolicyRegular);
      NSApplication_activateIgnoringOtherApps(app, true);
    }

    window_init_proceed();
    
    // PATCH: Ensure window stays hidden after application activation
    if (owns_window() && m_window) {
      objc::msg_send<void>(m_window, objc::selector("orderOut:"), nullptr);
    }
  }
  
  void on_window_will_close(id /*delegate*/, id /*window*/) {
    m_widget = nullptr;
    m_webview = nullptr;
    m_window = nullptr;
    dispatch([this] { on_window_destroyed(); });
  }
  
  void window_settings(bool debug) {
    objc::autoreleasepool arp;

    auto config{objc::autorelease(WKWebViewConfiguration_new())};

    m_manager = WKWebViewConfiguration_get_userContentController(config);

    auto preferences = WKWebViewConfiguration_get_preferences(config);
    auto yes_value = NSNumber_numberWithBool(true);

    if (debug) {
      NSObject_setValue_forKey(
          preferences, yes_value,
          NSString_stringWithUTF8String("developerExtrasEnabled"));
    }

    NSObject_setValue_forKey(
        preferences, yes_value,
        NSString_stringWithUTF8String("fullScreenEnabled"));

#if defined(__has_builtin)
#if __has_builtin(__builtin_available)
    if (__builtin_available(macOS 10.13, *)) {
      NSObject_setValue_forKey(
          preferences, yes_value,
          NSString_stringWithUTF8String("javaScriptCanAccessClipboard"));
      NSObject_setValue_forKey(
          preferences, yes_value,
          NSString_stringWithUTF8String("DOMPasteAllowed"));
    }
#else
#error __builtin_available not supported by compiler
#endif
#else
#error __has_builtin not supported by compiler
#endif

    auto ui_delegate = create_webkit_ui_delegate();
    m_webview =
        objc::retain(WKWebView_withFrame(CGRectMake(0, 0, 0, 0), config));
    auto autoresizing_mask{static_cast<NSAutoresizingMaskOptions>(
        NSViewWidthSizable | NSViewMaxXMargin | NSViewHeightSizable |
        NSViewMaxYMargin)};
    NSView_set_autoresizingMask(m_webview, autoresizing_mask);
    set_associated_webview(ui_delegate, this);
    WKWebView_set_UIDelegate(m_webview, ui_delegate);

    if (debug) {
      WKWebView_set_inspectable(m_webview, true);
    }

    auto script_message_handler =
        objc::autorelease(create_script_message_handler());
    WKUserContentController_addScriptMessageHandler(
        m_manager, script_message_handler,
        NSString_stringWithUTF8String("__webview__"));

    add_init_script("function(message) {\n\
  return window.webkit.messageHandlers.__webview__.postMessage(message);\n\
}");
    set_up_widget();
    NSWindow_set_contentView(m_window, m_widget);
    
    // PATCH: Don't show window automatically - let application code control visibility
    // Original line: NSWindow_makeKeyAndOrderFront(m_window);
    // Explicitly hide window after setup
    if (owns_window() && m_window) {
      objc::msg_send<void>(m_window, objc::selector("orderOut:"), nullptr);
    }
  }
  
  void set_up_widget() {
    objc::autoreleasepool arp;
    m_widget = objc::retain(NSView_withFrame(NSRectMake(0, 0, 0, 0)));
    NSView_set_autoresizesSubviews(m_widget, true);
    NSView_addSubview(m_widget, m_webview);
    NSView_set_frame(m_webview, NSView_get_bounds(m_widget));
  }
  
  void stop_run_loop() {
    objc::autoreleasepool arp;
    NSApplication_stop(m_app);
    auto event{NSEvent_otherEventWithType(
        NSEventTypeApplicationDefined, NSPointMake(0, 0),
        NSEventModifierFlags{}, 0, 0, nullptr, 0, 0, 0)};
    NSApplication_postEvent(m_app, event, true);
  }
  
  static bool get_and_set_is_first_instance() noexcept {
    static std::atomic_bool first{true};
    bool temp = first;
    if (temp) {
      first = false;
    }
    return temp;
  }
  
  void window_init(void *window) {
    objc::autoreleasepool arp;

    m_window = static_cast<id>(window);
    if (!owns_window()) {
      return;
    }

    if (!get_and_set_is_first_instance()) {
      window_init_proceed();
      return;
    }

    m_app_delegate = create_app_delegate();
    set_associated_webview(m_app_delegate, this);
    NSApplication_set_delegate(m_app, m_app_delegate);

    NSApplication_run(m_app);
  }
  
  void window_init_proceed() {
    objc::autoreleasepool arp;

    m_window = objc::retain(NSWindow_withContentRect(
        NSRectMake(0, 0, 0, 0), NSWindowStyleMaskTitled, NSBackingStoreBuffered,
        false));
    
    // PATCH: Explicitly hide the window immediately after creation
    objc::msg_send<void>(m_window, objc::selector("orderOut:"), nullptr);
    
    m_window_delegate = create_window_delegate();
    set_associated_webview(m_window_delegate, this);
    NSWindow_set_delegate(m_window, m_window_delegate);
    on_window_created();
  }

  // PATCH: Implement window_show to actually show/hide the window
  noresult window_show() {
    objc::autoreleasepool arp;
    if (m_is_window_shown) {
      return {};
    }
    if (owns_window()) {
      NSWindow_makeKeyAndOrderFront(m_window);
    }
    m_is_window_shown = true;
    return {};
  }

  void run_event_loop_while(std::function<bool()> fn) override {
    objc::autoreleasepool arp;
    while (fn()) {
      objc::autoreleasepool arp2;
      if (auto event{NSApplication_nextEventMatchingMask(
              m_app, NSEventMaskAny, nullptr,
              NSRunLoopMode::NSDefaultRunLoopMode(), true)}) {
        NSApplication_sendEvent(m_app, event);
      }
    }
  }

  id m_app{};
  id m_app_delegate{};
  id m_window_delegate{};
  id m_window{};
  id m_widget{};
  id m_webview{};
  id m_manager{};
  bool m_is_window_shown{};
};

} // namespace cocoa_webkit
} // namespace detail

using browser_engine = detail::cocoa_webkit::cocoa_wkwebview_engine;

} // namespace webview

#endif // defined(WEBVIEW_PLATFORM_DARWIN) && defined(WEBVIEW_COCOA)
#endif // defined(__cplusplus) && !defined(WEBVIEW_HEADER)
#endif // WEBVIEW_BACKENDS_COCOA_WEBKIT_HH
