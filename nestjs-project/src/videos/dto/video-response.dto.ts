import { ApiProperty } from '@nestjs/swagger';
import {
  Video,
  VideoEditorialStatus,
  VideoProcessingStatus,
} from '../entities/video.entity';

export class VideoResponse {
  @ApiProperty({ example: 'dQw4w9WgXcQ', minLength: 11, maxLength: 11 })
  public_id: string;

  @ApiProperty({ example: 'aula' })
  title: string;

  @ApiProperty({ example: 'aula.mp4' })
  original_filename: string;

  @ApiProperty({ example: 'video/mp4' })
  mime_type: string;

  @ApiProperty({ example: 104857600 })
  size_bytes: number;

  @ApiProperty({ enum: VideoProcessingStatus })
  processing_status: VideoProcessingStatus;

  @ApiProperty({ enum: VideoEditorialStatus })
  editorial_status: VideoEditorialStatus;

  @ApiProperty({ type: Number, nullable: true, example: 12.5 })
  duration_seconds: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1920 })
  width: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1080 })
  height: number | null;

  @ApiProperty({ type: String, nullable: true, example: 'h264' })
  video_codec: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'aac' })
  audio_codec: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'mov,mp4,m4a,3gp,3g2,mj2',
  })
  format_name: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Short-lived presigned URL of the thumbnail, when generated',
  })
  thumbnail_url: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  failure_reason: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  created_at: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updated_at: string;
}

export function toVideoResponse(
  video: Video,
  thumbnailUrl: string | null,
): VideoResponse {
  return {
    public_id: video.public_id,
    title: video.title,
    original_filename: video.original_filename,
    mime_type: video.mime_type,
    size_bytes: video.size_bytes,
    processing_status: video.processing_status,
    editorial_status: video.editorial_status,
    duration_seconds: video.duration_seconds,
    width: video.width,
    height: video.height,
    video_codec: video.video_codec,
    audio_codec: video.audio_codec,
    format_name: video.format_name,
    thumbnail_url: thumbnailUrl,
    failure_reason: video.failure_reason,
    created_at: video.created_at.toISOString(),
    updated_at: video.updated_at.toISOString(),
  };
}

export class UploadPlanResponse {
  @ApiProperty({ example: 67108864 })
  part_size: number;

  @ApiProperty({ example: 2 })
  part_count: number;
}

export class CreateVideoResponse {
  @ApiProperty({ type: VideoResponse })
  video: VideoResponse;

  @ApiProperty({ type: UploadPlanResponse })
  upload: UploadPlanResponse;
}

export class PartUrlResponse {
  @ApiProperty({ example: 1 })
  part_number: number;

  @ApiProperty()
  url: string;
}

export class PartUrlsResponse {
  @ApiProperty({ type: [PartUrlResponse] })
  parts: PartUrlResponse[];

  @ApiProperty({ example: 3600 })
  expires_in: number;
}

export class UploadedPartResponse {
  @ApiProperty({ example: 1 })
  part_number: number;

  @ApiProperty({ example: '"9b2cf535f27731c974343645a3985328"' })
  etag: string;

  @ApiProperty({ example: 67108864 })
  size_bytes: number;
}

export class UploadedPartsResponse {
  @ApiProperty({ type: [UploadedPartResponse] })
  parts: UploadedPartResponse[];
}

export class DeliveryUrlResponse {
  @ApiProperty({
    description: 'Short-lived presigned URL served directly by the storage',
  })
  url: string;

  @ApiProperty({ example: 900 })
  expires_in: number;
}
