# hecate-web

Thin Tauri v2 desktop wrapper for Hecate Daemon. Native desktop app — no URL bar, no browser chrome. All UI is served by the daemon over Unix socket; Tauri provides native OS integration (window controls, file picker, notifications, system tray, auto-updates).

## Architecture

```
Tauri Shell (native window, WebKitGTK/WKWebView)
  └── hecate://localhost → Rust proxy → Unix socket → hecate-daemon (Cowboy)
       └── Daemon serves SvelteKit SPA + API + plugin UIs
```

**Key decisions:**
- Daemon serves ALL web assets (SvelteKit SPA built into `priv/static/`)
- `hecate://` custom protocol proxies everything through the Rust backend to the Unix socket
- No TCP listener on daemon — Unix socket only, for security
- SSE streaming for LLM chat and plugin events via custom protocol
- Tauri acts as capability broker — native OS features gated by per-plugin permissions
- Graceful fallback page when daemon is unreachable

## Development

```bash
# Install dependencies
npm install

# Start daemon dev server (from hecate-daemon/ui/)
cd ../hecate-daemon/ui && npm run dev

# Start Tauri dev mode (uses devUrl: http://localhost:1420)
npm run tauri:dev

# Build for production
npm run tauri:build
```

## Requirements

- Rust 1.70+
- Node.js 20+ (for Tauri CLI only)
- System webview (webkit2gtk on Linux)
- Hecate daemon running with Unix socket at `~/.hecate/hecate-daemon/sockets/api.sock`

## Project Structure

```
src-tauri/                Rust backend (the entire app)
  src/
    main.rs               Entry point
    lib.rs                Tauri setup + hecate:// protocol + invoke handlers
    socket_proxy.rs       Unix socket HTTP proxy (request → daemon)
    daemon_watcher.rs     Health heartbeat loop (5s interval)
    daemon_streaming.rs   SSE event bridge (daemon → Tauri events)
    plugin_watcher.rs     Filesystem watcher for plugin sockets
    plugin_streaming.rs   Plugin SSE streaming
    config_watcher.rs     Config file change detection
    traffic.rs            Atomic TX/RX traffic counters
    webview_opener.rs     Secondary webview management
    app_updater.rs        Tauri app auto-update
    plugin_updater.rs     Plugin OCI image updates
  fallback/
    index.html            Shown when daemon is unreachable
  icons/                  App icons for all platforms
```
