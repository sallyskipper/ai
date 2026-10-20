import { execSync } from "child_process";

export default function setup() {
  const env = {
    ...process.env,
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://redline:redline@localhost:5432/redline_test",
    SEED_DEMO: "false",
  };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}
