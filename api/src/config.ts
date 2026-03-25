function parseAllowedOrigins(value: string | undefined): string[] {
  if (!value) {
    return ["http://localhost:5173"];
  }

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret-change-in-production",
  tokenTtlSeconds: 8 * 60 * 60,
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS)
};
