import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { MediaProcessError, MediaTimeoutError } from './media.errors';
import { MediaProbeService } from './media-probe.service';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  kill = jest.fn(() => {
    this.emit('close', null);
    return true;
  });
}

describe('MediaProbeService', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  let child: FakeChild;
  let service: MediaProbeService;

  beforeEach(() => {
    child = new FakeChild();
    spawnMock.mockReset().mockReturnValue(child);
    service = new MediaProbeService();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function finish(stdout: string, code = 0, stderr = ''): void {
    child.stdout.emit('data', Buffer.from(stdout));
    if (stderr) child.stderr.emit('data', Buffer.from(stderr));
    child.emit('close', code);
  }

  it('should spawn ffprobe without a shell, with JSON output and the source last', async () => {
    const promise = service.probe('http://minio:9000/bucket/key?sig=1');
    finish(JSON.stringify({ streams: [], format: {} }));
    await promise;

    expect(spawnMock).toHaveBeenCalledWith(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        'http://minio:9000/bucket/key?sig=1',
      ],
      expect.not.objectContaining({ shell: true }),
    );
  });

  it('should map the first video and audio streams', async () => {
    const promise = service.probe('/tmp/a.mp4');
    finish(
      JSON.stringify({
        streams: [
          { codec_type: 'audio', codec_name: 'opus' },
          { codec_type: 'video', codec_name: 'vp9', width: 640, height: 360 },
        ],
        format: { duration: '12.5', format_name: 'matroska,webm' },
      }),
    );

    await expect(promise).resolves.toEqual({
      duration_seconds: 12.5,
      width: 640,
      height: 360,
      video_codec: 'vp9',
      audio_codec: 'opus',
      format_name: 'matroska,webm',
      has_video_stream: true,
    });
  });

  it('should report has_video_stream false when only audio is present', async () => {
    const promise = service.probe('/tmp/a.mp3');
    finish(
      JSON.stringify({
        streams: [{ codec_type: 'audio', codec_name: 'mp3' }],
        format: { duration: '3.0', format_name: 'mp3' },
      }),
    );

    const metadata = await promise;
    expect(metadata.has_video_stream).toBe(false);
    expect(metadata.width).toBeNull();
    expect(metadata.video_codec).toBeNull();
  });

  it('should reject with the stderr when ffprobe exits with a non-zero code', async () => {
    const promise = service.probe('/tmp/bad.mp4');
    finish('', 1, 'Invalid data found when processing input');

    await expect(promise).rejects.toBeInstanceOf(MediaProcessError);
    await expect(promise).rejects.toThrow('Invalid data found');
  });

  it('should kill the process and reject with a timeout error when it hangs', async () => {
    jest.useFakeTimers();
    const promise = service.probe('/tmp/slow.mp4', 1000);

    jest.advanceTimersByTime(1000);

    await expect(promise).rejects.toBeInstanceOf(MediaTimeoutError);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
