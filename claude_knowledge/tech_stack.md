# Tech Stack

## Core Framework

| Technology | Version | Purpose |
|-----------|---------|---------|
| Tauri | v2.x | Desktop app framework — Rust backend + native webview |
| React | 18.x+ | Frontend UI framework |
| TypeScript | 5.x+ | Frontend language |
| Rust | stable | Backend language (Tauri core) |

## Frontend Libraries

| Library | Purpose | Notes |
|---------|---------|-------|
| React Flow | Visual flow builder (drag-and-drop node editor) | Core feature — flow/stage designer |
| Monaco Editor | Code viewer (read-only) + diff viewer | Same engine as VS Code |
| xterm.js | Terminal emulator for embedded Claude Code sessions | Paired with PTY backend in Rust |
| Shiki | Syntax highlighting (alternative/supplement to Monaco) | Lighter weight for simple code display |

## Backend (Rust) Dependencies

| Crate | Purpose | Notes |
|-------|---------|-------|
| tauri | App framework, window management, IPC | Multi-window support is first-class |
| serde / serde_json | Serialization for config, flows, IPC | Standard Rust serialization |
| tokio | Async runtime for subprocess management | Git CLI, Claude Code process spawning |
| portable-pty (or similar) | PTY for embedded terminal | Powers xterm.js backend |
| parking_lot 0.12 | Non-poisoning Mutex/RwLock | Used by operation pool — faster uncontended, no unwrap after panics |
| priority-queue 2 | Priority queue with `change_priority()` | Per-tier scheduling in operation pool lanes |
| num_cpus 1 | Physical CPU count detection | Operation pool defaults (pool_size_start = num_cpus/2) |

## Claude Integration

| Component | Approach | Auth |
|-----------|----------|------|
| Interactive chat | Embedded terminal (xterm.js + PTY running `claude` CLI) | Subscription via `claude login` |
| Programmatic orchestration | Claude Code SDK (`@anthropic-ai/claude-code`) or CLI subprocess | TBD — verify SDK supports subscription auth |
| Skill routing | Haiku subagent via Claude Code (not direct API) | Subscription (runs through Claude Code) |

## Build & Distribution

| Platform | Installer Format |
|----------|-----------------|
| Windows | `.msi` |
| macOS | `.dmg` |
| Linux | `.AppImage` / `.deb` |

Built via Tauri's bundler (`tauri build`), which produces OS-native installers.

## Version Pinning Notes

- Tauri v2 is required (v1 has limited multi-window support)
- React Flow v11+ for current API
- Monaco and xterm.js versions should track stable releases
- Rust edition 2021+
