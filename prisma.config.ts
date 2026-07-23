import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// The production migrator supplies a loopback-only URL after it has established
// its own strictly verified TLS connection to TencentDB. Do not load dotenv in
// production: Prisma must never see the remote direct URL there.
if (process.env.NODE_ENV !== "production") {
  config({ path: ".env" });
  config({ path: ".env.local", override: true });
}

const migrationUrl = process.env["PRISMA_MIGRATION_DATABASE_URL"];
const directUrl = process.env["DATABASE_DIRECT_URL"];

if (process.env.NODE_ENV === "production" && !migrationUrl) {
  throw new Error("PRISMA_MIGRATION_DATABASE_URL is required for production Prisma commands.");
}

if (!migrationUrl && !directUrl) {
  throw new Error("DATABASE_DIRECT_URL is required outside production when no migration URL is supplied.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl ?? directUrl!,
  },
});
