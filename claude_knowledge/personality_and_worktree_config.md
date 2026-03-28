# Personality System & Worktree Configuration

## Personality System

Buildor injects a configurable "personality" into every new Claude session via `--append-system-prompt`. This controls Claude's communication style without the user seeing it in chat.

### How it works

1. **Built-in personalities** defined in `src/personalities/personalities.ts` — 6 shipped: Default, Mentor, Senior Engineer, Pair Programmer, Architect, Move Fast
2. **Custom personalities** stored in Zustand (persisted to localStorage as `buildor-personality`) — users create/edit/delete via Settings > Personality
3. **Selection** stored in `usePersonalityStore.selectedId` — default is `'default'`
4. **Injection**: both `ClaudeChat.tsx` and `ClaudeChatWindow.tsx` read the store at session start, resolve the prompt via `getPersonalityById()`, and pass it as the `systemPrompt` parameter to `startClaudeSession()`
5. **Rust side**: `start_session` in `claude.rs` receives `system_prompt: Option<String>` and appends `--append-system-prompt <prompt>` to the Claude CLI args

### Key decisions

- Personalities are **global**, not per-project — simplicity over flexibility
- Built-in personalities are **not editable** — custom ones exist for that
- Prompt max length: 2000 chars (enforced in UI form)
- Custom personality IDs are slugified with `custom-` prefix to avoid collisions with built-ins

---

## Worktree Dependency Configuration

Buildor can automatically set up `node_modules` when creating worktrees for Node.js projects.

### Strategies (Settings > Worktrees)

| Strategy | What happens | Trade-off |
|----------|-------------|-----------|
| `none` | Nothing (default) | Manual setup required |
| `symlink` | Junction/symlink from worktree `node_modules` → main repo `node_modules` | Fast, zero disk; breaks if branches have different deps |
| `pnpm` | Runs `pnpm install --frozen-lockfile` (retries without flag) | Needs pnpm installed; uses shared global store |
| `npm` | Runs `npm install` | Universal but slow, duplicates packages |

### How it works

1. **Detection**: `setup_worktree_deps` in `worktree.rs` checks if `package.json` exists in the new worktree — skips entirely if not found
2. **Trigger**: `StartSessionModal.tsx` calls `setupWorktreeDeps()` after `createSession()` succeeds, reading strategy from `useWorktreeConfigStore`
3. **Non-blocking**: dep setup failure logs a warning but doesn't fail session creation
4. **Platform handling**: symlink uses `mklink /J` on Windows, `std::os::unix::fs::symlink` on Unix

### Extensibility

The settings section is designed for future post-creation steps (Python venv, custom commands). The Rust command pattern — detect project type, apply strategy — scales to other ecosystems.
