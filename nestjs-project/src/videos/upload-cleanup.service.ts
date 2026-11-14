import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import videoConfig from '../config/video.config';
import { StorageService } from '../storage/storage.service';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { FAILURE_REASONS, NO_SUCH_UPLOAD_ERROR } from './videos.constants';

const HOUR_MS = 60 * 60 * 1000;

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly storageService: StorageService,
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
  ) {}

  // Aborts multipart uploads left `uploading` past the abandon window and marks
  // their videos failed. Returns how many videos were marked.
  async sweep(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - this.config.uploadAbandonAfterHours * HOUR_MS,
    );
    const abandoned = await this.videoRepository.find({
      where: {
        processing_status: VideoProcessingStatus.UPLOADING,
        created_at: LessThan(cutoff),
      },
    });

    let marked = 0;
    for (const video of abandoned) {
      try {
        if (video.upload_id) {
          await this.abortIgnoringMissing(video.storage_key, video.upload_id);
        }
        // Conditional: a video completed or aborted meanwhile is left alone.
        const result = await this.videoRepository.update(
          { id: video.id, processing_status: VideoProcessingStatus.UPLOADING },
          {
            processing_status: VideoProcessingStatus.FAILED,
            failure_reason: FAILURE_REASONS.UPLOAD_ABANDONED,
            upload_id: null,
            processed_at: now,
          },
        );
        marked += result.affected ?? 0;
      } catch (error) {
        // One failing video must not stop the sweep; the next run retries it.
        this.logger.error(
          `Could not clean up abandoned upload of video ${video.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    return marked;
  }

  private async abortIgnoringMissing(
    key: string,
    uploadId: string,
  ): Promise<void> {
    try {
      await this.storageService.abortMultipartUpload(key, uploadId);
    } catch (error) {
      // Already expired or aborted in storage: the video is still abandoned.
      if (!(error instanceof Error && error.name === NO_SUCH_UPLOAD_ERROR)) {
        throw error;
      }
    }
  }
}
