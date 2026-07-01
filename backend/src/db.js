// Prisma singleton — one PrismaClient for the whole process.
// Prisma 7 has no Rust query engine; a driver adapter supplies the connection.
// Never instantiate PrismaClient anywhere else; import this.
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

// With the driver adapter, pg (not Prisma) owns the pool, so the
// connection_limit=10 / pool_timeout=20 URL params are ignored by libpq.
// Enforce them explicitly here to match the documented DATABASE_URL contract.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 20000,
});

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
});

module.exports = prisma;
