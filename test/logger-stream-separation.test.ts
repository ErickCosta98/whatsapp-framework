import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distEntry = path.resolve(rootDir, "dist/index.js");

function runChild(code: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["--input-type=module", "-e", code], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 0, stdout, stderr });
    });
  });
}

describe("logger stream separation", () => {
  it("routes engine diagnostics to stderr and leaves stdout empty", async () => {
    const code = `
      import { WhatsAppEngine } from ${JSON.stringify(distEntry)};
      const engine = new WhatsAppEngine({ authDir: "./auth" });
      await engine.disconnect("test-stream-session");
    `;

    const { exitCode, stdout, stderr } = await runChild(code);

    expect(exitCode).toBe(0);
    // STDOUT must be strictly empty — protocol frames only
    expect(stdout.trim()).toBe("");
    // Diagnostics must land on STDERR
    expect(stderr).toContain("disconnect called for unknown session");
  });

  it("companion check: engine default logger resolves destination to fd 2 (stderr)", async () => {
    const { WhatsAppEngine } = await import("../dist/index.js");
    const pino = (await import("pino")).default;
    const engine = new WhatsAppEngine({ authDir: "./auth" });
    const logger = (engine as any).logger;
    const stream = logger[pino.symbols.streamSym];
    expect(stream).toBeDefined();
    expect(stream.fd).toBe(2);
  });

  it("allows caller to supply custom logDestination without writing to stdout", async () => {
    const code = `
      import { WhatsAppEngine } from ${JSON.stringify(distEntry)};
      import { Writable } from "node:stream";

      let captured = "";
      const customDest = new Writable({
        write(chunk, encoding, callback) {
          captured += chunk.toString();
          callback();
        }
      });

      const engine = new WhatsAppEngine({
        authDir: "./auth",
        logDestination: customDest,
      });

      await engine.disconnect("custom-dest-session");
      if (!captured.includes("disconnect called for unknown session")) {
        process.exit(1);
      }
    `;

    const { exitCode, stdout, stderr } = await runChild(code);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("");
    expect(stderr.trim()).toBe("");
  });

  it("allows caller to supply custom preconfigured logger without writing to stdout", async () => {
    const code = `
      import { WhatsAppEngine } from ${JSON.stringify(distEntry)};
      import pino from "pino";
      import { Writable } from "node:stream";

      let captured = "";
      const customDest = new Writable({
        write(chunk, encoding, callback) {
          captured += chunk.toString();
          callback();
        }
      });

      const customLogger = pino({ level: "info" }, customDest);
      const engine = new WhatsAppEngine({
        authDir: "./auth",
        logger: customLogger,
      });

      await engine.disconnect("custom-logger-session");
      if (!captured.includes("disconnect called for unknown session")) {
        process.exit(1);
      }
    `;

    const { exitCode, stdout, stderr } = await runChild(code);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("");
    expect(stderr.trim()).toBe("");
  });
});
