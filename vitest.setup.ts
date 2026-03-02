import { execSync } from "node:child_process";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "file:./prisma/test.db";

try {
  execSync("npx prisma db push --skip-generate", {
    stdio: "ignore",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
} catch {
  // best effort in CI/local
}
