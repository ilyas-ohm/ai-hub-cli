# AI Hub CLI — Optimal MVP Plan
> **Repo:** https://github.com/ilyas-ohm/ai-hub-cli  
> **Package:** `aihub` · **Language:** TypeScript · **Target:** NPM global CLI  
> **MVP Timeline:** 10–14 days (solo dev)

---

## 1. Strategic Synthesis

Both plans tackle the same problem from different angles.

**Plan 1** (AI CLI Hub) defines the *product*: a clean unified installer, a TUI dashboard, provider switching, and a sub-agent model browser. It's user-facing and opinionated about UX.

**Plan 2** (Multi-AI Orchestrator) defines the *engine*: PTY-based subprocess control, a message router, shared-context markdown files, and multi-agent coordination. It's technically rigorous and honest about hard problems.

**The optimal MVP merges both.** Plan 1 sets the UX bar and scope. Plan 2 provides the correct low-level architecture (PTY over API, file-based coordination, per-tool completion heuristics). Building Plan 1's UX on top of Plan 2's engine avoids the most common failure mode: a pretty wrapper that can't actually control the underlying CLIs reliably.

### What the MVP must prove
1. `aihub install` reliably sets up Claude Code + Gemini CLI from scratch
2. `aihub` launches a TUI where you can switch between providers and launch them
3. `aihub chat "..."` sends a prompt to the active provider and streams output back
4. Config and auth persist cleanly across sessions

---

## 2. Scope Boundaries

### ✅ In MVP (v0.1)
- Universal installer for **Claude Code** and **Gemini CLI** only
- Interactive auth setup per provider (`aihub init`)
- `~/.aihub/config.json` config manager
- TUI dashboard: provider list + model list, keyboard navigation
- `aihub use <provider>` — switch active provider
- `aihub chat "<prompt>"` — send prompt to active provider via PTY
- PTY-based subprocess spawning (`node-pty`)
- Per-provider completion detection (basic heuristics)
- NPM publish as `aihub`

### ❌ Post-MVP (v0.2+)
| Feature | Version |
|---|---|
| Codex, OpenCode, Aider, Cursor, Copilot | v0.2 |
| Sub-agent free/premium labels in TUI | v0.2 |
| `aihub chat --all` broadcast mode | v0.3 |
| `handoff.md` / `memory.md` coordination | v0.3 |
| `@mention` multi-agent routing | v0.3 |
| Side-by-side response comparison | v0.3 |
| Plugin system for community providers | v1.0 |
| `aihub update` auto-updater | v1.0 |

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript | Type safety, great DX, matches target audience |
| CLI framework | **Commander.js** | Lightweight, zero-overhead, well-documented |
| Terminal UI | **Ink + React** | React mental model, composable components |
| PTY control | **node-pty** | The only reliable way to drive interactive CLIs |
| Install runner | **execa** | Promise-based, better than `child_process` |
| Auth prompts | **@clack/prompts** | Modern, clean interactive prompt UX |
| Spinners | **ora** | Standard for CLI loading states |
| Styling | **chalk** | Universal terminal color support |
| Config | **Plain JSON** | No abstraction overhead, easy to debug by hand |
| ANSI stripping | **strip-ansi** | Required for parsing PTY output cleanly |

---

## 4. Project Structure

```
ai-hub-cli/
├── src/
│   ├── cli.ts                    ← Commander entry point, registers all commands
│   ├── config/
│   │   └── index.ts              ← Read/write ~/.aihub/config.json
│   ├── installer/
│   │   ├── index.ts              ← Orchestrates detection + install flow
│   │   └── providers/
│   │       ├── claude.ts         ← npm install -g @anthropic/claude-code + auth
│   │       └── gemini.ts         ← npm install -g @google/gemini-cli + auth
│   ├── runner/
│   │   ├── index.ts              ← Spawns correct PTY per active provider
│   │   ├── completion.ts         ← Per-provider "done" detection heuristics
│   │   └── adapters/
│   │       ├── claude.ts         ← Maps aihub args → claude CLI args
│   │       └── gemini.ts         ← Maps aihub args → gemini CLI args
│   └── ui/
│       ├── Dashboard.tsx         ← Root Ink component, manages layout
│       ├── ProviderList.tsx      ← Left pane: provider selector
│       └── ModelList.tsx         ← Right pane: model/agent selector
├── tests/
│   ├── config.test.ts
│   ├── installer.test.ts
│   └── completion.test.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Config Schema

**Location:** `~/.aihub/config.json`

```json
{
  "active": "claude",
  "providers": {
    "claude": {
      "installed": true,
      "apiKey": "sk-ant-...",
      "activeModel": "claude-sonnet-4-5"
    },
    "gemini": {
      "installed": true,
      "apiKey": "AIza...",
      "activeModel": "gemini-2.0-flash"
    }
  }
}
```

---

## 6. CLI Commands (MVP)

```bash
# First-time setup: detect, install, authenticate
aihub init

# Open TUI dashboard
aihub

# Switch active provider (optionally set model)
aihub use claude
aihub use gemini --model flash

# Send a prompt to the active provider
aihub chat "explain this function"

# Manage API keys
aihub auth

# Show installed providers and active model
aihub status
```

---

## 7. TUI Layout

```
┌─────────────────────────────────────────────┐
│  🤖  AI HUB  —  Terminal Interface          │
├─────────────────┬───────────────────────────┤
│  PROVIDERS      │  MODELS                   │
│                 │                           │
│ ● Claude        │  ▸ claude-sonnet-4-5  FREE│
│ ○ Gemini        │    claude-haiku-4-5   FREE│
│                 │    claude-opus-4-5    💎  │
│                 │                           │
│ [Tab] switch    │  [Enter] launch           │
├─────────────────┴───────────────────────────┤
│  Active: claude / claude-sonnet-4-5         │
│  > Type your prompt or /help                │
└─────────────────────────────────────────────┘

Controls:
  ↑ ↓         navigate lists
  Tab         switch pane (providers ↔ models)
  Enter       launch selected provider/model
  /help       show commands
  q / Ctrl+C  quit
```

---

## 8. Critical Technical Decisions

### 8.1 PTY Over API
Both plans agree on this. The MVP uses `node-pty` to spawn the actual CLI subprocesses rather than calling provider APIs directly. This means `aihub` works with whatever auth and config each CLI already has, avoids API key management duplication, and gives users the full CLI feature set of each tool.

```typescript
import { spawn } from 'node-pty';

const pty = spawn('claude', ['--model', 'claude-sonnet-4-5'], {
  cwd: process.cwd(),
  env: process.env,
  cols: process.stdout.columns,
  rows: process.stdout.rows
});

pty.onData(data => process.stdout.write(data));  // stream to terminal
pty.write(prompt + '\r');                         // send prompt
```

### 8.2 Completion Detection (The Hard Part)
Each CLI has different output patterns indicating it has finished a response. This requires per-provider heuristics:

| Provider | Completion Signal |
|---|---|
| Claude Code | Prompt re-appears (`> ` or `$`) after output |
| Gemini CLI | Specific prompt pattern or idle timeout |
| Generic fallback | 2s of no output after at least 1 line received |

The `completion.ts` module implements these as testable detector functions — this is the riskiest piece of the MVP and needs dedicated testing.

### 8.3 ANSI Stripping
PTY output contains ANSI escape codes for colors and cursor movement. Two data streams must be maintained: the raw stream (for display) and a stripped stream (for completion detection and parsing).

```typescript
import stripAnsi from 'strip-ansi';

pty.onData(data => {
  process.stdout.write(data);               // display: raw with colors
  completionDetector.feed(stripAnsi(data)); // parse: clean text only
});
```

### 8.4 Auth Per Provider
Each provider authenticates differently — flagged as the second-hardest problem in Plan 2. The MVP handles this by:
- **Claude:** Running `claude login` and waiting for the OAuth flow to complete
- **Gemini:** Running `gemini auth` or prompting for `GEMINI_API_KEY` env var
- Storing API keys in `~/.aihub/config.json` (with a warning about plain-text storage; keychain integration in v0.2)

---

## 9. Phased Implementation Plan

---

### Phase 0 — Scaffolding
**Duration:** Day 1  
**Goal:** Working repo with TypeScript, linting, build pipeline, and a runnable `aihub` binary.

**Tasks:**
- Initialize repo: `npm init`, TypeScript config, ESLint + Prettier
- Set up `tsconfig.json` targeting Node 18+
- Install all MVP dependencies
- Wire up `src/cli.ts` as entry point with Commander
- Add `bin` field to `package.json` → `dist/cli.js`
- Confirm `npx aihub --help` runs successfully from local build

**Exit criteria:** `npx . --help` prints a command list without errors.

---

### Phase 1 — Config System
**Duration:** Day 2  
**Goal:** Reliable read/write of `~/.aihub/config.json` with type-safe schema.

**Tasks:**
- Implement `config/index.ts`: `getConfig()`, `setConfig()`, `updateProvider()`
- Create default config if file doesn't exist on first run
- Handle file permission errors gracefully with clear error messages
- Write unit tests for all config operations
- Implement `aihub status` command using config

**Exit criteria:** `aihub status` prints current provider state. Config file is created on first run. All config tests pass.

---

### Phase 2 — Installer
**Duration:** Days 3–4  
**Goal:** `aihub init` detects, installs, and authenticates Claude Code and Gemini CLI end-to-end.

**Tasks:**
- Implement provider detection: check if `claude` / `gemini` binaries exist in PATH
- Implement `installer/providers/claude.ts`:
  - Run `npm install -g @anthropic/claude-code` via `execa` with `ora` spinner
  - Run `claude login` and wait for OAuth flow completion
  - Verify install: run `claude --version`
- Implement `installer/providers/gemini.ts`:
  - Run `npm install -g @google/gemini-cli` via `execa`
  - Prompt for API key via `@clack/prompts`, write to config
  - Verify install: run `gemini --version`
- `aihub init` orchestrates the above with a checklist UX (skip already-installed providers)
- Write config on successful install

**Exit criteria:** On a clean machine, `aihub init` installs both CLIs and writes a valid config. Re-running skips already-installed providers.

---

### Phase 3 — PTY Runner + Chat Command
**Duration:** Days 5–7  
**Goal:** `aihub chat "prompt"` sends a prompt to the active provider and streams the response.

**Tasks:**
- Implement `runner/index.ts`: spawns PTY based on `config.active`
- Implement `runner/adapters/claude.ts`: maps prompt to `claude` CLI invocation args
- Implement `runner/adapters/gemini.ts`: maps prompt to `gemini` CLI invocation args
- Implement `runner/completion.ts`: per-provider done-detection heuristics with timeout fallback
- Wire up `aihub chat` command: spawn PTY → write prompt → stream output → detect completion → exit cleanly
- Handle SIGINT (Ctrl+C) cleanly: kill PTY process without leaving orphaned processes
- Test with real prompts against both providers

**Exit criteria:** `aihub chat "what is 2+2"` streams a real response from both Claude and Gemini. Ctrl+C exits cleanly.

---

### Phase 4 — TUI Dashboard
**Duration:** Days 8–10  
**Goal:** `aihub` (no args) opens an interactive Ink dashboard for switching providers and launching them.

**Tasks:**
- Implement `ui/Dashboard.tsx`: root layout with two-pane structure
- Implement `ui/ProviderList.tsx`: list of installed providers, keyboard nav with `↑ ↓`
- Implement `ui/ModelList.tsx`: list of models for selected provider, free/premium labels
- Wire `Tab` to switch between panes
- Wire `Enter` to launch selected provider (hand off to runner)
- Implement `aihub use <provider>` command (updates config, switches TUI selection)
- Add status bar showing active provider + model
- Add `/help` inline command reference

**Exit criteria:** `aihub` opens TUI, arrow keys navigate both panes, Enter launches Claude or Gemini successfully.

---

### Phase 5 — Polish + NPM Publish
**Duration:** Days 11–14  
**Goal:** Production-quality v0.1.0 release on NPM.

**Tasks:**
- Add comprehensive error handling: missing binary, auth failure, PTY crash, network errors
- Add `aihub auth` command to re-run auth for a specific provider
- Write `README.md`: install instructions, animated GIF demo, full command reference
- Test on macOS, Linux (Ubuntu), and Windows (WSL2)
- Add `engines` field to `package.json` requiring Node ≥ 18
- Run `npm publish --access public`
- Tag `v0.1.0` on GitHub and create release notes
- Verify `npx aihub` works from the NPM registry on a clean machine

**Exit criteria:** `npx aihub` works from NPM. README is complete. Repo tagged `v0.1.0`.

---

## 10. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Completion detection is unreliable | **High** | Start with 3s idle timeout fallback; refine per-provider heuristics iteratively with real output samples |
| Provider CLI changes its output format | Medium | Pin provider CLI versions in `package.json` peer deps; add version check on `aihub init` |
| Auth flow requires browser (OAuth) | Medium | Detect browser-required flows and open browser via `open` package; document fallback for headless |
| `node-pty` native bindings fail on Windows | Medium | Document WSL2 as the supported Windows path; add check and clear error message |
| API key stored in plaintext | Low | Add warning in v0.1 output; implement OS keychain integration in v0.2 |
| Provider install breaks existing user configs | Low | Check for existing CLI installs before running; never overwrite existing user auth tokens |

---

## 11. Post-MVP Roadmap

```
v0.1  ── MVP (this plan)
         Claude + Gemini · TUI · aihub chat · NPM publish

v0.2  ── Full Provider Suite
         + Codex, OpenCode, Aider, Cursor, Copilot CLI
         + Free/premium model labels in TUI
         + aihub chat --provider <name> flag
         + OS keychain for API key storage

v0.3  ── Multi-Agent Orchestration
         + @mention routing  →  @claude fix this then @gemini review
         + handoff.md / memory.md shared context files
         + Broadcast mode: aihub chat --all "prompt"
         + Agent role assignment (architect / reviewer / implementer)

v1.0  ── Platform
         + Plugin system (community providers via npm packages)
         + aihub update (auto-update all managed CLIs)
         + Response history per provider
         + Side-by-side diff view in terminal
```

---

## 12. Definition of Done (MVP)

The MVP is complete when all of the following are true:

- [ ] `npx aihub init` installs Claude Code + Gemini CLI from scratch on a clean machine
- [ ] `aihub status` shows both providers as installed with correct active models
- [ ] `aihub chat "hello"` streams a real response from the active provider
- [ ] `aihub use gemini` switches provider and subsequent `aihub chat` uses Gemini
- [ ] `aihub` opens TUI with keyboard navigation and successfully launches both providers
- [ ] All commands handle errors gracefully — no unhandled promise rejections
- [ ] `npm publish` succeeds and `npx aihub --help` works from the registry
- [ ] README documents all commands with usage examples
- [ ] Repo tagged `v0.1.0` on `main`
