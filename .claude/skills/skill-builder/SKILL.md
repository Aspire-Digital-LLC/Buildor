---
name: skill-builder
description: Build a new Claude Code skill from a user request. Generates the SKILL.md with correct YAML frontmatter, folder structure, and prompt body. Use whenever the user asks to create, scaffold, or author a skill.
allowed-tools: Read Write Bash Glob Grep
argument-hint: [skill-name] [description]
context: fork
agent: general-purpose
---

# /skill-builder — Create a Claude Code Skill

The user wants to create a new skill. Your job is to scaffold the skill directory and write a correct SKILL.md file.

## Step 1: Gather Requirements

Ask the user (if not already clear from context):
1. **Name** — lowercase + hyphens only, max 64 chars
2. **Description** — what it does and when to use it (max 1024 chars, front-load the key use case)
3. **Location** — `.claude/skills/` (project-scoped) or `~/.buildor/skills/` (global/shared)
4. **Parameters** — does it need arguments? What are they?
5. **Execution mode** — inline (inject into current session) or `context: fork` (isolated subagent)?
6. **Tool permissions** — which tools should be auto-approved?

If the user already provided enough context, skip straight to building.

## Step 2: Create the Directory

```
{location}/{skill-name}/
├── SKILL.md                  # Required
├── scripts/                  # Optional: executable code
├── references/               # Optional: detailed docs Claude reads on demand
├── assets/                   # Optional: templates, resources
└── examples/                 # Optional: working code samples
```

Only create subdirectories that the skill actually needs. Don't scaffold empty folders.

## Step 3: Write the SKILL.md

The file has two parts: YAML frontmatter and markdown body.

### YAML Frontmatter — Field Reference

All fields are optional except `description` (effectively required for discovery).

```yaml
---
name: skill-name                    # Max 64 chars, lowercase + hyphens only. Defaults to directory name.
description: >-                     # Max 1024 chars. What it does + when to use it. >250 chars truncated in listings.
  One-line description here
license: MIT                        # License name or reference
compatibility: requires Node 18+    # Max 500 chars. Environment/product requirements.
metadata:                           # Arbitrary key-value data
  author: name
  version: "1.0"
allowed-tools: Read Grep Bash(git:*) # Tools pre-approved when skill is active. String or list.
argument-hint: "[issue-number]"     # Autocomplete hint shown in slash menu
disable-model-invocation: false     # true = Claude cannot auto-load, manual only
user-invocable: true                # false = hidden from / menu, Claude still auto-invokes
model: sonnet                       # Model override when skill is active
effort: high                        # low, medium, high, max
context: fork                       # fork = run in isolated subagent
agent: Explore                      # Subagent type with context: fork. Options: Explore, Plan, general-purpose, or custom name
paths: "src/**/*.ts"                # Glob patterns limiting when skill auto-activates. String or list.
shell: bash                         # bash (default) or powershell
hooks:                              # Hooks scoped to this skill's lifecycle
  key: value
---
```

**Only include fields that the skill actually needs.** A minimal skill has just `description`. Don't add fields with default values unless overriding them.

### Dynamic String Substitutions

Available in the markdown body:

| Variable | Description |
|---|---|
| `$ARGUMENTS` | All arguments passed to the skill |
| `$ARGUMENTS[N]` / `$N` | Specific argument by 0-based index |
| `${CLAUDE_SESSION_ID}` | Current session ID |
| `${CLAUDE_SKILL_DIR}` | Directory containing this SKILL.md |

### Inline Shell Commands

Use the syntax EXCLAMATION BACKTICK command BACKTICK to run a shell command before Claude sees the prompt. The command output replaces the placeholder. The format is: !followed by the command wrapped in backticks.

Example in a skill prompt body:
- To inject the current branch: use !followed by `git branch --show-current` in backticks
- To inject recent commits: use !followed by `git log --oneline -5` in backticks

### Invocation Control

| Setting | User Can Invoke | Claude Can Invoke |
|---|---|---|
| (default) | Yes | Yes |
| `disable-model-invocation: true` | Yes | No |
| `user-invocable: false` | No | Yes |

### Markdown Body

Write clear, actionable instructions. Structure with:
- **When to use** — trigger conditions
- **Process** — numbered steps Claude follows
- **Rules** — constraints and guardrails
- **Output format** — what the result should look like (if applicable)

## Step 4: Validate

Before finishing, verify:
- [ ] Name is lowercase + hyphens only, max 64 chars
- [ ] Description is under 1024 chars, front-loads the use case
- [ ] SKILL.md is under 500 lines (move detail to `references/` if needed)
- [ ] Only necessary frontmatter fields are included
- [ ] File references use relative paths from SKILL.md
- [ ] If `context: fork` — the skill body is self-contained (no access to main conversation history)
- [ ] No empty scaffold directories

## Rules

- Keep SKILL.md under 500 lines. If the prompt needs extensive reference material, put it in `references/` and link with relative paths.
- Don't add frontmatter fields that use default values — only include what you're overriding.
- Don't create `scripts/`, `references/`, `assets/`, or `examples/` directories unless the skill needs them.
- If the skill needs shell scripts, put them in `scripts/` and reference from the prompt body.
- Test that any inline shell command blocks work on the target platform.
