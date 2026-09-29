import { spawn } from "node:child_process";
import { KBError } from "./core.js";
export function run(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    input?: string;
  } = {},
): Promise<{ stdout: string; stderr: string; elapsed_ms: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "",
      err = "";
    child.stdout.on("data", (b) => {
      out += b;
    });
    child.stderr.on("data", (b) => {
      err += b;
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(
        new KBError("TIMEOUT", `${command} exceeded its time allowance`, {
          elapsed_ms: performance.now() - start,
        }),
      );
    }, options.timeout ?? 120000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0)
        resolve({
          stdout: out,
          stderr: err,
          elapsed_ms: performance.now() - start,
        });
      else
        reject(
          new KBError("PROCESS_FAILED", `${command} exited with ${code}`, {
            stderr: err.slice(-6000),
            stdout: out.slice(-2000),
          }),
        );
    });
    child.stdin.end(options.input ?? "");
  });
}
