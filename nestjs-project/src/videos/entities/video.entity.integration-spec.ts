import { randomUUID } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { User } from '../../users/entities/user.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import {
  Video,
  VideoEditorialStatus,
  VideoProcessingStatus,
} from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let counter = 0;
  async function createChannel(): Promise<Channel> {
    const n = ++counter;
    const user = await userRepository.save(
      userRepository.create({
        email: `video_user_${n}@example.com`,
        password: 'hashed',
      }),
    );
    return channelRepository.save(
      channelRepository.create({
        name: `Chan ${n}`,
        nickname: `video_chan_${n}`,
        user_id: user.id,
      }),
    );
  }

  function buildVideo(
    channelId: string,
    overrides: Partial<Video> = {},
  ): Partial<Video> {
    const id = randomUUID();
    return {
      id,
      public_id: 'abcDEF_12-x',
      channel_id: channelId,
      title: 'aula',
      original_filename: 'aula.mp4',
      mime_type: 'video/mp4',
      size_bytes: 1024,
      storage_key: `videos/${id}/original`,
      ...overrides,
    };
  }

  it('should default to uploading/draft when only required fields are set', async () => {
    const channel = await createChannel();
    const saved = await videoRepository.save(
      videoRepository.create(buildVideo(channel.id)),
    );

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.processing_status).toBe(VideoProcessingStatus.UPLOADING);
    expect(found.editorial_status).toBe(VideoEditorialStatus.DRAFT);
    expect(found.upload_id).toBeNull();
    expect(found.thumbnail_key).toBeNull();
    expect(found.duration_seconds).toBeNull();
    expect(found.failure_reason).toBeNull();
  });

  it('should reject two videos with the same public_id', async () => {
    const channel = await createChannel();
    await videoRepository.save(
      videoRepository.create(
        buildVideo(channel.id, { public_id: 'dupDUP12345' }),
      ),
    );

    await expect(
      videoRepository.save(
        videoRepository.create(
          buildVideo(channel.id, { public_id: 'dupDUP12345' }),
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('should reject a video whose channel_id does not exist', async () => {
    await expect(
      videoRepository.save(videoRepository.create(buildVideo(randomUUID()))),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('should persist and read size_bytes above 2^32 without precision loss', async () => {
    const channel = await createChannel();
    const saved = await videoRepository.save(
      videoRepository.create(
        buildVideo(channel.id, { size_bytes: 10737418240 }),
      ),
    );

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.size_bytes).toBe(10737418240);
  });

  it('should load the owning channel and list videos from the channel side', async () => {
    const channel = await createChannel();
    const saved = await videoRepository.save(
      videoRepository.create(buildVideo(channel.id)),
    );

    const video = await videoRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['channel'],
    });
    expect(video.channel.id).toBe(channel.id);

    const withVideos = await channelRepository.findOneOrFail({
      where: { id: channel.id },
      relations: ['videos'],
    });
    expect(withVideos.videos.map((v) => v.id)).toEqual([saved.id]);
  });
});
