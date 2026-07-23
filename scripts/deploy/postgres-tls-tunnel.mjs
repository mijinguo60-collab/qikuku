import { access, lstat, readFile } from "node:fs/promises";
import net from "node:net";
import tls from "node:tls";

const SSL_REQUEST_CODE = 80877103;
const TLS_QUERY_PARAMETERS = new Set([
  "ssl",
  "sslmode",
  "sslaccept",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslidentity",
  "sslpassword",
  "rejectunauthorized",
]);

function fail(message) {
  return new Error(message);
}

function isPrivateIpv4(hostname) {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((value) => value > 255)) return false;
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168);
}

function isIpAddress(hostname) {
  return net.isIP(hostname) !== 0;
}

function allowedPrivateHosts(value) {
  return new Set((value || "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

function assertSafePostgresUrl(value, privateHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw fail("DATABASE_DIRECT_URL must be a PostgreSQL URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw fail("DATABASE_DIRECT_URL must be a PostgreSQL URL.");
  }

  const host = url.hostname.toLowerCase();
  if (!host || host.endsWith(".neon.tech")) {
    throw fail("Database host is not permitted for production migration.");
  }

  if (!isPrivateIpv4(host) && !privateHosts.has(host)) {
    throw fail("Database host is not a permitted private endpoint.");
  }

  for (const [rawKey, rawValue] of url.searchParams) {
    const key = rawKey.toLowerCase();
    const valueLower = rawValue.toLowerCase();
    if (key === "sslmode" && valueLower !== "verify-full") {
      throw fail("DATABASE_DIRECT_URL contains an unsafe TLS option.");
    }
    if (key === "sslaccept" && valueLower === "accept_invalid_certs") {
      throw fail("DATABASE_DIRECT_URL contains an unsafe TLS option.");
    }
    if (key === "rejectunauthorized" && valueLower === "false") {
      throw fail("DATABASE_DIRECT_URL contains an unsafe TLS option.");
    }
    if (TLS_QUERY_PARAMETERS.has(key) && key !== "sslmode" && key !== "sslaccept" && key !== "rejectunauthorized") {
      throw fail("DATABASE_DIRECT_URL must not embed TLS material.");
    }
  }

  return url;
}

export async function validateTunnelConfiguration({ directUrl, caPath, privateHosts }) {
  const url = assertSafePostgresUrl(directUrl, allowedPrivateHosts(privateHosts));
  if (!caPath || !caPath.startsWith("/")) {
    throw fail("DATABASE_SSL_CA_PATH must be an absolute path.");
  }

  let metadata;
  try {
    metadata = await lstat(caPath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw fail("DATABASE_SSL_CA_PATH must be a regular file.");
    await access(caPath);
    await readFile(caPath);
  } catch (error) {
    if (error instanceof Error && error.message === "DATABASE_SSL_CA_PATH must be a regular file.") throw error;
    throw fail("DATABASE_SSL_CA_PATH is missing or unreadable.");
  }

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    databasePresent: url.pathname.length > 1,
    directUrl: url,
  };
}

function onceError(socket) {
  return new Promise((_, reject) => socket.once("error", () => reject(fail("PostgreSQL TLS connection failed."))));
}

function destroyQuietly(socket) {
  if (socket && !socket.destroyed) socket.destroy();
}

async function requestPostgresTls(configuration, { tcpTimeoutMs, tlsTimeoutMs, connect = net.connect }) {
  const ca = await readFile(configuration.caPath);
  const tcpSocket = connect({ host: configuration.host, port: configuration.port });
  let tlsSocket;

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail("PostgreSQL TCP connection timed out.")), tcpTimeoutMs);
      tcpSocket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      tcpSocket.once("error", () => {
        clearTimeout(timer);
        reject(fail("PostgreSQL TCP connection failed."));
      });
    });

    const request = Buffer.alloc(8);
    request.writeInt32BE(8, 0);
    request.writeInt32BE(SSL_REQUEST_CODE, 4);
    tcpSocket.write(request);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail("PostgreSQL SSLRequest timed out.")), tcpTimeoutMs);
      const onError = () => {
        clearTimeout(timer);
        reject(fail("PostgreSQL SSLRequest failed."));
      };
      tcpSocket.once("error", onError);
      tcpSocket.once("data", (chunk) => {
        clearTimeout(timer);
        tcpSocket.removeListener("error", onError);
        if (chunk.length !== 1 || chunk[0] !== 0x53) {
          reject(fail("PostgreSQL server did not accept a strict TLS upgrade."));
          return;
        }
        resolve();
      });
    });

    const tlsOptions = {
      socket: tcpSocket,
      ca,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      checkServerIdentity: (_servername, certificate) => tls.checkServerIdentity(configuration.host, certificate),
    };
    if (!isIpAddress(configuration.host)) tlsOptions.servername = configuration.host;
    tlsSocket = tls.connect(tlsOptions);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(fail("PostgreSQL TLS handshake timed out.")), tlsTimeoutMs);
      tlsSocket.once("secureConnect", () => {
        clearTimeout(timer);
        if (!tlsSocket.authorized) {
          reject(fail("PostgreSQL TLS certificate verification failed."));
          return;
        }
        resolve();
      });
      tlsSocket.once("error", () => {
        clearTimeout(timer);
        reject(fail("PostgreSQL TLS certificate verification failed."));
      });
    });

    return { tcpSocket, tlsSocket };
  } catch (error) {
    destroyQuietly(tlsSocket);
    destroyQuietly(tcpSocket);
    throw error instanceof Error ? error : fail("PostgreSQL TLS connection failed.");
  }
}

export async function probePostgresTls(options) {
  const checked = await validateTunnelConfiguration(options);
  const connection = await requestPostgresTls({ ...checked, caPath: options.caPath }, options);
  destroyQuietly(connection.tlsSocket);
  return { authorized: true };
}

export async function startPostgresTlsTunnel(options) {
  const checked = await validateTunnelConfiguration(options);
  const listenHost = options.listenHost || "127.0.0.1";
  if (listenHost !== "127.0.0.1") throw fail("Migration TLS tunnel may listen only on 127.0.0.1.");

  const localSockets = new Set();
  const remoteSockets = new Set();
  const server = net.createServer((localSocket) => {
    localSockets.add(localSocket);
    localSocket.pause();
    localSocket.on("error", () => undefined);
    localSocket.on("close", () => localSockets.delete(localSocket));

    requestPostgresTls({ ...checked, caPath: options.caPath }, options)
      .then(({ tlsSocket }) => {
        remoteSockets.add(tlsSocket);
        tlsSocket.on("error", () => destroyQuietly(localSocket));
        tlsSocket.on("close", () => remoteSockets.delete(tlsSocket));
        localSocket.on("end", () => tlsSocket.end());
        tlsSocket.on("end", () => localSocket.end());
        localSocket.pipe(tlsSocket);
        tlsSocket.pipe(localSocket);
        localSocket.resume();
      })
      .catch(() => destroyQuietly(localSocket));
  });
  server.on("error", () => undefined);

  await new Promise((resolve, reject) => {
    server.once("error", () => reject(fail("Migration TLS tunnel failed to listen.")));
    server.listen(0, listenHost, () => {
      server.removeAllListeners("error");
      server.on("error", () => undefined);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") {
    await new Promise((resolve) => server.close(resolve));
    throw fail("Migration TLS tunnel did not bind to loopback.");
  }

  return {
    host: "127.0.0.1",
    port: address.port,
    async close() {
      for (const socket of localSockets) destroyQuietly(socket);
      for (const socket of remoteSockets) destroyQuietly(socket);
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

export function createLoopbackPrismaUrl(directUrl, port, privateHosts) {
  const url = assertSafePostgresUrl(directUrl, allowedPrivateHosts(privateHosts));
  for (const key of [...url.searchParams.keys()]) {
    const normalized = key.toLowerCase();
    if (TLS_QUERY_PARAMETERS.has(normalized) || normalized.startsWith("ssl")) url.searchParams.delete(key);
  }
  url.hostname = "127.0.0.1";
  url.port = String(port);
  url.searchParams.set("sslmode", "disable");
  return url.toString();
}
