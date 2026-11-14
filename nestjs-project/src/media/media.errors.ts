export class MediaProcessError extends Error {
  constructor(
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(
      `${command} exited with code ${exitCode}: ${stderr.trim().slice(0, 500)}`,
    );
    this.name = 'MediaProcessError';
  }
}

export class MediaTimeoutError extends Error {
  constructor(
    readonly command: string,
    readonly timeoutMs: number,
  ) {
    super(`${command} timed out after ${timeoutMs}ms`);
    this.name = 'MediaTimeoutError';
  }
}
