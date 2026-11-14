import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import videoConfig from '../config/video.config';
import { StorageService } from '../storage/storage.service';
import {
  Video,
  VideoEditorialStatus,
  VideoProcessingStatus,
} from './entities/video.entity';
import { VideoProcessingProducer } from './video-processing.producer';
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
import { VideosService } from './videos.service';

const MIB = 1024 * 1024;
const CONFIG = {
  maxSizeBytes: 100 * MIB,
  partSizeBytes: 10 * MIB,
  allowedMimeTypes: ['video/mp4', 'video/webm'],
  uploadUrlTtlSeconds: 3600,
  deliveryUrlTtlSeconds: 900,
  uploadAbandonAfterHours: 24,
};

function buildVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: 'video-id',
    public_id: 'abcdefghijk',
    channel_id: 'channel-id',
    title: 'aula',
    original_filename: 'aula.mp4',
    mime_type: 'video/mp4',
    size_bytes: 25 * MIB,
    processing_status: VideoProcessingStatus.UPLOADING,
    editorial_status: VideoEditorialStatus.DRAFT,
    upload_id: 'upload-id',
    storage_key: 'videos/video-id/original',
    thumbnail_key: null,
    duration_seconds: null,
    width: null,
    height: null,
    video_codec: null,
    audio_codec: null,
    format_name: null,
    failure_reason: null,
    uploaded_at: null,
    processed_at: null,
    created_at: new Date('2026-11-13T10:00:00Z'),
    updated_at: new Date('2026-11-13T10:00:00Z'),
    channel: undefined as never,
    ...overrides,
  };
}

function uniqueViolation(column: string): QueryFailedError {
  const error = new QueryFailedError('INSERT', [], new Error('duplicate'));
  Object.assign(error.driverError, {
    code: '23505',
    detail: `Key (${column})=(x) already exists.`,
  });
  return error;
}

function s3Error(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('VideosService', () => {
  let service: VideosService;
  const repo = {
    create: jest.fn((v: Partial<Video>) => v),
    save: jest.fn(),
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    update: jest.fn(),
  };
  const channels = { findByUserId: jest.fn() };
  const storage = {
    createMultipartUpload: jest.fn(),
    abortMultipartUpload: jest.fn(),
    presignUploadPart: jest.fn(),
    listParts: jest.fn(),
    completeMultipartUpload: jest.fn(),
    headObject: jest.fn(),
    deletePrefix: jest.fn(),
    presignGetObject: jest.fn(),
  };
  const producer = { enqueue: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    repo.create.mockImplementation((v: Partial<Video>) => v);
    repo.update.mockResolvedValue({ affected: 1 });

    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: repo },
        { provide: ChannelsService, useValue: channels },
        { provide: StorageService, useValue: storage },
        { provide: VideoProcessingProducer, useValue: producer },
        { provide: videoConfig.KEY, useValue: CONFIG },
      ],
    }).compile();
    service = module.get(VideosService);
  });

  describe('initiateUpload', () => {
    const dto = {
      filename: 'aula.mp4',
      mime_type: 'video/mp4',
      size_bytes: 25 * MIB,
    };

    beforeEach(() => {
      channels.findByUserId.mockResolvedValue({ id: 'channel-id' });
      storage.createMultipartUpload.mockResolvedValue('upload-id');
      repo.save.mockImplementation(async (v: Partial<Video>) => v);
      repo.findOneByOrFail.mockImplementation(async () =>
        buildVideo({ public_id: repo.save.mock.calls.at(-1)[0].public_id }),
      );
    });

    it('should reject a MIME type outside the allowlist before touching storage', async () => {
      await expect(
        service.initiateUpload('user', {
          ...dto,
          mime_type: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(UnsupportedVideoTypeException);
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should reject a declared size above the limit before touching storage', async () => {
      await expect(
        service.initiateUpload('user', { ...dto, size_bytes: 100 * MIB + 1 }),
      ).rejects.toBeInstanceOf(VideoTooLargeException);
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it('should accept a declared size exactly at the limit', async () => {
      await expect(
        service.initiateUpload('user', { ...dto, size_bytes: 100 * MIB }),
      ).resolves.toBeDefined();
    });

    it('should store the draft with a title derived from the filename and return the part plan', async () => {
      const result = await service.initiateUpload('user', dto);

      const saved = repo.save.mock.calls[0][0] as Partial<Video>;
      expect(saved).toMatchObject({
        channel_id: 'channel-id',
        title: 'aula',
        original_filename: 'aula.mp4',
        upload_id: 'upload-id',
        storage_key: `videos/${saved.id}/original`,
      });
      expect(storage.createMultipartUpload).toHaveBeenCalledWith(
        `videos/${saved.id}/original`,
        'video/mp4',
      );
      expect(result.upload).toEqual({ part_size: 10 * MIB, part_count: 3 });
    });

    it('should retry with a new public id on a public_id collision', async () => {
      repo.save
        .mockRejectedValueOnce(uniqueViolation('public_id'))
        .mockImplementation(async (v: Partial<Video>) => v);

      await service.initiateUpload('user', dto);

      expect(repo.save).toHaveBeenCalledTimes(2);
      const [first, second] = repo.save.mock.calls.map(
        (call) => (call[0] as Partial<Video>).public_id,
      );
      expect(first).not.toBe(second);
    });

    it('should give up after the bounded retries and abort the multipart upload', async () => {
      repo.save.mockRejectedValue(uniqueViolation('public_id'));

      await expect(service.initiateUpload('user', dto)).rejects.toBeInstanceOf(
        QueryFailedError,
      );
      expect(repo.save).toHaveBeenCalledTimes(5);
      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        expect.stringMatching(/^videos\/.+\/original$/),
        'upload-id',
      );
    });

    it('should not retry on other database errors', async () => {
      repo.save.mockRejectedValue(uniqueViolation('channel_id'));

      await expect(service.initiateUpload('user', dto)).rejects.toThrow();
      expect(repo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('issuePartUrls', () => {
    it('should reject part numbers above part_count with INVALID_PART_NUMBER', async () => {
      repo.findOne.mockResolvedValue(buildVideo({ size_bytes: 25 * MIB }));

      await expect(
        service.issuePartUrls('abcdefghijk', 'user', [1, 4]),
      ).rejects.toBeInstanceOf(InvalidPartNumberException);
      expect(storage.presignUploadPart).not.toHaveBeenCalled();
    });

    it('should reject when the video is no longer uploading', async () => {
      repo.findOne.mockResolvedValue(
        buildVideo({
          processing_status: VideoProcessingStatus.PROCESSING,
          upload_id: null,
        }),
      );

      await expect(
        service.issuePartUrls('abcdefghijk', 'user', [1]),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
    });

    it('should answer VIDEO_NOT_FOUND for a malformed public id without querying', async () => {
      await expect(
        service.issuePartUrls('x', 'user', [1]),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
      expect(repo.findOne).not.toHaveBeenCalled();
    });

    it('should answer VIDEO_NOT_FOUND when the video is not owned by the caller', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.issuePartUrls('abcdefghijk', 'other-user', [1]),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { public_id: 'abcdefghijk', channel: { user_id: 'other-user' } },
      });
    });
  });

  describe('completeUpload', () => {
    const parts = [{ part_number: 1, etag: '"a"' }];

    beforeEach(() => {
      repo.findOne.mockResolvedValue(buildVideo());
      repo.findOneByOrFail.mockResolvedValue(
        buildVideo({ processing_status: VideoProcessingStatus.PROCESSING }),
      );
      storage.headObject.mockResolvedValue({ contentLength: 20 * MIB });
    });

    it('should map storage part errors to UPLOAD_INCOMPLETE and keep the upload open', async () => {
      storage.completeMultipartUpload.mockRejectedValue(s3Error('InvalidPart'));

      await expect(
        service.completeUpload('abcdefghijk', 'user', parts),
      ).rejects.toBeInstanceOf(UploadIncompleteException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('should rethrow unexpected storage errors', async () => {
      storage.completeMultipartUpload.mockRejectedValue(
        s3Error('InternalError'),
      );

      await expect(
        service.completeUpload('abcdefghijk', 'user', parts),
      ).rejects.toThrow('InternalError');
    });

    it('should delete the object and fail with file_too_large when the real size exceeds the limit', async () => {
      storage.headObject.mockResolvedValue({ contentLength: 100 * MIB + 1 });

      await expect(
        service.completeUpload('abcdefghijk', 'user', parts),
      ).rejects.toBeInstanceOf(VideoTooLargeException);
      expect(storage.deletePrefix).toHaveBeenCalledWith('videos/video-id/');
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'video-id', processing_status: VideoProcessingStatus.UPLOADING },
        expect.objectContaining({
          processing_status: VideoProcessingStatus.FAILED,
          failure_reason: 'file_too_large',
        }),
      );
      expect(producer.enqueue).not.toHaveBeenCalled();
    });

    it('should commit processing with the real size before enqueueing', async () => {
      const order: string[] = [];
      repo.update.mockImplementation(async () => {
        order.push('update');
        return { affected: 1 };
      });
      producer.enqueue.mockImplementation(async () => {
        order.push('enqueue');
      });

      await service.completeUpload('abcdefghijk', 'user', parts);

      expect(order).toEqual(['update', 'enqueue']);
      expect(repo.update).toHaveBeenCalledWith(
        { id: 'video-id', processing_status: VideoProcessingStatus.UPLOADING },
        expect.objectContaining({
          processing_status: VideoProcessingStatus.PROCESSING,
          size_bytes: 20 * MIB,
          upload_id: null,
          uploaded_at: expect.any(Date),
        }),
      );
      expect(producer.enqueue).toHaveBeenCalledWith('video-id');
    });

    it('should mark the video failed with enqueue_failed when enqueueing fails', async () => {
      producer.enqueue.mockRejectedValue(new Error('redis down'));

      await expect(
        service.completeUpload('abcdefghijk', 'user', parts),
      ).rejects.toBeInstanceOf(ProcessingEnqueueFailedException);
      expect(repo.update).toHaveBeenLastCalledWith('video-id', {
        processing_status: VideoProcessingStatus.FAILED,
        failure_reason: 'enqueue_failed',
      });
    });

    it('should reject with UPLOAD_NOT_IN_PROGRESS when a concurrent transition won', async () => {
      repo.update.mockResolvedValue({ affected: 0 });

      await expect(
        service.completeUpload('abcdefghijk', 'user', parts),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
      expect(producer.enqueue).not.toHaveBeenCalled();
    });
  });

  describe('abortUpload', () => {
    it('should reject when the upload is not in progress', async () => {
      repo.findOne.mockResolvedValue(
        buildVideo({
          processing_status: VideoProcessingStatus.FAILED,
          upload_id: null,
        }),
      );

      await expect(
        service.abortUpload('abcdefghijk', 'user'),
      ).rejects.toBeInstanceOf(UploadNotInProgressException);
      expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
    });

    it('should still mark the video aborted when storage no longer has the upload', async () => {
      repo.findOne.mockResolvedValue(buildVideo());
      storage.abortMultipartUpload.mockRejectedValue(s3Error('NoSuchUpload'));

      await service.abortUpload('abcdefghijk', 'user');

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'video-id', processing_status: VideoProcessingStatus.UPLOADING },
        {
          processing_status: VideoProcessingStatus.FAILED,
          failure_reason: 'upload_aborted',
          upload_id: null,
        },
      );
    });
  });

  describe('delivery', () => {
    const readyVideo = (overrides: Partial<Video> = {}) =>
      buildVideo({
        processing_status: VideoProcessingStatus.READY,
        upload_id: null,
        original_filename: 'aula final.mp4',
        ...overrides,
      });

    it.each([
      VideoProcessingStatus.UPLOADING,
      VideoProcessingStatus.PROCESSING,
      VideoProcessingStatus.FAILED,
    ])(
      'should reject stream and download with VIDEO_NOT_READY while %s',
      async (status) => {
        repo.findOne.mockResolvedValue(
          buildVideo({ processing_status: status }),
        );

        await expect(
          service.getStreamUrl('abcdefghijk', 'user'),
        ).rejects.toBeInstanceOf(VideoNotReadyException);
        await expect(
          service.getDownloadUrl('abcdefghijk', 'user'),
        ).rejects.toBeInstanceOf(VideoNotReadyException);
        expect(storage.presignGetObject).not.toHaveBeenCalled();
      },
    );

    it('should sign the original object for streaming without a download filename', async () => {
      repo.findOne.mockResolvedValue(readyVideo());
      storage.presignGetObject.mockResolvedValue('https://signed/stream');

      const result = await service.getStreamUrl('abcdefghijk', 'user');

      expect(result).toEqual({ url: 'https://signed/stream', expires_in: 900 });
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/video-id/original',
        { expiresIn: 900, downloadFilename: undefined },
      );
    });

    it('should sign the download with the original filename', async () => {
      repo.findOne.mockResolvedValue(readyVideo());
      storage.presignGetObject.mockResolvedValue('https://signed/download');

      const result = await service.getDownloadUrl('abcdefghijk', 'user');

      expect(result).toEqual({
        url: 'https://signed/download',
        expires_in: 900,
      });
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/video-id/original',
        { expiresIn: 900, downloadFilename: 'aula final.mp4' },
      );
    });

    it('should answer VIDEO_NOT_FOUND for a video not owned by the caller', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.getStreamUrl('abcdefghijk', 'other'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { public_id: 'abcdefghijk', channel: { user_id: 'other' } },
      });
    });

    it('should return thumbnail_url null when the video has no thumbnail', async () => {
      repo.findOne.mockResolvedValue(buildVideo());

      const result = await service.findOwned('abcdefghijk', 'user');

      expect(result.thumbnail_url).toBeNull();
      expect(result.processing_status).toBe('uploading');
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });

    it('should presign the thumbnail when the video has one', async () => {
      repo.findOne.mockResolvedValue(
        readyVideo({ thumbnail_key: 'thumbnails/video-id/default.jpg' }),
      );
      storage.presignGetObject.mockResolvedValue('https://signed/thumb');

      const result = await service.findOwned('abcdefghijk', 'user');

      expect(result.thumbnail_url).toBe('https://signed/thumb');
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'thumbnails/video-id/default.jpg',
        { expiresIn: 900 },
      );
    });
  });
});
