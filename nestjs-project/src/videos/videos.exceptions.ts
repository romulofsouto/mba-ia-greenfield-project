import { DomainException } from '../common/exceptions/domain.exception';

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class VideoTooLargeException extends DomainException {
  constructor(maxSizeBytes: number) {
    super(
      'VIDEO_TOO_LARGE',
      413,
      `Video exceeds the maximum size of ${maxSizeBytes} bytes`,
    );
  }
}

export class UnsupportedVideoTypeException extends DomainException {
  constructor(mimeType: string) {
    super(
      'UNSUPPORTED_VIDEO_TYPE',
      415,
      `Video type "${mimeType}" is not supported`,
    );
  }
}

export class UploadNotInProgressException extends DomainException {
  constructor() {
    super('UPLOAD_NOT_IN_PROGRESS', 409, 'The video upload is not in progress');
  }
}

export class InvalidPartNumberException extends DomainException {
  constructor(partCount: number) {
    super(
      'INVALID_PART_NUMBER',
      400,
      `Part numbers must be between 1 and ${partCount}`,
    );
  }
}

export class UploadIncompleteException extends DomainException {
  constructor() {
    super(
      'UPLOAD_INCOMPLETE',
      400,
      'The upload could not be completed: missing or invalid parts',
    );
  }
}

export class ProcessingEnqueueFailedException extends DomainException {
  constructor() {
    super(
      'PROCESSING_ENQUEUE_FAILED',
      503,
      'The upload completed but video processing could not be scheduled',
    );
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 409, 'The video is not ready for playback yet');
  }
}
