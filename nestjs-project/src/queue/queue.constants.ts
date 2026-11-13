import type { DefaultJobOptions } from 'bullmq';

export const QUEUES = {
  VIDEO_PROCESSING: 'video-processing',
  VIDEO_MAINTENANCE: 'video-maintenance',
} as const;

export const JOBS = {
  PROCESS_VIDEO: 'process-video',
  CLEANUP_ABANDONED_UPLOADS: 'cleanup-abandoned-uploads',
} as const;

export const VIDEO_PROCESSING_JOB_OPTIONS: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10000 },
  removeOnComplete: true,
  removeOnFail: 100,
};

export interface ProcessVideoJobData {
  videoId: string;
}

export function processVideoJobId(videoId: string): string {
  return `process-${videoId}`;
}
