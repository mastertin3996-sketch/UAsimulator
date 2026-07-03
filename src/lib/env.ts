import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL:    z.string().min(1, "DATABASE_URL is required — see .env.example"),
  NEXTAUTH_SECRET: z.string().min(1, "NEXTAUTH_SECRET is required — generate with: openssl rand -base64 32"),
  NEXTAUTH_URL:    z.string().min(1, "NEXTAUTH_URL is required — e.g. http://localhost:3000"),
  CRON_SECRET:     z.string().min(1, "CRON_SECRET is required — protects /api/cron/tick"),
});

/** Throws a single clear error listing every missing/invalid required env var, instead of
 *  letting each library fail separately with its own (often cryptic) error later on. */
export function validateEnv(): void {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid/missing environment variables:\n${issues}`);
  }
}
