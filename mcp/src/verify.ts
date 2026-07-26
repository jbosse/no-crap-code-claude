// mcp/src/verify.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface VerifyStep {
  name: string;
  cmd: string;
  args: string[];
  timeoutMs?: number;
}

export interface VerifyStepResult {
  name: string;
  exitCode: number;
  stdoutTail: string;
  stderrTail: string;
}

export interface VerifyResult {
  ok: boolean;
  steps: VerifyStepResult[];
  failedStep?: string;
}

export const DEFAULT_STEPS: VerifyStep[] = [
  { name: "precommit", cmd: "mix", args: ["precommit"], timeoutMs: 30 * 60 * 1000 },
];

function tail(s: string, lines = 40): string {
  const arr = s.split("\n");
  return arr.slice(Math.max(0, arr.length - lines)).join("\n");
}

export async function runVerify(steps: VerifyStep[] = DEFAULT_STEPS): Promise<VerifyResult> {
  const results: VerifyStepResult[] = [];
  for (const step of steps) {
    let exitCode = 0;
    let stdout = "";
    let stderr = "";
    try {
      const res = await execFileAsync(step.cmd, step.args, {
        timeout: step.timeoutMs ?? 10 * 60 * 1000,
        maxBuffer: 50 * 1024 * 1024,
      });
      stdout = res.stdout;
      stderr = res.stderr;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string; code?: number };
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? String(err);
      exitCode = e.code ?? 1;
    }
    const result: VerifyStepResult = { name: step.name, exitCode, stdoutTail: tail(stdout), stderrTail: tail(stderr) };
    results.push(result);
    if (result.exitCode !== 0) {
      return { ok: false, steps: results, failedStep: step.name };
    }
  }
  return { ok: true, steps: results };
}
