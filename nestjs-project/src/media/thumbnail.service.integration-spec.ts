import { readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { MediaProcessError } from './media.errors';
import { ThumbnailService } from './thumbnail.service';

const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures');

async function listThumbnailTempFiles(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((name) =>
    name.startsWith('thumbnail-'),
  );
}

describe('ThumbnailService (integration — real ffmpeg)', () => {
  const service = new ThumbnailService();

  it('should extract a JPEG frame from the sample fixture', async () => {
    const output = await service.extractFrame(join(FIXTURES, 'sample.mp4'), 1);
    try {
      const bytes = await readFile(output);
      expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
      expect(basename(output)).toMatch(/^thumbnail-.+\.jpg$/);
    } finally {
      await rm(output, { force: true });
    }
  });

  it('should remove the temp file and reject when extraction fails', async () => {
    const before = await listThumbnailTempFiles();

    await expect(
      service.extractFrame(join(FIXTURES, 'not-a-video.mp4'), 1),
    ).rejects.toBeInstanceOf(MediaProcessError);

    expect(await listThumbnailTempFiles()).toEqual(before);
  });
});
