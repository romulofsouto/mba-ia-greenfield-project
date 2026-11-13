import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { parse } from 'node:path';
import { QueryFailedError, Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import videoConfig from '../config/video.config';
import { videoObjectKey, videoPrefix } from '../storage/storage.keys';
import { StorageService } from '../storage/storage.service';
import {
  CreateVideoResponse,
  DeliveryUrlResponse,
  PartUrlsResponse,
  UploadedPartsResponse,
  VideoResponse,
  toVideoResponse,
} from './dto/video-response.dto';
import type { CreateVideoDto } from './dto/create-video.dto';
import type { CompletedPartDto } from './dto/complete-upload.dto';
import { Video, VideoProcessingStatus } from './entities/video.entity';
import { generatePublicId } from './public-id.util';
import { VideoProcessingProducer } from './video-processing.producer';
import {
  FAILURE_REASONS,
  INCOMPLETE_UPLOAD_ERRORS,
  NO_SUCH_UPLOAD_ERROR,
  PUBLIC_ID_MAX_ATTEMPTS,
  PUBLIC_ID_PATTERN,
} from './videos.constants';
import {
  InvalidPartNumberException,
  ProcessingEnqueueFailedException,
  UnsupportedVideoTypeException,
  UploadIncompleteException,
  UploadNotInProgressException,
  VideoNotFoundException,
  VideoNotReadyException,
  VideoTooLargeException,
} from './videos.exceptions';

const TITLE_MAX_LENGTH = 100;
const PG_UNIQUE_VIOLATION = '23505';

function isPublicIdCollision(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string; detail?: string };
  return (
    driverError.code === PG_UNIQUE_VIOLATION &&
    (driverError.detail ?? '').includes('public_id')
  );
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}

function titleFromFilename(filename: string): string {
  const name = parse(filename).name || filename;
  return name.slice(0, TITLE_MAX_LENGTH);
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepository: Repository<Video>,
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    private readonly processingProducer: VideoProcessingProducer,
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
  ) {}

  async initiateUpload(
    userId: string,
    dto: CreateVideoDto,
  ): Promise<CreateVideoResponse> {
    if (!this.config.allowedMimeTypes.includes(dto.mime_type)) {
      throw new UnsupportedVideoTypeException(dto.mime_type);
    }
    if (dto.size_bytes > this.config.maxSizeBytes) {
      throw new VideoTooLargeException(this.config.maxSizeBytes);
    }

    const channel = await this.channelsService.findByUserId(userId);
    if (!channel) {
      throw new Error(`User ${userId} has no channel`);
    }

    const id = randomUUID();
    const storageKey = videoObjectKey(id);
    const uploadId = await this.storageService.createMultipartUpload(
      storageKey,
      dto.mime_type,
    );

    let video: Video;
    try {
      video = await this.insertWithUniquePublicId({
        id,
        channel_id: channel.id,
        title: titleFromFilename(dto.filename),
        original_filename: dto.filename,
        mime_type: dto.mime_type,
        size_bytes: dto.size_bytes,
        upload_id: uploadId,
        storage_key: storageKey,
      });
    } catch (error) {
      // Compensation: the row was not created, so release the multipart upload.
      await this.storageService.abortMultipartUpload(storageKey, uploadId);
      throw error;
    }

    return {
      video: toVideoResponse(video, null),
      upload: {
        part_size: this.config.partSizeBytes,
        part_count: this.partCount(video),
      },
    };
  }

  async issuePartUrls(
    publicId: string,
    userId: string,
    partNumbers: number[],
  ): Promise<PartUrlsResponse> {
    const video = await this.findOwnedOrFail(publicId, userId);
    const uploadId = this.assertUploading(video);
    const partCount = this.partCount(video);
    if (partNumbers.some((n) => n > partCount)) {
      throw new InvalidPartNumberException(partCount);
    }

    const parts = await Promise.all(
      partNumbers.map(async (partNumber) => ({
        part_number: partNumber,
        url: await this.storageService.presignUploadPart(
          video.storage_key,
          uploadId,
          partNumber,
          this.config.uploadUrlTtlSeconds,
        ),
      })),
    );
    return { parts, expires_in: this.config.uploadUrlTtlSeconds };
  }

  async listUploadedParts(
    publicId: string,
    userId: string,
  ): Promise<UploadedPartsResponse> {
    const video = await this.findOwnedOrFail(publicId, userId);
    const uploadId = this.assertUploading(video);
    const parts = await this.storageService.listParts(
      video.storage_key,
      uploadId,
    );
    return {
      parts: parts.map((part) => ({
        part_number: part.partNumber,
        etag: part.etag,
        size_bytes: part.sizeBytes,
      })),
    };
  }

  async completeUpload(
    publicId: string,
    userId: string,
    parts: CompletedPartDto[],
  ): Promise<VideoResponse> {
    const video = await this.findOwnedOrFail(publicId, userId);
    const uploadId = this.assertUploading(video);

    try {
      await this.storageService.completeMultipartUpload(
        video.storage_key,
        uploadId,
        parts.map((part) => ({
          partNumber: part.part_number,
          etag: part.etag,
        })),
      );
    } catch (error) {
      if (INCOMPLETE_UPLOAD_ERRORS.has(errorName(error) ?? '')) {
        throw new UploadIncompleteException();
      }
      throw error;
    }

    const { contentLength } = await this.storageService.headObject(
      video.storage_key,
    );
    if (contentLength > this.config.maxSizeBytes) {
      await this.storageService.deletePrefix(videoPrefix(video.id));
      await this.transitionFromUploading(video.id, {
        processing_status: VideoProcessingStatus.FAILED,
        failure_reason: FAILURE_REASONS.FILE_TOO_LARGE,
        upload_id: null,
        size_bytes: contentLength,
      });
      throw new VideoTooLargeException(this.config.maxSizeBytes);
    }

    // The row is committed as `processing` before the job exists, so the
    // worker always finds it in the expected state.
    await this.transitionFromUploading(video.id, {
      processing_status: VideoProcessingStatus.PROCESSING,
      upload_id: null,
      size_bytes: contentLength,
      uploaded_at: new Date(),
    });

    try {
      await this.processingProducer.enqueue(video.id);
    } catch {
      await this.videoRepository.update(video.id, {
        processing_status: VideoProcessingStatus.FAILED,
        failure_reason: FAILURE_REASONS.ENQUEUE_FAILED,
      });
      throw new ProcessingEnqueueFailedException();
    }

    const updated = await this.videoRepository.findOneByOrFail({
      id: video.id,
    });
    return this.toResponse(updated);
  }

  async abortUpload(publicId: string, userId: string): Promise<void> {
    const video = await this.findOwnedOrFail(publicId, userId);
    const uploadId = this.assertUploading(video);

    try {
      await this.storageService.abortMultipartUpload(
        video.storage_key,
        uploadId,
      );
    } catch (error) {
      // Already gone in storage (e.g. expired): the video is still aborted.
      if (errorName(error) !== NO_SUCH_UPLOAD_ERROR) throw error;
    }

    await this.transitionFromUploading(video.id, {
      processing_status: VideoProcessingStatus.FAILED,
      failure_reason: FAILURE_REASONS.UPLOAD_ABORTED,
      upload_id: null,
    });
  }

  async findOwned(publicId: string, userId: string): Promise<VideoResponse> {
    const video = await this.findOwnedOrFail(publicId, userId);
    return this.toResponse(video);
  }

  async getStreamUrl(
    publicId: string,
    userId: string,
  ): Promise<DeliveryUrlResponse> {
    const video = await this.findReadyOrFail(publicId, userId);
    return this.deliveryUrl(video.storage_key);
  }

  async getDownloadUrl(
    publicId: string,
    userId: string,
  ): Promise<DeliveryUrlResponse> {
    const video = await this.findReadyOrFail(publicId, userId);
    return this.deliveryUrl(video.storage_key, video.original_filename);
  }

  private async findReadyOrFail(
    publicId: string,
    userId: string,
  ): Promise<Video> {
    const video = await this.findOwnedOrFail(publicId, userId);
    if (video.processing_status !== VideoProcessingStatus.READY) {
      throw new VideoNotReadyException();
    }
    return video;
  }

  // The storage serves the bytes (with Range support) through a short-lived
  // URL signed for the public endpoint; the API never proxies the file.
  private async deliveryUrl(
    key: string,
    downloadFilename?: string,
  ): Promise<DeliveryUrlResponse> {
    const expiresIn = this.config.deliveryUrlTtlSeconds;
    const url = await this.storageService.presignGetObject(key, {
      expiresIn,
      downloadFilename,
    });
    return { url, expires_in: expiresIn };
  }

  private async toResponse(video: Video): Promise<VideoResponse> {
    const thumbnailUrl = video.thumbnail_key
      ? await this.storageService.presignGetObject(video.thumbnail_key, {
          expiresIn: this.config.deliveryUrlTtlSeconds,
        })
      : null;
    return toVideoResponse(video, thumbnailUrl);
  }

  // Owner-only lookup: a malformed id, an unknown id and another user's video
  // are indistinguishable to the caller.
  private async findOwnedOrFail(
    publicId: string,
    userId: string,
  ): Promise<Video> {
    if (!PUBLIC_ID_PATTERN.test(publicId)) {
      throw new VideoNotFoundException();
    }
    const video = await this.videoRepository.findOne({
      where: { public_id: publicId, channel: { user_id: userId } },
    });
    if (!video) {
      throw new VideoNotFoundException();
    }
    return video;
  }

  private assertUploading(video: Video): string {
    if (
      video.processing_status !== VideoProcessingStatus.UPLOADING ||
      !video.upload_id
    ) {
      throw new UploadNotInProgressException();
    }
    return video.upload_id;
  }

  // Conditional update guarding against concurrent transitions: only a row
  // still `uploading` moves on.
  private async transitionFromUploading(
    videoId: string,
    changes: Partial<Video>,
  ): Promise<void> {
    const result = await this.videoRepository.update(
      { id: videoId, processing_status: VideoProcessingStatus.UPLOADING },
      changes,
    );
    if (!result.affected) {
      throw new UploadNotInProgressException();
    }
  }

  private partCount(video: Video): number {
    return Math.ceil(video.size_bytes / this.config.partSizeBytes);
  }

  private async insertWithUniquePublicId(
    fields: Partial<Video>,
  ): Promise<Video> {
    for (let attempt = 1; ; attempt++) {
      try {
        const saved = await this.videoRepository.save(
          this.videoRepository.create({
            ...fields,
            public_id: generatePublicId(),
          }),
        );
        // Reload so nullable columns come back as null, not undefined.
        return await this.videoRepository.findOneByOrFail({ id: saved.id });
      } catch (error) {
        if (!isPublicIdCollision(error) || attempt >= PUBLIC_ID_MAX_ATTEMPTS) {
          throw error;
        }
        // Collision on the random public id: retry with a new one.
      }
    }
  }
}
