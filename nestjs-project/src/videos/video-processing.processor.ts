import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Job, UnrecoverableError } from 'bullmq';
import { readFile, rm } from 'node:fs/promises';
import { Repository } from 'typeorm';
import { MediaProbeService } from '../media/media-probe.service';
import { MediaProcessError } from '../media/media.errors';
import { ThumbnailService } from '../media/thumbnail.service';
import { ProcessVideoJobData, QUEUES } from '../queue/queue.constants';
import { thumbnailObjectKey } from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { FAILURE_REASONS } from './videos.constants';

// Long enough to cover the probe and thumbnail timeouts of one attempt.
const SOURCE_URL_TTL_SECONDS = 900;
const THUMBNAIL_MAX_OFFSET_SECONDS = 1;
// ffprobe/ffmpeg report this when the input is readable but is not media; HTTP
// or network failures produce other messages and stay retryable.
const INVALID_MEDIA_STDERR = 'Invalid data found when processing input';

class NotAVideoError extends Error {
  constructor() {
    super('The uploaded file has no video stream');
    this.name = 'NotAVideoError';
  }
}

function isInvalidMedia(error: unknown): boolean {
  return (
    error instanceof MediaProcessError &&
    error.stderr.includes(INVALID_MEDIA_STDERR)
  );
}

// BullMQ retries while `attemptsMade + 1 < attempts`; `attemptsMade` counts the
// attempts that already finished, so this is the last one.
function isFinalAttempt(job: Job): boolean {
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

// FFmpeg is CPU-bound: one job at a time per worker container.
@Processor(QUEUES.VIDEO_PROCESSING, { concurrency: 1 })
export class VideoProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly probeService: MediaProbeService,
    private readonly thumbnailService: ThumbnailService,
  ) {
    super();
  }

  async process(job: Job<ProcessVideoJobData>): Promise<void> {
    const video = await this.videoRepository.findOneBy({
      id: job.data.videoId,
    });
    // At-least-once delivery: a re-delivered job for a video that is no
    // longer `processing` (already ready or failed) is a no-op.
    if (video?.processing_status !== VideoProcessingStatus.PROCESSING) {
      this.logger.log(
        `Skipping job ${job.id}: video ${job.data.videoId} is not processing`,
      );
      return;
    }

    try {
      await this.processVideo(video);
    } catch (error) {
      if (error instanceof NotAVideoError) {
        await this.markFailed(video.id, FAILURE_REASONS.NOT_A_VIDEO);
        throw new UnrecoverableError(error.message);
      }
      if (isFinalAttempt(job)) {
        await this.markFailed(video.id, FAILURE_REASONS.PROCESSING_ERROR);
      }
      throw error;
    }
  }

  private async processVideo(video: Video): Promise<void> {
    const source = await this.storageService.presignGetObject(
      video.storage_key,
      { expiresIn: SOURCE_URL_TTL_SECONDS, endpoint: 'internal' },
    );

    const metadata = await this.probeService.probe(source).catch((error) => {
      throw isInvalidMedia(error) ? new NotAVideoError() : error;
    });
    if (!metadata.has_video_stream) {
      throw new NotAVideoError();
    }

    const offset = Math.min(
      THUMBNAIL_MAX_OFFSET_SECONDS,
      (metadata.duration_seconds ?? 0) / 2,
    );
    const framePath = await this.thumbnailService.extractFrame(source, offset);
    const thumbnailKey = thumbnailObjectKey(video.id);
    try {
      await this.storageService.putObject(
        thumbnailKey,
        await readFile(framePath),
        'image/jpeg',
      );
    } finally {
      await rm(framePath, { force: true });
    }

    await this.videoRepository.update(
      { id: video.id, processing_status: VideoProcessingStatus.PROCESSING },
      {
        duration_seconds: metadata.duration_seconds,
        width: metadata.width,
        height: metadata.height,
        video_codec: metadata.video_codec,
        audio_codec: metadata.audio_codec,
        format_name: metadata.format_name,
        thumbnail_key: thumbnailKey,
        processing_status: VideoProcessingStatus.READY,
        processed_at: new Date(),
      },
    );
  }

  private async markFailed(videoId: string, reason: string): Promise<void> {
    await this.videoRepository.update(
      { id: videoId, processing_status: VideoProcessingStatus.PROCESSING },
      {
        processing_status: VideoProcessingStatus.FAILED,
        failure_reason: reason,
        processed_at: new Date(),
      },
    );
  }
}
