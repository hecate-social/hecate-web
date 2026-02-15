# hecate-web

Site-specific desktop browser for Hecate Daemon. Native desktop app (Tauri v2) with SvelteKit frontend — no URL bar, no browser chrome. Connects to the daemon over the same Unix socket as the TUI (`/run/hecate/daemon.sock`).

## Architecture

```
Tauri Shell (native window)
  └── SvelteKit App (static HTML/JS/CSS)
       └── hecate:// custom protocol
            └── Rust proxy → Unix socket → hecate-daemon (Cowboy)
```

**Key decisions:**
- Daemon serves zero web assets — Tauri bundles everything
- `hecate://` custom protocol proxies all API calls through the Rust backend
- SSE streaming for LLM chat uses Tauri's event system (not custom protocol)
- Micro-frontend studio architecture — built-in studios ship with the app

## Studios

| Studio | Status | Description |
|--------|--------|-------------|
| LLM    | v1     | Chat with AI models, streaming responses |
| Node   | v1     | Dashboard, identity, health, models, providers |
| DevOps | planned | Ventures, divisions, deployments |
| Social | planned | Chat rooms, community |
| Arcade | planned | Games and entertainment |

## Development

```bash
# Install dependencies
npm install

# Start dev mode (SvelteKit hot reload + Tauri native window)
cargo tauri dev

# Type check
npm run check

# Build for production
cargo tauri build
```

## Requirements

- Rust 1.70+
- Node.js 20+
- System webview (webkit2gtk on Linux)
- Hecate daemon running at `/run/hecate/daemon.sock`

## Project Structure

```
src/                    SvelteKit frontend
  routes/               Page routes (one per studio)
  lib/
    api.ts              Daemon API client (hecate:// fetch)
    context.ts          StudioContext implementation
    types.ts            TypeScript types (matches daemon API)
    stores/             Svelte stores (reactive state)
    components/         Shell UI components
    mesh/               Mesh studio loader (v2)
src-tauri/              Rust backend
  src/
    main.rs             Entry point
    lib.rs              Tauri setup + custom protocol + commands
    socket_proxy.rs     Unix socket HTTP proxy
    streaming.rs        SSE streaming via Tauri events
```
