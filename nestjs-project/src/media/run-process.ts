import { spawn } from 'node:child_process';
import { MediaProcessError, MediaTimeoutError } from './media.errors';

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

// Runs a binary without a shell (arguments are never interpolated), collects
// its output and kills it when it exceeds the timeout.
export function runProcess(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new MediaTimeoutError(command, timeoutMs));
      } else if (code !== 0) {
        reject(new MediaProcessError(command, code, stderr));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
