import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/entities/channel.entity';
import databaseConfig from '../config/database.config';
import { envValidationSchema } from '../config/env.validation';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { MediaModule } from '../media/media.module';
import { QueueModule } from '../queue/queue.module';
import { QUEUES } from '../queue/queue.constants';
import { StorageModule } from '../storage/storage.module';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { UploadCleanupProcessor } from '../videos/upload-cleanup.processor';
import { UploadCleanupService } from '../videos/upload-cleanup.service';
import { VideoProcessingProcessor } from '../videos/video-processing.processor';
import { MaintenanceScheduler } from './maintenance-scheduler';

// Background worker process (no HTTP): consumes the video queues. Only the
// worker registers processors, so the API never consumes jobs.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, storageConfig, queueConfig, videoConfig],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [databaseConfig.KEY],
      useFactory: (dbConfig: ConfigType<typeof databaseConfig>) => ({
        type: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        username: dbConfig.username,
        password: dbConfig.password,
        database: dbConfig.name,
        // Video's relation chain (Video → Channel → User) must be registered.
        entities: [Video, Channel, User],
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature([Video]),
    StorageModule,
    MediaModule,
    QueueModule,
    QueueModule.registerConsumerQueue(QUEUES.VIDEO_PROCESSING),
    QueueModule.registerConsumerQueue(QUEUES.VIDEO_MAINTENANCE),
  ],
  providers: [
    VideoProcessingProcessor,
    UploadCleanupService,
    UploadCleanupProcessor,
    MaintenanceScheduler,
  ],
})
export class WorkerModule {}
