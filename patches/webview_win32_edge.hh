#pragma once

// RENWEB ENGINE: Intermediary header for webview win32_edge.hh patches
// 
// This file includes the patched win32_edge.hh from the patches directory,
// ensuring that our modifications are used instead of the original library code.
// 
// By using a single intermediary header, we avoid copying the entire webview
// include tree (69+ files). Instead, we only shadow the one file we modified.
//
// The patched win32_edge.hh adds:
//  - ICoreWebView2NavigationStartingEventHandler interface
//  - navigation_callback_t type for URL filtering
//  - Navigation handler registration in controller creation
//  - Navigation Invoke() method for security checks
//  - set_navigation_callback() API for runtime configuration

#include "webview/detail/backends/win32_edge.hh"
