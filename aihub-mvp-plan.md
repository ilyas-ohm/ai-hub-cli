# MAI (My AI) - Realistic MVP Plan

## What This Actually Is

A terminal tool that lets you talk to multiple AI CLIs (Claude Code, Gemini CLI) from one interface with tabs, @mention routing, and shared project context.

That's it. No pipe workflows, no grid views, no 7 providers, no role-based agent systems. Get the core working first.

---

## Core Bet (Validate First)

The entire project depends on one thing: **can we reliably spawn interactive AI CLIs as child processes, send them input, and stream their output?**

If this doesn't work, nothing else matters. So we prove it before writing anything else.

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Runtime | Node.js + TypeScript | Ecosystem, npm distribution |
| CLI Framework | Commander | Standard, lightweight |
| TUI | Ink (React for CLIs) | Best option for terminal UIs in Node |
| Process Mgmt | execa | Simpler than node-pty, works cross-platform |
| State | Zustand | Minimal, no boilerplate |
| Config | cosmiconfig | Standard config loading |
| Prompts | @clack/prompts | Better DX than inquirer |
| Styling | chalk | Terminal colors |
| Spinners | ora | Installation feedback |

**Why execa instead of node-pty:**
- node-pty requires native C++ compilation (node-gyp, Python, VS Build Tools on Windows)
- Breaks constantly across Node versions and platforms
- execa handles 90% of our needs with zero native deps
- We can migrate to node-pty later IF we prove we need raw PTY control

---

## Supported Providers (v1.0)

Only two. Get them working perfectly before adding more.

| CLI | Install Command | Why These Two |
|-----|----------------|---------------|
| Claude Code | `npm i -g @anthropic-ai/claude-code` | Best coding agent, most popular |
| Gemini CLI | `npm i -g @google/gemini-cli` | Free, fast, good second opinion |

v1.1 candidates: Aider, OpenCode. Everything else is a stretch.

---

## Project Structure

```
ai-hub-cli/
├── package.json
├── tsconfig.json
├── .gitignore
├── bin/
│   └── mai.ts                    # CLI entry point
├── src/
│   ├── app/
│   │   ├── App.tsx               # Root Ink component
│   │   ├── TabBar.tsx            # Tab navigation
│   │   ├── AgentView.tsx         # Single agent terminal view
│   │   └── InputBar.tsx          # Command input with @mention
│   ├── services/
│   │   ├── process-manager.ts    # Spawn and manage CLI processes
│   │   ├── router.ts             # Parse @mentions, route commands
│   │   ├── config.ts             # Load/save config
│   │   ├── installer.ts          # Install CLI tools
│   │   └── auth.ts               # API key management
│   ├── store/
│   │   ├── tabs.ts               # Tab state
│   │   └── agents.ts             # Agent process state
│   ├── types/
│   │   └── index.ts              # All type definitions (one file)
│   └── utils/
│       └── platform.ts           # OS detection helpers
└── tests/
    ├── router.test.ts
    └── process-manager.test.ts
```

~20 files. Not 70.

---

## Phase 0: Proof of Concept (Day 1)

**Goal:** Can we spawn Claude Code and Gemini CLI, send input, and read output?

### Build a throwaway script that:
1. Spawns `claude` as a child process with execa
2. Writes a prompt to its stdin
3. Streams stdout back to the terminal
4. Detects when the agent is idle (waiting for input)
5. Repeat with `gemini`

### Success criteria:
- [ ] Both CLIs launch without crashing
- [ ] Input reaches the CLI
- [ ] Output streams back in real-time
- [ ] We can detect "idle" state (agent waiting for next prompt)
- [ ] Process cleans up on exit (no zombies)

### Failure plan:
If execa can't handle interactive mode for these CLIs, try:
1. `node-pty` (accept the native compilation pain)
2. SDK/API mode instead of wrapping the CLI (Claude has an SDK, Gemini has an API)
3. Pivot to a non-interactive model: run commands, collect output, display results

---

## Phase 1: Minimal Working Product (Days 2-5)

**Goal:** A TUI where you can open tabs, each running an AI CLI, and switch between them.

### 1.1 Project Setup
- `npm init`, TypeScript config, build scripts
- Install deps: ink, react, execa, zustand, commander, chalk
- CLI entry point: `mai` command launches the TUI

### 1.2 Process Manager (`process-manager.ts`)
- `spawn(provider)` — start a CLI process
- `send(id, input)` — write to process stdin
- `onOutput(id, callback)` — stream stdout chunks
- `kill(id)` — clean shutdown
- `killAll()` — cleanup on exit
- Track process state: `starting | idle | busy | error | dead`

### 1.3 Zustand Stores
- `tabs.ts` — tab list, active tab, create/close/switch
- `agents.ts` — agent processes, status, output buffers

### 1.4 Ink UI
- `App.tsx` — layout: TabBar on top, AgentView in middle, InputBar on bottom
- `TabBar.tsx` — horizontal tab list, active tab highlight, status dot (green/yellow/red)
- `AgentView.tsx` — scrollable output from the active agent's process
- `InputBar.tsx` — text input, submit sends to active agent

### 1.5 Basic Keybindings
- `Ctrl+T` — new tab (pick provider)
- `Ctrl+W` — close tab (kill process)
- `Tab` / `Ctrl+←/→` — switch tabs
- `Enter` — send input to active agent
- `Ctrl+C` — exit (kill all processes)

### Deliverable:
```
$ mai
┌─ claude ─┬─ gemini ─┐
│                      │
│  Agent output here   │
│  streaming live...   │
│                      │
├──────────────────────┤
│ > type here...       │
└──────────────────────┘
```

---

## Phase 2: Routing & Config (Days 6-9)

**Goal:** @mention routing and persistent configuration.

### 2.1 Command Router (`router.ts`)
Parse input and route:
- `hello` → send to active tab's agent
- `@claude fix this` → send to claude tab (create one if needed)
- `@gemini explain this` → send to gemini tab
- `@all what is this?` → send to all agents

That's it. No pipes. No sequential handoff. No "then" syntax. Just @mentions.

### 2.2 Config (`config.ts`)
- Global: `~/.mai/config.json`
- Project: `.mai/config.json` (overrides global)
- Schema:
```json
{
  "defaultProvider": "claude",
  "providers": {
    "claude": {
      "command": "claude",
      "installed": true,
      "apiKey": "sk-ant-..."
    },
    "gemini": {
      "command": "gemini",
      "installed": true
    }
  }
}
```

### 2.3 Installer (`installer.ts`)
- `mai install` — detect OS, check what's installed, install missing CLIs
- `mai install claude` — install specific provider
- Just runs the right npm/pip command with a spinner
- No magic. If it fails, show the error and suggest manual install.

### 2.4 Auth (`auth.ts`)
- `mai auth` — interactive prompt for API keys
- `mai auth claude` — set key for specific provider
- Store in `~/.mai/config.json`
- Validate by running `<cli> --version` or similar

### Deliverable:
- `@claude` and `@gemini` route correctly
- `mai install` works
- Config persists between sessions

---

## Phase 3: Context & Polish (Days 10-14)

**Goal:** Shared context file, split view, and production quality.

### 3.1 Project Memory (`.mai/memory.md`)
One file. Not three.
- Auto-populated with: project name, tech stack (from package.json), active providers
- Users can manually edit it
- Injected into agent prompts on session start (if the CLI supports initial context)
- `mai context add "we use PostgreSQL"` — append to memory file
- `mai context show` — print current context

### 3.2 Split View
- `Ctrl+S` — toggle split view (two agents side by side)
- Only 2-pane split. No grid. No 4-pane compare.
- Handle terminal width: if too narrow, show warning

### 3.3 Error Handling & Cleanup
- Graceful shutdown: SIGINT/SIGTERM handlers kill all child processes
- Agent crash recovery: detect process exit, show error, offer to restart
- Input validation: don't send empty strings, handle special characters
- React error boundaries in Ink components

### 3.4 Output Buffer
- Keep last 1000 lines per agent (circular buffer)
- Scroll up/down with arrow keys or Page Up/Down
- Strip ANSI escape codes for any text processing

### 3.5 CLI Polish
- `mai` — launch TUI
- `mai install` — install providers
- `mai auth` — configure API keys
- `mai status` — show what's installed and configured
- `mai --help` — usage info
- `mai --version` — version

### Deliverable:
Working CLI tool you could actually publish to npm. Two providers, tabs, @mentions, split view, project context.

---

## What We're NOT Building (v1.0)

Explicitly out of scope to keep us honest:

- ~~Grid view~~ — split is enough
- ~~Compare view with diff highlighting~~ — premature
- ~~Pipe workflows (`@claude | @gemini`)~~ — needs reliable completion detection first
- ~~Sequential handoff ("then" syntax)~~ — same problem
- ~~7 provider drivers~~ — 2 is plenty
- ~~Role system (architect, reviewer, etc.)~~ — over-engineering
- ~~handoff.md coordination~~ — agents can't read files they don't know about
- ~~Code block extraction~~ — fragile ANSI parsing
- ~~Plugin system~~ — v2.0 at earliest
- ~~File watchers (Chokidar)~~ — no need yet
- ~~node-pty~~ — unless execa fails in Phase 0
- ~~Sub-agent/model selection~~ — use whatever the CLI defaults to

---

## v1.1 Roadmap (Only After v1.0 Ships)

Earn these features by shipping v1.0 first:

1. **Third provider** — Aider (it's popular and well-maintained)
2. **Pipe routing** — `@claude | @gemini` (requires solving completion detection)
3. **Model selection** — `@claude:haiku` to pick a specific model
4. **Session persistence** — save/restore tab layout and history
5. **Grid view** — 4-pane layout

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| execa can't handle interactive CLI mode | Medium | Critical | Phase 0 validates this. Fallback: node-pty or API mode |
| Ink can't render streaming output smoothly | Low | High | Buffer output, debounce renders at 16ms |
| Can't detect agent idle state | Medium | High | Heuristic: no output for N seconds = idle. Imperfect but workable |
| CLI tools change output format | Medium | Medium | Minimal parsing. Don't depend on exact output format |
| Windows compatibility issues | Medium | Medium | Test on Windows from day 1 (you're already on Windows) |
| npm package name `mai` is taken | High | Low | Use `@mai-cli/mai` or `my-ai` or `aihub` |

---

## Success Criteria

The MVP is done when:

1. `mai install` installs Claude Code and Gemini CLI
2. `mai auth` configures API keys
3. `mai` opens a TUI with tabbed interface
4. You can create tabs, each running a different AI CLI
5. `@claude` and `@gemini` route messages correctly
6. `@all` broadcasts to all open agents
7. Split view works with two agents side by side
8. All processes clean up on exit
9. Config persists between sessions
10. It works on Windows (your machine)

---

## Dependencies

```json
{
  "dependencies": {
    "ink": "^4.4.1",
    "react": "^18.2.0",
    "execa": "^8.0.1",
    "zustand": "^4.4.7",
    "commander": "^12.0.0",
    "@clack/prompts": "^0.7.0",
    "cosmiconfig": "^9.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "@types/react": "^18.2.45",
    "typescript": "^5.3.3",
    "tsx": "^4.7.0",
    "vitest": "^1.0.4"
  }
}
```

9 runtime deps. Not 13. No native compilation required.
