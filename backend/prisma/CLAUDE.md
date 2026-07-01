# backend/prisma/CLAUDE.md

Rules for `schema.prisma` and all migrations. Read before touching the schema.

## The Schema Is Fixed

The 8-table schema is defined in `JobHuntPK_v7_Final.md` Section 8.
Do not add, remove, or rename any field without explicit instruction.
The first migration must include all 8 tables with all fields and all indexes.

## 8 Tables

`User` `Resume` `Job` `JobMatch` `Application` `Interview` `SchedulerLog`

The 8th table is `FlaggedJob` — reserved for future use. Do NOT create it now.

## Critical Field Rules — Must Be Present in First Migration

### User
```prisma
salaryCurrency     String  @default("USD")   // "PKR" | "USD" — never omit
wantsRemote        Boolean @default(true)
wantsOnsiteKarachi Boolean @default(false)
homeLat            Float?                    // geocoded once when homeArea saved
homeLng            Float?
homeArea           String?                   // display string only
```

### Job — Two Separate Fields for Two Different Meanings
```prisma
locationType    String    // "Remote" | "Onsite" | "Hybrid" — location eligibility
employmentType  String?   // "full-time" | "contract" | "part-time" — employment terms
```
**Never merge these. Never call the location field `jobType`.**

```prisma
salaryCurrency  String   @default("USD")  // "PKR" | "USD"
salaryMin       Int?     // raw value in original currency
salaryMax       Int?     // raw value in original currency
// NO salaryMinUSD or salaryMaxUSD — USD computed at match time, never stored
city            String?  // normalized lowercase — "karachi" or null for Remote
rawLocation     String?  // original string from source for debugging
expiresAt       DateTime // set in normalizeJob(), never null, no @default needed
```

### JobMatch
```prisma
locationType  String  // denormalized from Job — never join to get this
```

### Application
```prisma
locationType  String  // denormalized from Job — never join to get this
```

### Interview
```prisma
officeAddress  String?  // for onsite map link in reminder email
```

### SchedulerLog
```prisma
sourceBreakdown  Json?  // { remotive: 120, rozee: 0, mustakbil: 45 }
```

## Required Indexes

```prisma
// Job
@@index([isActive, locationType])
@@index([isActive, expiresAt])
@@index([isActive, fetchedAt])

// JobMatch
@@index([userId, matchScore])
@@index([userId, locationType])

// Application
@@index([userId, status])
@@index([userId, appliedAt])
@@index([userId, locationType])
@@index([jobId])

// Interview
@@index([userId, scheduledAt])
@@index([reminderSent, scheduledAt])
@@index([userId])

// SchedulerLog
@@index([jobName, ranAt])
```

Every foreign key column must also have an index.

## Migration Rules

- First migration: `npx prisma migrate dev --name init`
- Production: `npx prisma migrate deploy` (runs in start command)
- Never edit a migration file after committing it
- Never use `prisma db push` — always use migrations
- Never use `prisma.$executeRaw` or `prisma.$queryRaw`
- One PrismaClient instance — import from `src/db.js`, never create inline

## Cascade Deletes

All user-owned data must cascade on user delete:
```prisma
user User @relation(fields: [userId], references: [id], onDelete: Cascade)
```

Apply to: Resume, Application, JobMatch, Interview.

## DATABASE_URL Connection Pool

Append to the Railway-injected DATABASE_URL:
```
?connection_limit=10&pool_timeout=20
```