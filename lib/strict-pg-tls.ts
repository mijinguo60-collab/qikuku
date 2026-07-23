import { readFileSync } from 'node:fs';
import { checkServerIdentity, type PeerCertificate } from 'node:tls';

const TLS_URL_PARAMETERS = ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'];

function postgresUrl(connectionUrl: string) {
  const parsed = new URL(connectionUrl);
  if (!parsed.hostname) throw new Error('PostgreSQL connection host is required');
  return parsed;
}

export function connectionStringWithoutTlsParameters(connectionUrl: string) {
  const parsed = postgresUrl(connectionUrl);
  for (const parameter of TLS_URL_PARAMETERS) parsed.searchParams.delete(parameter);
  return parsed.toString();
}

export function strictPostgresTlsConfig(connectionUrl: string, certificatePath: string) {
  const host = postgresUrl(connectionUrl).hostname;
  let ca: string;
  try {
    ca = readFileSync(certificatePath, 'utf8');
  } catch {
    throw new Error('DATABASE_SSL_CA_PATH certificate file is unreadable');
  }

  return {
    ca,
    rejectUnauthorized: true as const,
    // pg intentionally omits TLS SNI for an IP address. The socket upgrade then
    // lacks an identity target unless we pass the real database host explicitly.
    checkServerIdentity: (_servername: string, certificate: PeerCertificate) =>
      checkServerIdentity(host, certificate),
  };
}
