import "dotenv/config";
import { defineConfig } from "prisma/config";

const buildSafeDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://ejls_build:ejls_build@127.0.0.1:5432/ejls_build";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: buildSafeDatabaseUrl,
  },
});
