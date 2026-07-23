import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import {
  createLoopbackPrismaUrl,
  probePostgresTls,
  startPostgresTlsTunnel,
  validateTunnelConfiguration,
} from "./postgres-tls-tunnel.mjs";

const sentinelUser = "SENTINEL_USER_MUST_NOT_APPEAR";
const sentinelPassword = "SENTINEL_PASSWORD_MUST_NOT_APPEAR";
const testHost = "127.0.0.1";

function runOpenSsl(args) {
  execFileSync("openssl", args, { stdio: "ignore" });
}

function testUrl(port, query = "") {
  return `postgresql://${sentinelUser}:${sentinelPassword}@${testHost}:${port}/qikuku_test${query}`;
}

async function makeCertificates(directory) {
  const caKey = path.join(directory, "test-ca.key");
  const caCert = path.join(directory, "test-ca.pem");
  const otherCaKey = path.join(directory, "other-ca.key");
  const otherCaCert = path.join(directory, "other-ca.pem");
  runOpenSsl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=qikuku-test-ca", "-keyout", caKey, "-out", caCert]);
  runOpenSsl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=qikuku-other-ca", "-keyout", otherCaKey, "-out", otherCaCert]);

  async function issue(name, san) {
    const key = path.join(directory, `${name}.key`);
    const csr = path.join(directory, `${name}.csr`);
    const cert = path.join(directory, `${name}.pem`);
    const ext = path.join(directory, `${name}.ext`);
    await writeFile(ext, `subjectAltName=${san}\n`, { mode: 0o600 });
    runOpenSsl(["req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=qikuku-test-server", "-keyout", key, "-out", csr]);
    runOpenSsl(["x509", "-req", "-days", "1", "-in", csr, "-CA", caCert, "-CAkey", caKey, "-CAcreateserial", "-out", cert, "-extfile", ext]);
    return { key, cert };
  }

  return { caCert, otherCaCert, good: await issue("good", "IP:127.0.0.1"), badIp: await issue("bad-ip", "IP:127.0.0.2") };
}

async function startMockPostgresSslServer({ certificate, mode = "tls" }) {
  let applicationData = "";
  let resolveApplicationData;
  const rawSockets = new Set();
  const secureSockets = new Set();
  const receivedApplicationData = new Promise((resolve) => { resolveApplicationData = resolve; });
  const secureContext = certificate && tls.createSecureContext({
    cert: await readFile(certificate.cert),
    key: await readFile(certificate.key),
    minVersion: "TLSv1.2",
  });
  const server = net.createServer((socket) => {
    rawSockets.add(socket);
    socket.on("close", () => rawSockets.delete(socket));
    socket.once("data", (request) => {
      if (request.length !== 8 || request.readInt32BE(0) !== 8 || request.readInt32BE(4) !== 80877103) {
        socket.destroy();
        return;
      }
      if (mode === "timeout") return;
      if (mode === "N") {
        socket.end("N");
        return;
      }
      if (mode === "invalid") {
        socket.end("X");
        return;
      }
      if (mode === "extra") {
        socket.end("SX");
        return;
      }
      socket.write("S");
      if (mode === "tls-timeout") return;
      const secureSocket = new tls.TLSSocket(socket, { isServer: true, secureContext });
      secureSockets.add(secureSocket);
      secureSocket.on("close", () => secureSockets.delete(secureSocket));
      secureSocket.on("data", (data) => {
        applicationData += data.toString("utf8");
        resolveApplicationData(applicationData);
      });
      secureSocket.on("error", () => undefined);
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, testHost, resolve);
  });
  const address = server.address();
  return {
    port: address.port,
    receivedApplicationData,
    async close() {
      for (const socket of secureSockets) socket.destroy();
      for (const socket of rawSockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function expectRejected(operation, description) {
  await assert.rejects(operation, Error, description);
}

async function main() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "qikuku-tls-tunnel-"));
  try {
    const certificates = await makeCertificates(directory);
    const goodServer = await startMockPostgresSslServer({ certificate: certificates.good });
    const configuration = {
      directUrl: testUrl(goodServer.port),
      caPath: certificates.caCert,
      privateHosts: testHost,
      tcpTimeoutMs: 400,
      tlsTimeoutMs: 400,
    };

    const preflight = spawnSync(process.execPath, ["scripts/deploy/run-migrations.mjs"], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "production",
        MIGRATION_PREFLIGHT_ONLY: "true",
        DATABASE_DIRECT_URL: configuration.directUrl,
        DATABASE_SSL_CA_PATH: certificates.caCert,
        DATABASE_PRIVATE_HOSTS: testHost,
      },
      encoding: "utf8",
    });
    assert.equal(preflight.status, 0, "offline migrator preflight must pass without a database connection");
    assert.match(preflight.stdout, /Migration preflight passed/, "preflight must report only a safe summary");
    assert.doesNotMatch(`${preflight.stdout}${preflight.stderr}`, new RegExp(`${sentinelUser}|${sentinelPassword}`), "preflight output must not leak sentinel credentials");

    assert.deepEqual(await probePostgresTls(configuration), { authorized: true }, "correct CA and IP SAN must authorize TLS");

    const tunnel = await startPostgresTlsTunnel(configuration);
    assert.equal(tunnel.host, testHost, "tunnel must bind only to loopback");
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host: tunnel.host, port: tunnel.port });
      socket.once("connect", () => socket.write("local-prisma-protocol-test"));
      socket.once("error", reject);
      goodServer.receivedApplicationData.then(resolve, reject);
    });
    await tunnel.close();

    const localUrl = createLoopbackPrismaUrl(testUrl(goodServer.port, "?schema=public&sslmode=verify-full"), 45678, testHost);
    const parsedLocalUrl = new URL(localUrl);
    assert.equal(parsedLocalUrl.hostname, testHost, "derived Prisma URL must remain loopback-only");
    assert.equal(parsedLocalUrl.port, "45678", "derived Prisma URL must use the ephemeral tunnel port");
    assert.equal(parsedLocalUrl.searchParams.get("schema"), "public", "non-TLS query parameters must be preserved");
    assert.equal(parsedLocalUrl.searchParams.get("sslmode"), "disable", "only the in-memory loopback URL may disable TLS");

    await expectRejected(() => probePostgresTls({ ...configuration, caPath: certificates.otherCaCert }), "wrong CA must fail");
    const badIpServer = await startMockPostgresSslServer({ certificate: certificates.badIp });
    await expectRejected(() => probePostgresTls({ ...configuration, directUrl: testUrl(badIpServer.port) }), "IP SAN mismatch must fail");
    await badIpServer.close();

    for (const mode of ["N", "invalid", "extra", "timeout"]) {
      const server = await startMockPostgresSslServer({ certificate: certificates.good, mode });
      await expectRejected(() => probePostgresTls({ ...configuration, directUrl: testUrl(server.port), tcpTimeoutMs: 100, tlsTimeoutMs: 100 }), `server ${mode} response must fail`);
      await server.close();
    }
    await expectRejected(() => probePostgresTls({
      ...configuration,
      tcpTimeoutMs: 50,
      connect: () => new net.Socket(),
    }), "TCP connection timeout must fail");
    const tlsTimeoutServer = await startMockPostgresSslServer({ certificate: certificates.good, mode: "tls-timeout" });
    await expectRejected(() => probePostgresTls({ ...configuration, directUrl: testUrl(tlsTimeoutServer.port), tlsTimeoutMs: 100 }), "TLS handshake timeout must fail");
    await tlsTimeoutServer.close();

    await expectRejected(() => validateTunnelConfiguration({ ...configuration, caPath: path.join(directory, "missing.pem") }), "missing CA must fail");
    const unreadable = path.join(directory, "unreadable.pem");
    await writeFile(unreadable, "not-a-ca", { mode: 0o600 });
    await chmod(unreadable, 0o000);
    await expectRejected(() => validateTunnelConfiguration({ ...configuration, caPath: unreadable }), "unreadable CA must fail");
    await chmod(unreadable, 0o600);

    for (const invalidUrl of [
      "postgresql://user:password@8.8.8.8:5432/qikuku",
      "postgresql://user:password@host.neon.tech:5432/qikuku",
      testUrl(goodServer.port, "?sslmode=disable"),
      testUrl(goodServer.port, "?sslmode=no-verify"),
      testUrl(goodServer.port, "?sslaccept=accept_invalid_certs"),
      testUrl(goodServer.port, "?rejectUnauthorized=false"),
      testUrl(goodServer.port, "?sslmode=require"),
    ]) {
      await expectRejected(() => validateTunnelConfiguration({ ...configuration, directUrl: invalidUrl }), "unsafe endpoint or TLS URL must fail");
    }
    await expectRejected(() => startPostgresTlsTunnel({ ...configuration, listenHost: "0.0.0.0" }), "non-loopback listener must fail");
    await goodServer.close();
    console.log("PostgreSQL TLS tunnel offline tests passed.");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "TLS tunnel test failed.");
  process.exitCode = 1;
});
