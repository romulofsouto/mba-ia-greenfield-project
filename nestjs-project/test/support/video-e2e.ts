import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../../src/common/filters/validation-exception.filter';
import { MailService } from '../../src/mail/mail.service';
import { overrideQueuePrefix } from '../../src/test/video-app-config';

// Boots AppModule the way main.ts does (global pipe + filters), with BullMQ
// pointed at a suite-specific prefix. `customize` can override providers.
export async function createVideoE2eApp(
  queuePrefix: string,
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<INestApplication<App>> {
  const moduleFixture = await customize(
    overrideQueuePrefix(
      Test.createTestingModule({ imports: [AppModule] }),
      queuePrefix,
    ),
  ).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new DomainExceptionFilter(),
    new ValidationExceptionFilter(),
  );
  await app.init();
  return app;
}

export function clearThrottling(app: INestApplication<App>): void {
  app.get<ThrottlerStorageService>(ThrottlerStorage).storage.clear();
}

// Registers a user (which creates its channel), confirms the e-mail with the
// token captured from the mail service and logs in. Returns the access token.
export async function registerConfirmAndLogin(
  app: INestApplication<App>,
  email: string,
  password = 'password123',
): Promise<string> {
  const mailService = app.get(MailService);
  let token = '';
  const spy = jest
    .spyOn(mailService, 'sendConfirmationEmail')
    .mockImplementationOnce((_e: string, _n: string, t: string) => {
      token = t;
      return Promise.resolve();
    });
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);
  spy.mockRestore();

  await request(app.getHttpServer())
    .get('/auth/confirm-email')
    .query({ token })
    .expect(204);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  const body = res.body as { access_token?: unknown };
  if (typeof body.access_token !== 'string') {
    throw new Error('Login response did not include an access_token');
  }
  return body.access_token;
}
