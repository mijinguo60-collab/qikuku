import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { connectionStringWithoutTlsParameters, strictPostgresTlsConfig } from '@/lib/strict-pg-tls';

const testUrl = 'postgresql://test-user:test-password@10.12.1.20:5432/qikuku_test?schema=public&sslmode=verify-full&sslrootcert=%2Fignored';

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'qikuku-pg-tls-'));
  const certificatePath = path.join(directory, 'test-ca.pem');
  try {
    await writeFile(certificatePath, 'test CA only', { mode: 0o600 });

    const sanitized = new URL(connectionStringWithoutTlsParameters(testUrl));
    assert.equal(sanitized.searchParams.get('schema'), 'public', 'non-TLS URL parameters must be preserved');
    for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey']) {
      assert.equal(sanitized.searchParams.has(parameter), false, `${parameter} must not override explicit TLS options`);
    }

    const tls = strictPostgresTlsConfig(testUrl, certificatePath);
    assert.equal(tls.rejectUnauthorized, true, 'strict TLS must reject untrusted certificates');
    assert.equal(
      strictPostgresTlsConfig(testUrl.replace('sslmode=verify-full', 'sslmode=disable'), certificatePath).rejectUnauthorized,
      true,
      'a URL TLS parameter must never downgrade explicit strict TLS options',
    );
    assert.equal(
      tls.checkServerIdentity('ignored-by-pg-for-ip', { subject: { CN: 'ignored' }, subjectaltname: 'IP Address:10.12.1.20' } as any),
      undefined,
      'identity validation must use the database host, not pg TLS servername fallback',
    );
    assert.ok(
      tls.checkServerIdentity('ignored-by-pg-for-ip', { subject: { CN: 'ignored' }, subjectaltname: 'IP Address:10.12.1.21' } as any) instanceof Error,
      'a non-matching IP SAN must be rejected',
    );
    assert.throws(
      () => strictPostgresTlsConfig(testUrl, path.join(directory, 'missing-ca.pem')),
      /certificate file is unreadable/,
      'a missing CA must fail without TLS downgrade',
    );

    console.log('strict PostgreSQL TLS configuration tests passed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'strict PostgreSQL TLS configuration test failed');
  process.exitCode = 1;
});
