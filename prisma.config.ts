import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma CLI commands (migration/status/validate) must use the direct Neon
// endpoint. Load .env first, then let the local development override supply
// DATABASE_DIRECT_URL without changing the application's pooled runtime URL.
config({ path: ".env" });
config({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_DIRECT_URL"]!,
  },
});
