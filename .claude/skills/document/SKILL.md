---
description: Update the project knowledge base after writing code or discovering anything worth persisting. Run after completing any meaningful work — captures decisions, gotchas, patterns, and architecture changes to claude_knowledge/ files.
---

# /document — Knowledge Persistence Skill

You have just completed work or discovered something worth saving. Your job is to update the project's knowledge base in `claude_knowledge/`.

## When to Run

Run this skill after:
- Writing or modifying code
- Discovering a gotcha, bug, or surprising behavior
- Establishing a new pattern or convention
- Making an architecture or design decision
- Encountering an OS/tooling-specific issue
- Any finding that would help a future session

## Process

### Step 1: Read the knowledge index

Read `claude_knowledge/mind-map.json` to see all existing knowledge files and their purposes.

### Step 2: Identify what to persist

Review what you just did or learned. Categorize each finding:

| Category | Destination File | When |
|----------|-----------------|------|
| **Structure** | `codebase_structure.md` | New modules, changed layout, file conventions |
| **Stack** | `tech_stack.md` | New dependency, version change, library swap |
| **Architecture** | `architecture.md` | Data flow change, new component relationship, design pattern |
| **Decision** | `decisions.md` | Why X over Y, tradeoff made, alternative rejected |
| **Gotcha** | `gotchas.md` | Something surprising, a bug, a non-obvious pitfall |
| **Pattern** | `patterns.md` | Reusable approach, convention established, template |
| **Local** | `local_learnings.md` | OS-specific, tooling, environment issue |

### Step 3: Update existing files or create new ones

- **Prefer updating existing files** over creating new ones
- If a finding fits an existing file, add it there using the file's template format
- If a finding doesn't fit any existing file, create a new `.md` file in `claude_knowledge/` and add it to `mind-map.json`
- **Keep entries concise** — distill to the essential insight, not a transcript
- **Redact noise** — remove redundant entries, merge overlapping ones, tighten verbose descriptions

### Step 4: Update the mind-map

If you created a new file, add its entry to `claude_knowledge/mind-map.json` with:
- `file`: filename
- `description`: one-line purpose
- `keywords`: array of search terms for matching

If you significantly changed an existing file's scope, update its description and keywords in the mind-map.

### Step 5: Keep it tight

After writing, re-read what you added. Ask:
- Is this worth a future session reading? If not, delete it.
- Can this be said in fewer words? If yes, tighten it.
- Does this duplicate an existing entry? If yes, merge or remove.
- Is this a fact about the code that could be derived by reading the code? If yes, delete it — only persist non-obvious insights.

## Rules

- Do NOT add filler ("nothing to report", "no changes needed")
- Do NOT duplicate what's in git history or the code itself
- Do NOT write long narratives — bullet points and templates preferred
- DO update `mind-map.json` when files are added or significantly changed
- DO remove stale entries when you notice them
