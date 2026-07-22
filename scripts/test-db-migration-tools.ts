import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const root = process.cwd();
  const [inspect, verify, configure, migrate] = await Promise.all([
    readFile(path.join(root, 'scripts/db/inspect-source-postgres.ts'), 'utf8'),
    readFile(path.join(root, 'scripts/db/verify-migration.ts'), 'utf8'),
    readFile(path.join(root, 'scripts/db/configure-domestic-db.sh'), 'utf8'),
    readFile(path.join(root, 'scripts/db/migrate-postgres.sh'), 'utf8'),
  ]);
  assert.match(inspect, /ep-snowy-tooth-ata0virv\.c-9\.us-east-1\.aws\.neon\.tech/);
  assert.match(inspect, /readonly: true/);
  assert.match(await readFile(path.join(root, 'scripts/db/benchmark-postgres.ts'), 'utf8'), /--source-test/);
  assert.match(verify, /assert\.notEqual\(source\.href, target\.href/);
  assert.match(verify, /target\.hostname\.includes\('neon\.tech'\), false/);
  assert.match(configure, /read -r -s/);
  assert.match(configure, /<host> <port> <database> <username> <ca-certificate-path>/);
  assert.match(configure, /DATABASE_SSL_CA_PATH/);
  assert.match(configure, /rejectUnauthorized: true/);
  assert.match(configure, /sslrootcert/);
  assert.match(configure, /\.local-backups/);
  assert.doesNotMatch(configure, /console\.log\(.*target_url/);
  assert.match(migrate, /CONFIRM_DOMESTIC_DB_MIGRATION/);
  assert.match(migrate, /pg_dump/);
  assert.match(migrate, /pg_restore/);
  assert.match(migrate, /TARGET_DATABASE_SSL_CA_PATH/);
  assert.match(migrate, /sslrootcert=system/);
  assert.match(migrate, /PGSERVICEFILE/);
  assert.match(migrate, /PGPASSFILE/);
  assert.doesNotMatch(migrate, /pg_dump --dbname="\$SOURCE_DATABASE_URL"/);
  assert.match(migrate, /migration_succeeded=false/);
  assert.match(migrate, /chmod 600 "\$dump_file"/);
  const localMigrator = await readFile(path.join(root, 'scripts/db/migrate-current-local.ts'), 'utf8');
  assert.match(localMigrator, /latestNeonBackup/);
  assert.match(localMigrator, /ep-snowy-tooth-ata0virv\.c-9\.us-east-1\.aws\.neon\.tech/);
  assert.match(localMigrator, /spawnSync\('bash'/);
  assert.doesNotMatch(localMigrator, /console\.log\(.*DATABASE/);
  assert.match(migrate, /Unsafe source\/target endpoints/);
  console.log('domestic PostgreSQL migration tool safety tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
