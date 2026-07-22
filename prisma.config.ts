import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma CLI commands (migration/status/validate) use the direct PostgreSQL
// endpoint. Load .env first, then let a local or deployment-specific override
// supply DATABASE_DIRECT_URL without changing the application's runtime URL.
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
