// Prisma 7 config. The connection URL for Migrate/CLI lives here (it is no
// longer allowed in schema.prisma). The runtime PrismaClient uses a driver
// adapter — see src/db.js.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
