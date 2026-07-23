import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  createLoopbackPrismaUrl,
  probePostgresTls,
  startPostgresTlsTunnel,
  validateTunnelConfiguration,
} from "./postgres-tls-tunnel.mjs";

const root = process.cwd();
const prismaCli = path.join(root, "node_modules/.bin/prisma");
const schemaPath = path.join(root, "prisma/schema.prisma");
const migrationsPath = path.join(root, "prisma/migrations");
const preflightOnly = process.env.MIGRATION_PREFLIGHT_ONLY === "true";
const probeOnly = process.env.MIGRATION_TLS_PROBE_ONLY === "true";

function fail(message) {
  throw new Error(message);
}

function requiredEnvironment() {
  if (process.env.NODE_ENV !== "production") fail("Migrator requires NODE_ENV=production.");
  if (!process.env.DATABASE_DIRECT_URL) fail("DATABASE_DIRECT_URL is required.");
  if (!process.env.DATABASE_SSL_CA_PATH) fail("DATABASE_SSL_CA_PATH is required.");
  return {
    directUrl: process.env.DATABASE_DIRECT_URL,
    caPath: process.env.DATABASE_SSL_CA_PATH,
    privateHosts: process.env.DATABASE_PRIVATE_HOSTS,
    tcpTimeoutMs: 5_000,
    tlsTimeoutMs: 5_000,
  };
}

async function assertLocalInputs() {
  await access(prismaCli);
  await access(schemaPath);
  const migrationDirectories = (await readdir(migrationsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory());
  if (migrationDirectories.length !== 6) fail("Migrator requires the complete six-directory migration history.");
}

function minimalPrismaEnvironment(url) {
  return {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: process.env.HOME || "/app",
    NODE_ENV: "production",
    PRISMA_MIGRATION_DATABASE_URL: url,
  };
}

async function runPrisma(arguments_, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(prismaCli, arguments_, { cwd: root, env: environment, stdio: "ignore" });
    child.once("error", () => reject(new Error("Local Prisma CLI could not start.")));
    child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

async function runPreflight(configuration) {
  await validateTunnelConfiguration(configuration);
  await assertLocalInputs();
  const localUrl = createLoopbackPrismaUrl(configuration.directUrl, 1, configuration.privateHosts);
  const result = await runPrisma(["validate"], minimalPrismaEnvironment(localUrl));
  if (result.code !== 0) fail("Local Prisma CLI or schema engine preflight failed.");
  console.log("Migration preflight passed.");
}

async function main() {
  if (preflightOnly && probeOnly) fail("Only one migrator safety mode may be selected.");
  const configuration = requiredEnvironment();

  if (preflightOnly) {
    await runPreflight(configuration);
    return;
  }
  if (probeOnly) {
    await probePostgresTls(configuration);
    console.log("Migration TLS probe passed.");
    return;
  }
  if (process.argv[2] !== "--apply") fail("Refusing migration without --apply.");

  await assertLocalInputs();
  const tunnel = await startPostgresTlsTunnel(configuration);
  const localUrl = createLoopbackPrismaUrl(configuration.directUrl, tunnel.port, configuration.privateHosts);
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await tunnel.close();
  };
  process.once("SIGTERM", () => stop().finally(() => process.exit(143)));
  process.once("SIGINT", () => stop().finally(() => process.exit(130)));

  try {
    const result = await runPrisma(["migrate", "deploy"], minimalPrismaEnvironment(localUrl));
    if (result.code !== 0) process.exitCode = result.code;
  } finally {
    await stop();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migrator failed.");
  process.exitCode = 2;
});
