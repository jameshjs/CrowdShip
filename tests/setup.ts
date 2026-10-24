// Always the isolated test database, never the dev database from .env.
process.env.DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/crowdship_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";
process.env.LOG_LEVEL ??= "error";
