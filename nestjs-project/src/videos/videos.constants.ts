export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export const PUBLIC_ID_MAX_ATTEMPTS = 5;

export const FAILURE_REASONS = {
  UPLOAD_ABORTED: 'upload_aborted',
  UPLOAD_ABANDONED: 'upload_abandoned',
  FILE_TOO_LARGE: 'file_too_large',
  ENQUEUE_FAILED: 'enqueue_failed',
  NOT_A_VIDEO: 'not_a_video',
  PROCESSING_ERROR: 'processing_error',
} as const;

// S3 errors raised by CompleteMultipartUpload when the client's part list does
// not match what was uploaded — the client can fix it and retry.
export const INCOMPLETE_UPLOAD_ERRORS = new Set([
  'InvalidPart',
  'InvalidPartOrder',
  'EntityTooSmall',
]);

export const NO_SUCH_UPLOAD_ERROR = 'NoSuchUpload';
