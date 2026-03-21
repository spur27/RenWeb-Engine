---
applyTo: '*'
description: 'The most comprehensive, practical, and engineer-authored performance optimization instructions for all languages, frameworks, and stacks. Covers frontend, backend, and database best practices with actionable guidance, scenario-based checklists, troubleshooting, and pro tips.'
---

# Performance Optimization Best Practices

## General Principles

- **Measure First, Optimize Second:** Always profile and measure before optimizing. Use benchmarks, profilers, and monitoring tools to identify real bottlenecks.
- **Optimize for the Common Case:** Focus on optimizing code paths that are most frequently executed.
- **Avoid Premature Optimization:** Write clear, maintainable code first; optimize only when necessary.
- **Minimize Resource Usage:** Use memory, CPU, network, and disk resources efficiently.
- **Prefer Simplicity:** Simple algorithms and data structures are often faster and easier to optimize.
- **Document Performance Assumptions:** Clearly comment on any code that is performance-critical or has non-obvious optimizations.
- **Automate Performance Testing:** Integrate performance tests and benchmarks into your CI/CD pipeline.

---

## Frontend Performance

### Rendering and DOM
- **Minimize DOM Manipulations:** Batch updates where possible. Frequent DOM changes are expensive.
- **CSS Animations:** Use CSS transitions/animations over JavaScript for smoother, GPU-accelerated effects.
- **Defer Non-Critical Rendering:** Use `requestIdleCallback` or similar to defer work until the browser is idle.

### Asset Optimization
- **Image Compression:** Use modern image formats (WebP, AVIF) for web delivery.
- **Minification and Bundling:** Use Webpack, Rollup, or esbuild to bundle and minify JS/CSS. Enable tree-shaking.
- **Cache Headers:** Set long-lived cache headers for static assets with cache busting for updates.
- **Lazy Loading:** Use `loading="lazy"` for images and dynamic imports for JS modules.
- **Font Optimization:** Subset fonts and use `font-display: swap`.

### Network Optimization
- **HTTP/2 and HTTP/3:** Enable these protocols for multiplexing and lower latency.
- **Defer/Async Scripts:** Use `defer` or `async` for non-critical JS to avoid blocking rendering.
- **Preload and Prefetch:** Use `<link rel="preload">` and `<link rel="prefetch">` for critical resources.

### JavaScript Performance
- **Avoid Blocking the Main Thread:** Offload heavy computation to Web Workers.
- **Debounce/Throttle Events:** For scroll, resize, and input events, use debounce/throttle to limit handler frequency.
- **Memory Leaks:** Clean up event listeners, intervals, and DOM references.
- **Efficient Data Structures:** Use Maps/Sets for lookups, TypedArrays for numeric data.

```javascript
// BAD: Triggers API call on every keystroke
input.addEventListener('input', (e) => {
  fetch(`/search?q=${e.target.value}`);
});

// GOOD: Debounce API calls
let timeout;
input.addEventListener('input', (e) => {
  clearTimeout(timeout);
  timeout = setTimeout(() => {
    fetch(`/search?q=${e.target.value}`);
  }, 300);
});
```

---

## Backend Performance

### Algorithm and Data Structure Optimization
- **Choose the Right Data Structure:** Arrays for sequential access, hash maps for fast lookups, trees for hierarchical data.
- **Avoid O(n²) or Worse:** Profile nested loops and recursive calls.
- **Batch Processing:** Process data in batches to reduce overhead.
- **Streaming:** Use streaming APIs for large data sets to avoid loading everything into memory.

### Concurrency and Parallelism
- **Asynchronous I/O:** Use async/await or event loops to avoid blocking threads.
- **Thread/Worker Pools:** Use pools to manage concurrency and avoid resource exhaustion.
- **Avoid Race Conditions:** Use locks, semaphores, or atomic operations where needed.
- **Bulk Operations:** Batch network/database calls to reduce round trips.

### Caching
- **Cache Expensive Computations:** Use in-memory caches (Redis, Memcached) for hot data.
- **Cache Invalidation:** Use time-based (TTL), event-based, or manual invalidation.
- **Don't Cache Everything:** Some data is too volatile or sensitive to cache.

### API and Network
- **Minimize Payloads:** Compress responses (gzip, Brotli) and avoid sending unnecessary data.
- **Pagination:** Always paginate large result sets.
- **Rate Limiting:** Protect APIs from abuse and overload.
- **Connection Pooling:** Reuse connections for databases and external services.

### C++ Specific
- **Prefer stack allocation over heap** for small, short-lived objects.
- **Avoid unnecessary copies:** use `const&` parameters and `std::move` where appropriate.
- **Use `reserve()` on vectors** when the size is known in advance.
- **Prefer `std::string_view`** over `const std::string&` for read-only string parameters (C++17+).
- **Profile with `perf`, `gprof`, or `valgrind --tool=callgrind`** before optimizing C++ hot paths.
- **Avoid `std::endl`** — prefer `'\n'`; `endl` flushes the stream unnecessarily.
- **Move semantics:** use `std::move` when transferring ownership of large resources.

---

## Code Review Checklist for Performance

- [ ] Are there any obvious algorithmic inefficiencies (O(n²) or worse)?
- [ ] Are data structures appropriate for their use?
- [ ] Are there unnecessary computations or repeated work?
- [ ] Is caching used where appropriate, and is invalidation handled correctly?
- [ ] Are large payloads paginated, streamed, or chunked?
- [ ] Are there any memory leaks or unbounded resource usage?
- [ ] Are network requests minimized, batched, and retried on failure?
- [ ] Are assets optimized, compressed, and served efficiently?
- [ ] Are there any blocking operations in hot paths?
- [ ] Is logging in hot paths minimized and structured?
- [ ] Are performance-critical code paths documented and tested?

---

## Memory Management

- **Resource Cleanup:** Always release resources (files, sockets, DB connections) promptly.
- **Object Pooling:** Use for frequently created/destroyed objects.
- **Heap Monitoring:** Monitor heap usage and garbage collection.
- **Memory Leaks:** Use leak detection tools (Valgrind, LeakCanary, Chrome DevTools).

---

## Common Pitfalls

- Synchronous/blocking I/O in web servers.
- Not using connection pooling for databases.
- Over-caching or caching sensitive/volatile data.
- Ignoring error handling in async code.
- Not monitoring or alerting on performance regressions.
- Loading large JS bundles on initial page load.
- Failing to clean up event listeners, causing memory leaks.
