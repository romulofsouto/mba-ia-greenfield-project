import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MEDIA_TIMEOUTS_MS } from './media.constants';
import { runProcess } from './run-process';

@Injectable()
export class ThumbnailService {
  // Extracts a single JPEG frame at `atSeconds` into a temp file and returns
  // its path; the caller owns the file. On failure the temp file is removed.
  async extractFrame(
    source: string,
    atSeconds: number,
    timeoutMs: number = MEDIA_TIMEOUTS_MS.THUMBNAIL,
  ): Promise<string> {
    const output = join(tmpdir(), `thumbnail-${randomUUID()}.jpg`);
    try {
      await runProcess(
        'ffmpeg',
        [
          '-v',
          'error',
          '-y',
          '-ss',
          String(atSeconds),
          '-i',
          source,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          output,
        ],
        timeoutMs,
      );
      return output;
    } catch (error) {
      await rm(output, { force: true });
      throw error;
    }
  }
}
