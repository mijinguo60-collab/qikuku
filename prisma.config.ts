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

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl ?? directUrl,
  },
});
