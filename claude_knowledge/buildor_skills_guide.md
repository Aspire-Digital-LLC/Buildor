# Buildor Skills — Authoring Guide

## What Is a Buildor Skill?

A Buildor skill is a portable, reusable prompt template with structured metadata. Skills live in `~/.buildor/skills/` (or a shared org repo that syncs there) and are available across all projects opened in Buildor. They never touch the project repository.

Each skill is a **directory** containing two required files:

```
my-skill/
├── skill.json          # Metadata, params, execution config
├── prompt.md           # The prompt template
├── reference.md        # Optional: detailed docs Claude reads on demand
├── examples.md         # Optional: usage examples
└── scripts/
    └── helper.sh       # Optional: executable utilities
```

## skill.json — Schema Reference

```json
{
  "name": "skill-name",
  "description": "One-line description of what this skill does and when to use it",
  "tags": ["category1", "category2"],

  "params": [
    {
      "name": "param-name",
      "type": "text | number | boolean | select",
      "required": true,
      "description": "Shown in the params modal as a label",
      "placeholder": "Hint text in the input field",
      "default": "optional default value",
      "options": ["only", "for", "select", "type"]
    }
  ],

  "execution": {
    "allowedTools": ["Read", "Grep", "Glob"],
    "context": "fork",
    "agent": "Explore",
    "model": "opus",
    "effort": "high",
    "returnMode": "summary | file | both",
    "outputPath": "output-{{name}}.md",
    "health": {
      "idleSeconds": 30,
      "stallSeconds": 30,
      "loopDetectionWindow": 5,
      "loopThreshold": 3,
      "errorThreshold": 3,
      "distressSeconds": 45
    }
  },

  "visibility": {
    "paths": ["src/**/*.ts", "**/*.rs"],
    "autoLoad": true
  },

  "shell": "bash"
}
```

### Field Reference

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | Yes | — | Lowercase + hyphens only. Max 64 chars. Matches the directory name. |
| `description` | Yes | skill name | What the skill does. Shown in palette and used for eyeball (activate) mode. Max 250 chars recommended. |
| `tags` | No | `[]` | Categories for search/filtering in the palette. |
| `params` | No | `[]` | Array of parameters that generate a modal form when invoked via Action mode. |
| `execution.allowedTools` | No | `[]` | Tools auto-accepted without permission prompts during this skill's execution. |
| `execution.context` | No | — | Set to `"fork"` to run as a separate agent instead of injecting into the current session. |
| `execution.agent` | No | `"general-purpose"` | Agent type when `context: "fork"`. Options: `"Explore"`, `"Plan"`, `"general-purpose"`. |
| `execution.model` | No | current session model | Model override for this skill's execution. |
| `execution.effort` | No | `"medium"` | Effort level: `"low"`, `"medium"`, `"high"`, `"max"`. |
| `execution.returnMode` | No | `"summary"` | How the agent returns results: `"summary"` (inject text into caller), `"file"` (write to disk, caller gets path only), `"both"`. |
| `execution.outputPath` | No | `"{{name}}.md"` | File path for `file`/`both` return modes. Supports `{{name}}` and `{{timestamp}}`. |
| `execution.health` | No | global defaults | Per-skill health monitoring thresholds. |
| `visibility.paths` | No | `[]` | Glob patterns — skill only appears in palette when working with matching files. Empty = always visible. |
| `visibility.autoLoad` | No | `true` | If true, Claude can auto-discover this skill via its description (eyeball mode). |
| `shell` | No | `"bash"` | Shell for `!`command`` blocks. `"bash"` works cross-platform. |

### Param Types

| Type | Renders As | Value Type | Notes |
|---|---|---|---|
| `text` | Text input | `string` | Use `placeholder` for hint text |
| `number` | Number input | `number` | |
| `boolean` | Checkbox | `boolean` | `default` should be `true` or `false` |
| `select` | Dropdown | `string` | Must include `options` array |

## prompt.md — Template Syntax

The prompt body uses `{{param-name}}` placeholders that are substituted with values from the params modal before injection.

### Placeholders

- `{{param-name}}` — replaced with the param value from the modal
- `${CLAUDE_SKILL_DIR}` — replaced with the absolute path to this skill's directory

### Inline Shell Commands

Use `` !`command` `` to run a shell command before the prompt is sent to Claude. The command output replaces the block:

```markdown
Current branch: !`git branch --show-current`
Recent commits: !`git log --oneline -5`
```

### Supporting File References

Link to files in the skill directory. Claude reads them on demand:

```markdown
For methodology details, see [reference.md](reference.md)
For examples, see [examples.md](examples.md)
```

## Interaction Modes

### Action (Run) — Play button in palette

Directly executes the skill:
1. If the skill has params, a modal form appears
2. User fills in values, clicks Confirm
3. Buildor pre-processes the prompt (substitution, shell commands, variable resolution)
4. If `context: "fork"` — spawns as a managed agent
5. Otherwise — injects the processed text into the active chat session

### Eyeball (Activate) — Eye icon in palette

Makes the session aware of the skill without running it:
1. Only the `description` enters the session context
2. Claude sees the skill is available and loads the full content on demand
3. Activating triggers a silent session restart (invisible to user)
4. Multiple skills can be active simultaneously
5. Toggle off to deactivate

## Examples

### Simple Skill — Code Review

```
code-review/
├── skill.json
└── prompt.md
```

**skill.json:**
````json
{
  "name": "code-review",
  "description": "Reviews code changes for bugs, security issues, and style violations",
  "tags": ["review", "quality"],
  "params": [
    {
      "name": "scope",
      "type": "select",
      "required": false,
      "options": ["staged", "unstaged", "branch"],
      "default": "staged",
      "description": "What changes to review"
    },
    {
      "name": "focus",
      "type": "text",
      "required": false,
      "placeholder": "e.g., security, performance, naming",
      "description": "Optional focus area"
    }
  ],
  "execution": {
    "allowedTools": ["Read", "Grep", "Glob"]
  }
}
````

**prompt.md:**
````markdown
# Code Review

## Changes to review
!`git diff {{scope}}`

## Instructions

Review the above code changes. Focus on:
- Bugs and logic errors
- Security vulnerabilities
- Performance concerns
- Code style and readability
{{#if focus}}- Special focus: {{focus}}{{/if}}

Provide feedback as a numbered list. For each issue:
1. File and line number
2. Severity (critical / warning / suggestion)
3. What's wrong and how to fix it
````

### Agent Skill — Research with File Output

```
research-topic/
├── skill.json
├── prompt.md
└── reference.md
```

**skill.json:**
````json
{
  "name": "research-topic",
  "description": "Deep research on a topic, writes findings to a markdown file for downstream consumption",
  "tags": ["research", "pipeline"],
  "params": [
    {
      "name": "topic",
      "type": "text",
      "required": true,
      "description": "What to research",
      "placeholder": "e.g., API rate limiting strategies"
    },
    {
      "name": "depth",
      "type": "select",
      "required": false,
      "options": ["quick", "thorough", "exhaustive"],
      "default": "thorough",
      "description": "How deep to go"
    }
  ],
  "execution": {
    "context": "fork",
    "agent": "Explore",
    "model": "opus",
    "effort": "high",
    "returnMode": "file",
    "outputPath": "research-{{topic}}.md",
    "allowedTools": ["Read", "Grep", "Glob", "WebSearch", "WebFetch"],
    "health": {
      "stallSeconds": 60,
      "distressSeconds": 120
    }
  }
}
````

**prompt.md:**
````markdown
# Research: {{topic}}

Depth: {{depth}}

## Instructions

Research the topic above. Your goal is to produce a comprehensive markdown document.

For methodology guidelines, see [reference.md](reference.md).

## Output Format

Write your findings to the output file as structured markdown:
- Summary (2-3 sentences)
- Key findings (bulleted)
- Detailed analysis (sections with headers)
- Sources (if applicable)
- Recommendations

Current project context:
- Repo: !`basename $(git rev-parse --show-toplevel)`
- Language: !`ls src/ | head -5`
````

**reference.md:**
````markdown
# Research Methodology

## Quick depth
- Search codebase for relevant patterns
- Read 3-5 key files
- Summarize findings

## Thorough depth
- Full codebase search
- Read all related files
- Cross-reference patterns
- Check documentation

## Exhaustive depth
- Everything in thorough
- Web search for external context
- Compare with industry standards
- Produce recommendations with trade-off analysis
````

### Minimal Skill — Quick Lint

The smallest valid skill — just a name, description, and prompt:

**skill.json:**
````json
{
  "name": "quick-lint",
  "description": "Runs a quick lint check on the current file or directory"
}
````

**prompt.md:**
````markdown
Run a lint check on the current working directory. Report any issues found, grouped by severity.

!`ls src/`
````

All other fields use defaults: no params (no modal), no fork (injects into session), current model, medium effort, bash shell, always visible.
