// Stub environment variables for tests
process.env.REDIS_HOST = "localhost";
process.env.REDIS_PORT = "6379";
process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
process.env.LOG_LEVEL = "ERROR";
process.env.LOG_ENABLED = "true";
process.env.NODE_ENV = "test";
