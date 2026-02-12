/**
 * Phase 0: Gemini CLI Test
 *
 * Run: npx tsx poc-gemini.ts
 */

import * as pty from "node-pty";

// Full path to Gemini CLI
const GEMINI_CMD = "C:\\Users\\ikarroum\\AppData\\Roaming\\npm\\gemini.cmd";

function ts(): string {
  return new Date().toISOString().split("T")[1].slice(0, 12);
}

function log(msg: string) {
  console.log(`\n[${ts()}] ${msg}`);
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   MAI - PTY Test: Gemini CLI                     ║");
  console.log("║   Using: npm\\gemini.cmd                          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  const prompts = [
    { delay: 30000,  text: "Say hello in exactly 5 words. Nothing else." },
    { delay: 90000,  text: "What is 2+2? Reply with just the number." },
    { delay: 150000, text: "What is the capital of France? One word." },
  ];

  log(`Spawning Gemini CLI: ${GEMINI_CMD}`);

  const proc = pty.spawn(GEMINI_CMD, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: { ...process.env } as Record<string, string>,
  });

  let chunkCount = 0;
  let totalBytes = 0;
  let exited = false;

  proc.onData((data: string) => {
    chunkCount++;
    totalBytes += data.length;
    process.stdout.write(data);
  });

  proc.onExit(({ exitCode, signal }) => {
    exited = true;
    log(`EXITED — code: ${exitCode}, signal: ${signal}`);
    log(`Total: ${chunkCount} chunks, ${totalBytes} bytes`);
    process.exit(exitCode || 0);
  });

  // Schedule auto-prompts
  for (const { delay, text } of prompts) {
    setTimeout(() => {
      if (!exited) {
        log(`>>> SENDING: "${text}"`);
        proc.write(text + "\r");
      }
    }, delay);
  }

  // Also forward keyboard input so you can type manually
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on("data", (data: Buffer) => {
    if (data.toString() === "\x03") {
      log("Ctrl+C — exiting");
      proc.write("exit\r");
      setTimeout(() => {
        proc.kill();
        process.exit(0);
      }, 2000);
      return;
    }
    proc.write(data.toString());
  });

  // Hard timeout: 5 minutes
  setTimeout(() => {
    if (!exited) {
      log("Timeout 5min. Killing.");
      proc.write("exit\r");
      setTimeout(() => {
        proc.kill();
        process.exit(1);
      }, 2000);
    }
  }, 300_000);
}

main();
