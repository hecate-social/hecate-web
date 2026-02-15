# Hecate Web — Backlog

## Security

- [ ] **Evaluate switching from custom protocol to Tauri invoke** — Currently all daemon API calls go through a `hecate://` custom protocol handler that proxies any path to the Unix socket. Tauri's `invoke`-based approach would explicitly whitelist each callable Rust command, reducing the attack surface if the webview were ever compromised (XSS). Low urgency — the app loads only local static content and the daemon is protected by Unix socket file permissions. See: https://v2.tauri.app/security/
