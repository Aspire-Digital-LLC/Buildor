# Buildor Event System

## Overview

Buildor uses an internal event bus (`src/utils/buildorEvents.ts`) to decouple AI responses and app operations from UI behaviors. Any component can subscribe to events and react accordingly.

## How to Use

```typescript
import { buildorEvents } from '@/utils/buildorEvents';

// Subscribe
buildorEvents.on('permission-required', (event) => {
  // event.data contains the permission details
  // event.sessionId links to the worktree session
});

// Emit
buildorEvents.emit('tool-executing', { toolName: 'Edit', toolUseId: '...' }, sessionId);

// One-time listener
const event = await buildorEvents.once('permission-resolved');
```

## Event Types

| Event | When Emitted | Data Shape | Use Case |
|-------|-------------|------------|----------|
| `permission-required` | Claude needs user approval for a tool | `{ toolUseId, toolName, input, description }` | Show approval card, blink window |
| `permission-resolved` | User approved/denied a permission | `{ toolUseId, toolName, approved }` | Update approval card state |
| `user-attention-needed` | Generic: window should alert user | `{ reason, toolName?, description? }` | Blink taskbar, show notification |
| `session-started` | Claude session initialized | `{ model, tools, skills }` | Update UI badges |
| `session-ended` | Claude session terminated | `{}` | Clean up, update status |
| `message-received` | New text message from Claude | `{ text }` | Update chat, notifications |
| `tool-executing` | Claude is running a tool | `{ toolName, toolUseId, input }` | Show progress indicator |
| `tool-completed` | Tool execution finished | `{ toolUseId, isError }` | Update tool card status |
| `error-occurred` | An error happened | `{ message }` | Error banner, logging |
| `cost-updated` | Running cost changed | `{ costUsd, durationMs, turns }` | Cost display in header |
| `turn-completed` | Claude finished responding | `{ costUsd, durationMs, turns }` | Reset thinking state, re-enable input |
| `branch-switched` | User switched a checked-out branch | `{ projectName, branch }` | Refresh change counts, update dropdowns |

## Adding New Events

When building a new feature that produces significant state changes:

1. Add the event type to `BuildorEventType` in `src/utils/buildorEvents.ts`
2. Define the data interface if complex
3. Emit the event at the appropriate point in your code
4. Document it in this table
5. Subscribe in any UI component that needs to react

## Rules

- Events are fire-and-forget — emitters don't wait for handlers
- Handler errors are silently caught — one bad handler can't break others
- Always include `sessionId` when the event relates to a specific worktree session
- Use `user-attention-needed` for anything that requires the user to look at the app (permission requests, errors, completions)
- Don't emit events for routine operations (status polling, etc.) — only for state changes worth reacting to

## Future Events (add as features are built)

- `flow-stage-started` / `flow-stage-completed` — flow execution progress
- `worktree-created` / `worktree-closed` — session lifecycle
- `file-changed` — external file change detected
- `build-started` / `build-completed` — CI/CD integration
- `skill-invoked` — command palette skill execution
