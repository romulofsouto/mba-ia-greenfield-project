import { join } from 'node:path';
import { MediaProcessError } from './media.errors';
import { MediaProbeService } from './media-probe.service';

const FIXTURES = join(__dirname, '..', '..', 'test', 'fixtures');

describe('MediaProbeService (integration — real ffprobe)', () => {
  const service = new MediaProbeService();

  it('should extract duration and stream metadata from the sample fixture', async () => {
    const metadata = await service.probe(join(FIXTURES, 'sample.mp4'));

    expect(metadata.duration_seconds).toBeCloseTo(2, 0);
    expect(metadata.width).toBe(160);
    expect(metadata.height).toBe(120);
    expect(metadata.video_codec).toBe('h264');
    expect(metadata.audio_codec).toBe('aac');
    expect(metadata.format_name).toContain('mp4');
    expect(metadata.has_video_stream).toBe(true);
  });

  it('should reject a non-video file instead of inventing metadata', async () => {
    await expect(
      service.probe(join(FIXTURES, 'not-a-video.mp4')),
    ).rejects.toBeInstanceOf(MediaProcessError);
  });
});
