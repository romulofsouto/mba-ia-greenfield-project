import { registerAs } from '@nestjs/config';

const DEFAULT_ALLOWED_MIME_TYPES =
  'video/mp4,video/webm,video/quicktime,video/x-matroska';

export default registerAs('video', () => ({
  maxSizeBytes: parseInt(process.env.VIDEO_MAX_SIZE_BYTES || '10737418240', 10),
  partSizeBytes: parseInt(process.env.VIDEO_PART_SIZE_BYTES || '67108864', 10),
  allowedMimeTypes: (
    process.env.VIDEO_ALLOWED_MIME_TYPES || DEFAULT_ALLOWED_MIME_TYPES
  )
    .split(',')
    .map((type) => type.trim())
    .filter((type) => type.length > 0),
  uploadUrlTtlSeconds: parseInt(
    process.env.VIDEO_UPLOAD_URL_TTL_SECONDS || '3600',
    10,
  ),
  deliveryUrlTtlSeconds: parseInt(
    process.env.VIDEO_DELIVERY_URL_TTL_SECONDS || '900',
    10,
  ),
  uploadAbandonAfterHours: parseInt(
    process.env.VIDEO_UPLOAD_ABANDON_AFTER_HOURS || '24',
    10,
  ),
}));
