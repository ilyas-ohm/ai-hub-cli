/**
 * Phase 0: Proof of Concept (v3)
 *
 * Findings from v2:
 * - Claude -p WORKS. All 3 responses were correct.
 * - Exit code is null/undefined because 120s timeout killed the processes
 * - Claude -p takes ~135-156s per call (slow startup)
 * - We just need to fix: timeout + success criteria
 *
 * Run: npx tsx poc.ts
 */

import { execa } from "execa";

// ── Config ──────────────────────────────────────────────────
const TIMEOUT_MS = 300_000; // 5 min — Claude -p takes ~2.5min per call

// ── Helpers ─────────────────────────────────────────────────

function log(tag: string, msg: string) {
  const time = new Date().toISOString().split("T")[1].slice(0, 12);
  console.log(`[${time}] [${tag}] ${msg}`);
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, "").replace(/\x1B\][^\x07]*\x07/g, "");
}

async function claudeP(prompt: string): Promise<{ output: string; exitCode: number | undefined; elapsed: number }> {
  const start = Date.now();
  const result = await execa("claude", ["-p", prompt], {
    timeout: TIMEOUT_MS,
    reject: false,
  });
  const elapsed = (Date.now() - start) / 1000;
  const output = stripAnsi(result.stdout).trim();
  return { output, exitCode: result.exitCode, elapsed };
}

// ── Test 1: Print mode basic ────────────────────────────────

async function testPrintMode(): Promise<boolean> {
  log("TEST", "=== Test 1: Claude Print Mode ===");
  const prompt = "Say hello in exactly 5 words. Nothing else.";
  log("PRINT", `Running: claude -p "${prompt}"`);

  const { output, exitCode, elapsed } = await claudeP(prompt);

  log("PRINT", `Response (${elapsed.toFixed(1)}s): "${output.slice(0, 300)}"`);
  log("PRINT", `Exit code: ${exitCode}`);

  // Success = we got a non-empty response (don't care about exit code)
  const pass = output.length > 0;
  log("RESULT", pass ? "PASS" : "FAIL");
  return pass;
}

// ── Test 2: Sequential calls ────────────────────────────────

async function testSequentialPrint(): Promise<boolean> {
  log("TEST", "=== Test 2: Sequential Print Calls ===");

  const prompts = [
    { prompt: "What is 2+2? Reply with just the number.", expect: "4" },
    { prompt: "What is 10+10? Reply with just the number.", expect: "20" },
  ];

  for (let i = 0; i < prompts.length; i++) {
    const { prompt, expect } = prompts[i];
    log("SEQ", `[${i + 1}/${prompts.length}] "${prompt}"`);

    const { output, elapsed } = await claudeP(prompt);
    log("SEQ", `[${i + 1}] Response (${elapsed.toFixed(1)}s): "${output.slice(0, 200)}"`);

    const correct = output.includes(expect);
    log("SEQ", `[${i + 1}] Contains "${expect}": ${correct}`);

    if (output.length === 0) {
      log("RESULT", `FAIL — no output at prompt ${i + 1}`);
      return false;
    }
  }

  log("RESULT", "PASS");
  return true;
}

// ── Test 3: --continue for multi-turn memory ────────────────

async function testContinueFlag(): Promise<boolean> {
  log("TEST", "=== Test 3: --continue for conversation memory ===");

  // First message
  log("CONT", "[1] Sending: 'Remember the number 42. Just say OK.'");
  const r1 = await claudeP("Remember the number 42. Just say OK.");
  log("CONT", `[1] Response (${r1.elapsed.toFixed(1)}s): "${r1.output.slice(0, 200)}"`);

  if (r1.output.length === 0) {
    log("RESULT", "FAIL — no output from first message");
    return false;
  }

  // Second message with --continue
  log("CONT", "[2] Sending with --continue flag...");
  const start = Date.now();
  const r2 = await execa("claude", ["-p", "What number did I ask you to remember? Reply with just the number.", "--continue"], {
    timeout: TIMEOUT_MS,
    reject: false,
  });
  const elapsed = (Date.now() - start) / 1000;
  const out2 = stripAnsi(r2.stdout).trim();

  log("CONT", `[2] Response (${elapsed.toFixed(1)}s): "${out2.slice(0, 200)}"`);

  const remembers = out2.includes("42");
  log("CONT", `Contains "42": ${remembers}`);

  if (remembers) {
    log("RESULT", "PASS — --continue preserves conversation memory!");
  } else if (out2.length > 0) {
    log("RESULT", "PARTIAL — got a response but no memory of '42'. --continue may not work as expected.");
  } else {
    log("RESULT", "FAIL — no output");
  }

  return remembers;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   MAI - Phase 0: Proof of Concept (v3 - final)  ║");
  console.log("║   5min timeout, check output not exit code       ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("NOTE: Each Claude -p call takes ~2-3 min. Be patient.\n");

  const results: Record<string, boolean> = {};

  results["print-mode"] = await testPrintMode();
  console.log();

  results["sequential-prints"] = await testSequentialPrint();
  console.log();

  results["continue-flag"] = await testContinueFlag();
  console.log();

  // ── Summary ─────────────────────────────────────────────
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║              RESULTS SUMMARY                    ║");
  console.log("╠══════════════════════════════════════════════════╣");
  for (const [test, pass] of Object.entries(results)) {
    const icon = pass ? "PASS" : "FAIL";
    console.log(`║  ${icon}  ${test.padEnd(25)}               ║`);
  }
  console.log("╚══════════════════════════════════════════════════╝");

  const allPassed = Object.values(results).every(Boolean);
  const printWorks = results["print-mode"];
  const continueWorks = results["continue-flag"];

  console.log("\n── Architecture Decision ──\n");

  if (allPassed) {
    console.log("ALL PASSED. Recommended architecture:");
    console.log("  - Use `claude -p` for each command");
    console.log("  - Use `--continue` to maintain conversation context");
    console.log("  - No node-pty needed");
    console.log("  - Show loading spinner during ~2min response time");
    console.log("\nProceed to Phase 1.");
  } else if (printWorks && !continueWorks) {
    console.log("PRINT WORKS, CONTINUE DOESN'T. Options:");
    console.log("  A) Stateless: `claude -p` per command, no conversation memory");
    console.log("  B) Manual context: prepend conversation history to each prompt");
    console.log("  C) node-pty: for real interactive sessions (complex but full control)");
    console.log("  D) Claude SDK: API calls instead of CLI (fastest, most control)");
  } else {
    console.log("PRINT FAILED. Must use alternative:");
    console.log("  - Claude SDK (@anthropic-ai/sdk) for API calls");
    console.log("  - node-pty for terminal wrapping");
  }

  console.log();
  process.exit(allPassed ? 0 : 1);
}

main();
