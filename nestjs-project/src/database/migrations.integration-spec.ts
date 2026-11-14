import { DataSource } from 'typeorm';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { CreateVideos1794571199100 } from './migrations/1794571199100-CreateVideos';
import { createTestDataSource } from '../test/create-test-data-source';

const MIGRATIONS = [
  CreateUsersAndChannels1775687773260,
  CreateAuthTokens1777579850478,
  CreateVideos1794571199100,
];

const MIGRATED_TABLES = [
  'channels',
  'refresh_tokens',
  'users',
  'verification_tokens',
  'videos',
];

const VIDEO_ENUM_TYPES = [
  'videos_editorial_status_enum',
  'videos_processing_status_enum',
];

async function listPublicTables(dataSource: DataSource): Promise<string[]> {
  const rows = await dataSource.query<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename`,
  );
  return rows.map((r) => r.tablename);
}

async function listPublicEnumTypes(dataSource: DataSource): Promise<string[]> {
  const rows = await dataSource.query<{ typname: string }[]>(
    `SELECT t.typname FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE t.typtype = 'e' AND n.nspname = 'public'
     ORDER BY t.typname`,
  );
  return rows.map((r) => r.typname);
}

// Drops every table and enum type in the public schema, one statement at a
// time, so leftovers from any migration (including enum types that outlive
// their tables) can never make CREATE TYPE fail on the next run.
async function resetPublicSchema(dataSource: DataSource): Promise<void> {
  for (const table of await listPublicTables(dataSource)) {
    await dataSource.query(`DROP TABLE IF EXISTS "public"."${table}" CASCADE`);
  }
  for (const type of await listPublicEnumTypes(dataSource)) {
    await dataSource.query(`DROP TYPE IF EXISTS "public"."${type}" CASCADE`);
  }
}

describe('Database migrations (integration)', () => {
  let dataSource: DataSource | undefined;

  beforeAll(async () => {
    // Migrations are raw SQL; no entity metadata is needed (and loading a
    // partial entity set breaks on relations such as Channel#videos).
    dataSource = createTestDataSource([], {
      synchronize: false,
      migrations: MIGRATIONS,
    });

    await dataSource.initialize();
    await resetPublicSchema(dataSource);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    try {
      // Re-apply whatever the tests reverted (or never ran) so the shared DB
      // is fully migrated for the suites that run after this one.
      await dataSource.runMigrations();
    } finally {
      await dataSource.destroy();
    }
  });

  it('should leave no tables or enum types in the public schema after reset', async () => {
    const ds = dataSource!;

    expect(await listPublicTables(ds)).toEqual([]);
    expect(await listPublicEnumTypes(ds)).toEqual([]);
  });

  it('should apply all migrations and create all tables', async () => {
    const ds = dataSource!;

    const ranMigrations = await ds.runMigrations();

    expect(ranMigrations).toHaveLength(MIGRATIONS.length);
    const tables = await listPublicTables(ds);
    expect(tables).toEqual(expect.arrayContaining(MIGRATED_TABLES));
    expect(await listPublicEnumTypes(ds)).toEqual(
      expect.arrayContaining([
        ...VIDEO_ENUM_TYPES,
        'verification_tokens_type_enum',
      ]),
    );
  });

  it('should revert the last migration and remove the videos table and its enum types', async () => {
    const ds = dataSource!;

    await ds.undoLastMigration();

    const tables = await listPublicTables(ds);
    expect(tables).not.toContain('videos');
    expect(tables).toEqual(
      expect.arrayContaining([
        'channels',
        'refresh_tokens',
        'users',
        'verification_tokens',
      ]),
    );
    const enumTypes = await listPublicEnumTypes(ds);
    for (const type of VIDEO_ENUM_TYPES) {
      expect(enumTypes).not.toContain(type);
    }
  });
});
