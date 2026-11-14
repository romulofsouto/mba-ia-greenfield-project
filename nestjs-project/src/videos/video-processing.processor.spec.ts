import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import { MediaProbeService } from '../media/media-probe.service';
import { MediaProcessError } from '../media/media.errors';
import { ThumbnailService } from '../media/thumbnail.service';
import { StorageService } from '../storage/storage.service';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { VideoProcessingProcessor } from './video-processing.processor';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
  rm: jest.fn().mockResolvedValue(undefined),
}));

const METADATA = {
  duration_seconds: 10,
  width: 1280,
  height: 720,
  video_codec: 'h264',
  audio_codec: 'aac',
  format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
  has_video_stream: true,
};

function buildJob(attemptsMade: number, attempts = 3): Job {
  return {
    id: 'process-video-id',
    data: { videoId: 'video-id' },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job;
}

describe('VideoProcessingProcessor', () => {
  let processor: VideoProcessingProcessor;
  const repo = { findOneBy: jest.fn(), update: jest.fn() };
  const storage = { presignGetObject: jest.fn(), putObject: jest.fn() };
  const probe = { probe: jest.fn() };
  const thumbnail = { extractFrame: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.findOneBy.mockResolvedValue({
      id: 'video-id',
      storage_key: 'videos/video-id/original',
      processing_status: VideoProcessingStatus.PROCESSING,
    });
    repo.update.mockResolvedValue({ affected: 1 });
    storage.presignGetObject.mockResolvedValue('http://minio:9000/signed');
    probe.probe.mockResolvedValue(METADATA);
    thumbnail.extractFrame.mockResolvedValue('/tmp/thumbnail.jpg');

    const module = await Test.createTestingModule({
      providers: [
        VideoProcessingProcessor,
        { provide: getRepositoryToken(Video), useValue: repo },
        { provide: StorageService, useValue: storage },
        { provide: MediaProbeService, useValue: probe },
        { provide: ThumbnailService, useValue: thumbnail },
      ],
    }).compile();
    processor = module.get(VideoProcessingProcessor);
  });

  it('should probe the internal URL, store the thumbnail and mark the video ready', async () => {
    await processor.process(buildJob(0));

    expect(storage.presignGetObject).toHaveBeenCalledWith(
      'videos/video-id/original',
      expect.objectContaining({ endpoint: 'internal' }),
    );
    expect(thumbnail.extractFrame).toHaveBeenCalledWith(
      'http://minio:9000/signed',
      1,
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      'thumbnails/video-id/default.jpg',
      Buffer.from('jpeg'),
      'image/jpeg',
    );
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'video-id', processing_status: VideoProcessingStatus.PROCESSING },
      expect.objectContaining({
        processing_status: VideoProcessingStatus.READY,
        duration_seconds: 10,
        thumbnail_key: 'thumbnails/video-id/default.jpg',
        processed_at: expect.any(Date),
      }),
    );
  });

  it('should take the thumbnail at half the duration for videos shorter than 2s', async () => {
    probe.probe.mockResolvedValue({ ...METADATA, duration_seconds: 1 });

    await processor.process(buildJob(0));

    expect(thumbnail.extractFrame).toHaveBeenCalledWith(
      'http://minio:9000/signed',
      0.5,
    );
  });

  it('should skip a video that is no longer processing', async () => {
    repo.findOneBy.mockResolvedValue({
      id: 'video-id',
      processing_status: VideoProcessingStatus.READY,
    });

    await processor.process(buildJob(0));

    expect(probe.probe).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('should leave the status untouched when an intermediate attempt fails', async () => {
    thumbnail.extractFrame.mockRejectedValue(new Error('ffmpeg crashed'));

    await expect(processor.process(buildJob(1))).rejects.toThrow(
      'ffmpeg crashed',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('should mark the video failed with processing_error when the last attempt fails', async () => {
    thumbnail.extractFrame.mockRejectedValue(new Error('ffmpeg crashed'));

    await expect(processor.process(buildJob(2))).rejects.toThrow(
      'ffmpeg crashed',
    );
    expect(repo.update).toHaveBeenCalledWith(
      { id: 'video-id', processing_status: VideoProcessingStatus.PROCESSING },
      {
        processing_status: VideoProcessingStatus.FAILED,
        failure_reason: 'processing_error',
        processed_at: expect.any(Date),
      },
    );
  });

  it('should fail without retries as not_a_video when the input is not media', async () => {
    probe.probe.mockRejectedValue(
      new MediaProcessError(
        'ffprobe',
        1,
        'input: Invalid data found when processing input',
      ),
    );

    await expect(processor.process(buildJob(0))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(repo.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ failure_reason: 'not_a_video' }),
    );
  });

  it('should fail as not_a_video when the file has no video stream', async () => {
    probe.probe.mockResolvedValue({ ...METADATA, has_video_stream: false });

    await expect(processor.process(buildJob(0))).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(thumbnail.extractFrame).not.toHaveBeenCalled();
  });

  it('should keep a storage read error retryable', async () => {
    probe.probe.mockRejectedValue(
      new MediaProcessError('ffprobe', 1, 'Server returned 403 Forbidden'),
    );

    await expect(processor.process(buildJob(0))).rejects.toBeInstanceOf(
      MediaProcessError,
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
