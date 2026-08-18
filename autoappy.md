# ProBot / Nasiqa â€” Technical Architecture Document

**Version**: 1.0
**Date**: 2026-08-13
**Scope**: End-to-end technical architecture â€” workflow creation, bot execution, live browser streaming, CAPTCHA handling, human resolution, backend design
**Source**: 100% code-verified from actual repository (no assumptions)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Repository Layout](#2-repository-layout)
3. [Workflow Creation](#3-workflow-creation)
4. [Bot Architecture](#4-bot-architecture)
5. [Live Browser Streaming](#5-live-browser-streaming)
6. [Form Filling (Crawler Engine)](#6-form-filling-crawler-engine)
7. [CAPTCHA Detection & Handling](#7-captcha-detection--handling)
8. [Human Verification Flow](#8-human-verification-flow)
9. [Backend Architecture](#9-backend-architecture)
10. [Session Management (SSPOM)](#10-session-management-sspom)
11. [Data Flow: Job â†’ Outcome](#11-data-flow-job--outcome)
12. [Message Queues (SQS)](#12-message-queues-sqs)
13. [Failure Classification & Retry Model](#13-failure-classification--retry-model)
14. [Known Architectural Gaps](#14-known-architectural-gaps)

---

## 1. System Overview

ProBot (branded as **Nasiqa**) is a **System of Work platform** that provides deterministic control over execution across non-deterministic environments (government portals, financial networks, legacy systems). It automates web-based workflows through a hybrid model where:

- **Bots** perform browser automation via Playwright
- **Humans** authenticate sessions and resolve CAPTCHAs
- **Orchestrator** governs all progression decisions centrally

**Key architectural principle**: **Separation of Execution and Control** â€” bots execute work but never decide what happens next. The central orchestrator interprets outcomes and determines progression.

---

## 2. Repository Layout

The system consists of **4 primary repositories**:

| Repository | Purpose | Region |
|---|---|---|
| `admin-backend/` | Global control plane (orchestrator, threads, sessions pool, human-actions, portal profiles, capabilities) | **Central/Global** |
| `probot-backend/` | Tenant-region backend (tenant DBs, jobs, bots, workflows, data records, encrypted session state) | **Tenant Region** |
| `probot-bot/` | Playwright worker container (Docker/ECS Fargate) that runs workflows in a browser | Runs anywhere |
| `probot-frontend/` | React/AntD SPA that talks to both backends | Browser |

**Technology Stack**:
- Node.js / TypeScript
- Express.js (REST APIs)
- Mongoose (MongoDB ORM)
- Socket.IO (real-time bot â†” backend â†” frontend)
- Playwright (browser automation)
- AWS SQS FIFO (message queuing)
- AWS ECS Fargate (production bot deployment)
- Docker (local/dev bot deployment)

---

## 3. Workflow Creation

### 3.1 Workflow Definition Model

**File**: `probot-backend/src/api/workflows/models/workflow.model.ts`

A workflow is defined with the following key fields:

| Field | Purpose |
|---|---|
| `name` | Workflow identifier |
| `tenantId` | Owning tenant |
| `capabilityId` | Links to a capability definition |
| `portalRef` | Binds to a portal (enables SSPOM session pool) |
| `autoExtract` | `'auto' \| 'on' \| 'off'` â€” automatic result extraction |
| `inputs[]` | Input fields (text/password/email/number/url/date, required/optional, secret) |
| `steps[]` | Array of step definitions (typed) |
| `mappings.dataSource` | Which data source feeds the workflow |
| `mappings.fieldsMap` | Maps step fields â†’ data record field keys |
| `condition` | Optional conditions (e.g., `skip_re_login`) |
| `estimatedSecondsPerApp` | Auto-derived on save |

### 3.2 Supported Step Types

**Source of truth**: `probot-bot/src/crawler/crawler.ts` (Workflow type definition)

| Step Type | Purpose |
|---|---|
| `input` | Type text into a form field |
| `click` | Click a button/link |
| `select` | Choose from dropdown |
| `wait` | Fixed delay |
| `press` | Press a keyboard key |
| `navigate` | Navigate to URL |
| `pause` | Pause for human intervention (F-05 human task) |
| `captcha` | Detect and pause for CAPTCHA |
| `2fa` | Enter TOTP-based 2FA code |
| `attach` | Upload a file (from URL) |
| `extract` | Extract text/attribute from element |
| `extractTable` | Parse HTML table |
| `extractResults` | Auto-extract entire page (JSON-LD, tables, blocks) |
| `assert` | Verify element visibility/text |
| `close` | Close browser |

### 3.3 Selector Strategies

**File**: `probot-bot/src/crawler/crawler.ts`

Elements can be located using multiple strategies:
- `css` â€” CSS selectors
- `xpath` â€” XPath expressions
- `id` â€” Element ID
- `name` â€” Name attribute
- `class` â€” Class name
- `text` â€” Text content match
- `placeholder` â€” Placeholder text
- `type` â€” Input type

### 3.4 Frontend Workflow Creation

**File**: `probot-frontend/src/components/dashboard/admin/workflow/containers/workflow-create.container.tsx`

Users create workflows via a form UI (`workflow-form.component.tsx`, ~1300 lines) that supports:
- Step-by-step editor with type dropdown
- Per-step configuration: find/by, waitForPageLoad, waitForSelector, iframeContext, extractAttribute, validatesField, dataField, trustMode
- Data source binding via mappings
- Conditional logic (skip_re_login)

### 3.5 Data Binding

The `mappings.fieldsMap` mechanism maps `stepOrder.fieldName â†’ dataRecord.data.<key>`. This enables one workflow to process many data records without hard-coded values.

---

## 4. Bot Architecture

### 4.1 Bot Model

**File**: `probot-backend/src/api/bots/models/bot.model.ts`

Each bot is represented by a MongoDB document with:
- `tenant` â€” Owning tenant
- `name` â€” Bot instance name
- `jobId` â€” Currently assigned job (null for warm-idle bots)
- `dispatchId` â€” Set only when launched by orchestrator ActorBridge
- `status` â€” Current state
- `statusDetails` â€” Additional state info
- `workflowStatus` â€” Current workflow state
- `isVideoRecEnable` â€” Whether video recording is enabled
- `ecsTaskArn` â€” AWS ECS task identifier (production)

### 4.2 Bot Lifecycle

**File**: `probot-backend/src/api/bots/types/bot.types.ts`

**Status enum**: `IDLE | BUSY | OFFLINE | CAPTCHA | ERROR | UNKNOWN`

State transitions occur based on:
- Warm pool creation (IDLE)
- Job assignment (IDLE â†’ BUSY)
- Task completion (BUSY â†’ IDLE or OFFLINE)
- CAPTCHA detection (BUSY â†’ CAPTCHA)
- Errors (any â†’ ERROR)

### 4.3 Bot Deployment â€” Two Paths

The system has **two mutually-exclusive bot managers** switched by environment:

#### Path A: Development / Docker
**File**: `probot-backend/src/common/utils/bot-process-manager.ts`

- Active when `config.env !== 'PROD'`
- Two sub-modes:
  1. **Host process mode**: `spawn(node, ts-node, 'src/server.ts')` â€” Chromium renders on developer's desktop (visible browser)
  2. **Docker mode**: `spawn('docker', ['run', ...])` with `probot-bot:local` image
- Each bot claims a free port in range `basePort..basePort+100`
- Chromium debug port: `9222 + (PORT % 1000)`
- URL rewrites `localhost` â†’ `host.docker.internal` for Docker container reachability

#### Path B: Production â€” ECS Fargate
**File**: `probot-backend/src/common/services/ecs-bot-manager.service.ts`

- Active when `config.env === 'PROD'` or `'QA'`
- Uses AWS `RunTaskCommand` with `launchType: 'FARGATE'`
- Container environment variables: `BOT_ID`, `WORKFLOW_ID`, `RUN_ID`, `BACKEND_URL`, `BOT_ACCESS_KEY`, `PORT=3000`, `HEADLESS=false`, plus queue URLs
- **Tenant-region routing**: If `tenant.useTenantRegion === true`, task runs in tenant's regional ECS cluster; otherwise global cluster
- Task ARNs recorded on bot doc for regional stop/describe operations

### 4.4 Warm Bot Pool

**File**: `probot-backend/src/api/bots/services/bot.service.ts`

The system maintains **one pre-warmed idle bot per tenant** to reduce cold-start latency:

- `findIdleWarmBot()` â€” Atomic query for `{status: IDLE, jobId: null}`
- `assignJobToWarmBot()` â€” Atomic `findOneAndUpdate` to claim a warm bot
- `launchIdleBot()` â€” Launches replacement after claim
- `reconcileWarmBotPoolForTenant()` â€” Runs every 2 minutes; retires dead idle records, launches replacement
- 3-minute boot grace period before dead-record cleanup

### 4.5 Dispatch Mechanism (Orchestrator â†’ Bot)

**Flow**:
1. Admin-backend orchestrator enqueues DISPATCH message on `nasiqa-dispatch-{env}.fifo`
2. Probot-backend `dispatchConsumer.service.ts` long-polls that queue
3. Valid DISPATCH â†’ `actorBridge.execute()` â€” invalid â†’ DLQ
4. ActorBridge calls `botService.startBotProcess(botId, workflowId, extraEnv)` with:
   - `DISPATCH_ID`
   - `THREAD_ID`
   - `CURRENT_STEP`
   - `STATE_VERSION`
   - `STEP_TIMEOUT_MS`
   - `STEP_RESULTS_QUEUE_URL`
5. Bot enters "orchestrator mode" when `DISPATCH_ID && STEP_RESULTS_QUEUE_URL` are present

### 4.6 Step Result Reporting (Bot â†’ Orchestrator)

**File**: `probot-bot/src/services/orchestrator-step-result.service.ts`

After executing a step, the bot publishes a STEP_RESULT message to `nasiqa-step-results-{env}.fifo` with:
- `dispatch_id` (correlation)
- `thread_id`
- `step_id`
- `outcome_code` (canonical enum from `OUTCOME_BY_FAILURE_CLASS`)
- `failure_class` (if failed)
- `actor_id`
- Timestamps
- `state_version`
- `human_task` (optional, if human input needed)

Admin-backend's `stepResultConsumer.service.ts` consumes these and feeds them to the decision engine.

---

## 5. Live Browser Streaming

### 5.1 Architecture â€” NOT Video, JPEG Screenshots

**Critical detail**: The "live browser" is NOT WebRTC or video streaming. It's **JPEG screenshots streamed over Socket.IO at 1 FPS**.

**File**: `probot-bot/src/server.ts`

### 5.2 Streaming Flow

1. Frontend joins bot's Socket.IO room
2. Frontend emits `remote-start` to backend
3. Backend forwards to bot
4. Bot's `remote-start` handler starts a `setInterval` at 1000ms
5. Each tick:
   - `botState.page.screenshot({ type: 'jpeg', quality: 60 })`
   - Base64 encode
   - Emit `private:remote-frame` with `{ image: 'data:image/jpeg;base64,...', width, height, url, timestamp }`
6. Backend forwards to bot's room
7. Frontend displays as `<img src="data:image/jpeg...">`

An `isTakingScreenshot` flag prevents overlapping screenshot requests.

### 5.3 Interactive Remote Control

The frontend can send interactive inputs to the bot's browser:

**Remote Mouse** (`probot-bot/src/server.ts`):
- Accepts normalized (0..1) coordinates + type: `move | down | up | click | dblclick | wheel`
- Denormalizes against `page.viewportSize()`
- Dispatches via Playwright's `page.mouse.*`

**Remote Keyboard**:
- `type` â€” Types text
- `down`/`up` â€” Presses/releases keys
- Uses `page.keyboard.*`

**Key insight**: The bot's browser accepts remote control **regardless of whether the workflow is running or paused**. This enables:
- **Live observation** during automation
- **Human takeover** during CAPTCHA pause (same browser instance)
- **Operator-driven authentication** (login manually via remote control)

### 5.4 Backend Forwarding

**File**: `probot-backend/src/socket/socketServer.socket.ts`

- Bot emits `private:remote-frame` â†’ backend forwards to bot's room
- All Socket.IO events are namespaced (`private:*`) to prevent client access to internal events

### 5.5 Video Recording (Separate)

Video recording is a **completely separate mechanism**:
- Uses Playwright's built-in `recordVideo` on browser context
- **File**: `probot-bot/src/services/recording.service.ts`
- Writes `.webm` files to `videos/` directory
- **File**: `probot-bot/src/services/video-recording-upload.service.ts` uploads to S3
- One recording per run/row
- URL stored in `videoRecordings` collection

---

## 6. Form Filling (Crawler Engine)

### 6.1 Main Crawler

**File**: `probot-bot/src/crawler/crawler.ts` (~3900 lines)

The `CrawlerService` class is the workflow execution engine. It:
- Receives a workflow definition and data record
- Loops through steps sequentially
- Executes each step via Playwright
- Publishes step outcomes

### 6.2 Step Execution Loop

For each step:
1. Emit `step-observation` (started)
2. Check pause controller (may block on CAPTCHA/manual pause)
3. Execute step based on `step.type`
4. Handle result:
   - Success â†’ emit observation (success), move to next step
   - Failure â†’ object-level retry (up to 3 attempts)
   - Retry exhausted â†’ publish STEP_RESULT with failure class
5. Optional inter-step delay

### 6.3 Wait Strategies

**File**: `probot-bot/src/crawler/crawler.ts`

- **`waitForPageLoad`**: `'load' | 'domcontentloaded' | 'networkidle'` (default `'load'`) â†’ `page.waitForLoadState()`
- **`waitForSelector`**: `{ state: 'attached' | 'visible' | 'hidden' | 'detached', timeoutMs }` â†’ `page.waitForSelector()`
- **Global timeout**: Falls back to `this.config.timeout`

### 6.4 Iframe Support

Steps can specify `iframeContext.{selector, autoDetect}` to operate within an iframe. The `findAndSwitchToIframe()` method returns an iframe handle that step execution uses instead of the main page.

### 6.5 Auto-Extract

**File**: `probot-bot/src/services/auto-extract.service.ts`

The `extractPageRecords()` function attempts extraction in this order:
1. JSON-LD structured data
2. Real HTML tables
3. Repeated block detection

Returns `Record<string, string>[]` â€” an array of extracted records.

### 6.6 Object-Level Retry

**File**: `probot-bot/src/crawler/crawler.ts`

- **The ONLY retry layer the bot owns** (per Orchestration Rules Â§10.5.1)
- Bounded schedule: `[500ms, 1500ms, 3000ms]` (default)
- Configurable via `step.objectRetryDelaysMs`
- `isObjectRetryEligible()` â€” Refuses to retry portal/data errors
- Invisible to orchestration except on exhaustion

### 6.7 Validation-Fixable Handling

After `input` steps (client-side aria-invalid check) and after `click`-submit steps:
- Crawler re-checks each `validatedInputs` entry
- If invalid AND `dataFieldRequired === false` AND `trustMode âˆˆ {tolerant, undefined}`:
  - Clears the field and continues (audit: `emitStepInput({ tolerated: true })`)
- Otherwise raises `VALIDATION_FIXABLE` failure class
  - Routed to a human-edit human task

---

## 7. CAPTCHA Detection & Handling

### 7.1 Detection Mechanism

**File**: `probot-bot/src/crawler/crawler.ts` â€” `detectCaptcha()` method

Detection uses **three strategies** in sequence:

#### Strategy 1: Interactive CAPTCHA Widgets
Checks for known widget selectors:
- reCAPTCHA: `.g-recaptcha`, `#g-recaptcha`, `.recaptcha-checkbox`, `iframe[src*="recaptcha"]`
- hCaptcha: `.h-captcha`, `#h-captcha`, `iframe[src*="hcaptcha"]`

If widget is present, `isCaptchaSolved()` checks:
- All `textarea[name="g-recaptcha-response"]` must be non-empty
- All `textarea[name="h-captcha-response"]` must be non-empty

If solved â†’ `detected: false` (correct handling â€” don't re-trigger).

#### Strategy 2: Image-Based CAPTCHA
Narrow selectors: `img[alt*="captcha"]`, `img[src*="captcha"]` (deliberately narrow to avoid matching submit buttons with "captcha" in ID).

#### Strategy 3: Text-Based Detection
Page text scan for:
- `"verify you are human"`
- `"prove you are not a robot"`
- `"security check"`

### 7.2 Error Classification

**File**: `probot-bot/src/services/error-classification.service.ts`

The `deriveFailureClass()` function pattern-matches error messages:

| Pattern | Failure Class |
|---|---|
| `captcha`, `recaptcha` | `CAPTCHA` |
| `429`, `too many requests`, `rate limit` | `RATE_LIMIT` |
| `500`, `502`, `503`, `504`, `server error` | `UPSTREAM_DOWN` |
| `net::err`, `err_connection`, `dns` | `NETWORK` |
| `timeout`, `timed out` | `TIMEOUT` |
| `401`, `403`, `unauthorized`, `login failed` | `AUTH` |
| `element not found`, `selector` | `PORTAL_LAYOUT` |
| Fallback | `DATA_REFERENCE` or `BOT_DEFECT` |

### 7.3 What Happens When CAPTCHA Is Detected

**Step-by-step flow**:

1. **Crawler hits `case 'captcha'`** in the step loop
2. Calls `detectCaptcha()` â†’ returns `{ detected: true }`
3. Calls `pauseController.pause('CAPTCHA')` â€” blocks the crawler loop
4. **Browser stays open** (Playwright browser continues running)
5. Bot emits `private:bot:paused` event with:
   - `reason: 'CAPTCHA'`
   - `sessionId` (if session-based)

### 7.4 Backend CAPTCHA Bridge

**File**: `probot-backend/src/socket/socketServer.socket.ts`

The backend handles `private:bot:paused` events by **two parallel paths**:

#### Path A: Orchestrator (Thread-Level)
- Publishes STEP_RESULT with `outcome_code: ERR_CAPTCHA_REQUIRED`
- Orchestrator pauses thread at `CAPTCHA_REQUIRED` status
- Thread state machine (`admin-backend/src/common/services/stateMachine.ts`) enforces this transition

#### Path B: SSPOM Human Action (Session-Level)
- If `sessionId && reason âˆˆ {CAPTCHA, MFA}`:
- Fire-and-forget POST to admin-backend `/v1/internal/human-actions`
- Payload: `{ session_id, type: 'captcha' }`
- Admin-backend calls `humanActionService.openForSession()`

### 7.5 Human Action Creation

**File**: `admin-backend/src/api/human-actions/services/human-action.service.ts` â€” `openForSession()`

1. Guard: Session must be in `initializing` status
2. Reads `unclaimed_ttl_ms` from `PortalProfile`
3. Creates `HumanAction`:
   - `human_action_id: uuid`
   - `session_id`
   - `type: 'captcha' | 'mfa'`
   - `status: 'unclaimed'`
   - `unclaimed_ttl_at: now + ttl_ms`
4. Flips Session status: `initializing â†’ human_action_pending`
5. Sets `session.active_human_action_id`

**Critical**: The Playwright browser remains open throughout this process. Socket.IO connection stays alive. Frontend can still stream the live browser via `remote-start`.

---

## 8. Human Verification Flow

The system has **two distinct human-verification paths** that don't currently share the same UI.

### 8.1 Path A: Orchestrator Human Task Resume

**Purpose**: Per-thread, per-workflow human input (data corrections, decisions)

**Route**: `POST /v1/sysadmin/threads/:threadId/resume/human-task`
**Handler**: `admin-backend/src/api/threads/handlers/resumeThread.handler.ts`

**Flow**:
1. Guards: `thread.status` must be paused
2. `thread.wait_reason_code âˆˆ {AWAITING_HUMAN, CAPTCHA_REQUIRED}`
3. Validates `req.body.operator_input` against `thread.human_task.input_schema`
4. Supervised gate branching:
   - `pending_gated_action === 'completed'` â†’ `orchestratorDispatcher.approveComplete()`
   - Otherwise â†’ `orchestratorDispatcher.dispatch()`
5. Dispatcher atomically:
   - Flips `paused â†’ running`
   - Bumps `state_version`
   - Writes a `thread_event`
   - Publishes fresh DISPATCH on `nasiqa-dispatch-{env}.fifo`
6. Records human measurement (attribution)

### 8.2 Path B: SSPOM Human Action Queue

**Purpose**: Per-session CAPTCHA/MFA gates

**Model**: `admin-backend/src/api/human-actions/models/human-action.model.ts`

**Collection**: `human_actions` with fields:
- `unclaimed_ttl_at`
- `claim_ttl_at`
- `resolved_at`
- Status: `unclaimed â†’ claimed â†’ resolved | expired`

### 8.3 Operator UI

**File**: `probot-frontend/src/components/dashboard/sysadmin/human-actions/containers/HumanActions.container.tsx`

The Human Actions page shows a table with:
- Task ID, Session ID, Type (CAPTCHA/MFA)
- Status, Claimed by, Deadline
- Actions: "Claim next", "Mark resolved"

**Important**: This UI does NOT embed a live browser view. Operators must navigate to the bot's live view separately.

### 8.4 Claim Flow

**Route**: `POST /v1/sysadmin/human-actions/claim-next`
**Handler**: `humanActionService.claimNext()`

- Atomic `findOneAndUpdate` on oldest unclaimed action
- **Operator cannot pick a specific session** (claim-next semantics per Â§6)
- Sets `status: claimed`, `claimed_by: userId`, `claim_ttl_at: now + ttl_ms`

### 8.5 Resolve Flow

**Route**: `POST /v1/sysadmin/human-actions/:id/resolve`
**Handler**: `humanActionService.resolve()`

- Guarded on `claimed_by === userId`
- Flips action `claimed â†’ resolved`
- Flips Session `human_action_pending â†’ available` (session returns to pool)

### 8.6 TTL Sweep

**Method**: `humanActionService.sweepExpired()`

- Either clock (unclaimed_ttl or claim_ttl) expires â†’ action â†’ `expired`
- Session â†’ `expired`
- **Never auto-retried** (schema comment: security-critical, must never bypass human)

### 8.7 How Operator Actually Solves the CAPTCHA

The bot's paused browser can be viewed via the **existing bot live-browser view**:
- Frames stream from bot's Socket.IO room
- Operator uses `remote-mouse` / `remote-key` to interact
- Operator solves CAPTCHA in the same live browser

**Integration Gap**: The Human Actions queue does NOT link to the bot's live view. Operator must navigate to the bot page separately.

### 8.8 Complete CAPTCHA â†’ Resume Flow

```
1. Crawler hits captcha step
   â†“
2. detectCaptcha() â†’ detected: true
   â†“
3. pauseController.pause('CAPTCHA') â€” crawler blocks
   â†“
4. Browser stays open, bot emits 'private:bot:paused'
   â†“
5. Backend handler (socketServer.socket.ts):
   a. Publishes ERR_CAPTCHA_REQUIRED STEP_RESULT
      â†’ Orchestrator pauses thread at CAPTCHA_REQUIRED
   b. POST /v1/internal/human-actions {session_id, type: 'captcha'}
      â†’ Admin-backend opens HumanAction, Session â†’ human_action_pending
   â†“
6. Operator sees row in HumanActions table
   â†“
7. Operator clicks "Claim next" â†’ action â†’ claimed
   â†“
8. Operator navigates to bot live view (separate UI)
   â†“
9. Operator solves CAPTCHA via remote-mouse/remote-key
   â†“
10. Operator returns to HumanActions, clicks "Mark resolved"
    â†’ Session â†’ available, HumanAction â†’ resolved
   â†“
11. Separately: POST /threads/:id/resume/human-task
    â†’ Dispatcher publishes new DISPATCH
    â†’ dispatchConsumer picks up
    â†’ ActorBridge launches (or reuses) bot
   â†“
12. When bot's pauseController is released:
    â†’ Crawler re-checks CAPTCHA (case 'captcha')
    â†’ If solved, workflow continues
```

---

## 9. Backend Architecture

### 9.1 Two-Backend Separation

The system deliberately separates control from tenant data across **two backend services** in **different regions**:

#### admin-backend (Global Region)
**Owns**:
- `threads` collection (control state)
- `thread_events` (immutable audit log)
- `sessions` (session pool metadata â€” NO cookies)
- `human_actions` (CAPTCHA/MFA queue)
- `portal_profiles` (portal capacity config)
- `capabilities` (capability registry)

**Comment from `sessions/models/session.model.ts`**: *"Cookies / storageState are NEVER stored here â€” they are encrypted payload held in the tenant region"*

#### probot-backend (Tenant Region)
**Owns**:
- `probot` global DB (workflow definitions, telemetry, capability manifest bindings)
- `probot-tenant-<id>` per-tenant DBs (encrypted PII)

**File**: `probot-backend/src/common/services/tenantDbManager.service.ts`

Uses:
- **Default mongoose connection**: Global tenant-region data
- **`TENANT_DB_CONNECTION_STRING`**: Per-tenant databases cluster

### 9.2 PII Containment Strategy

The two backends run in **physically separate database clusters** in **different AWS regions**:
- Only the `session_id` UUID crosses the region boundary
- Cookies/storageState never leave the tenant region
- Encryption via `FLIGHT_ENCRYPTION_KEY` for whole-blob `storageState`

### 9.3 Service Communication

**Synchronous HTTP (backend-to-backend)**:
- `probot-backend/src/common/services/internalAdminApi.service.ts` â€” Probot â†’ Admin reads
- Example: CAPTCHA POST from `socketServer.socket.ts:564` â†’ admin-backend `/v1/internal/human-actions`

**Asynchronous (Message Queues)**:
- `AdminEventsPublisherService` (probot-backend) publishes `CrossRegionMessage` schema-validated messages
- Consumers on both sides (admin-backend consumes `admin-events.fifo`, probot-backend consumes `nasiqa-dispatch-*.fifo`)

**Real-time (Socket.IO)**:
- Probot-backend hosts the Socket.IO server
- Bots and frontend connect as clients
- Bot events forwarded to per-bot rooms for frontend consumption
- `private:*` namespace prevents client access to internal events

### 9.4 MongoDB Collections Summary

**Global cluster (admin-backend)**:
- `threads` â€” Orchestrator control state
- `thread_events` â€” Immutable audit log
- `sessions` â€” Session pool metadata
- `human_actions` â€” CAPTCHA/MFA queue
- `portal_profiles` â€” Portal capacity config
- `capability_manifests` â€” Registered capabilities
- Admin registry: `users`, `roles`, `tenants`, `countries`, `email_configurations`

**Tenant cluster (probot-backend, per-tenant DB `probot-tenant-<id>`)**:
- `bots` â€” Bot instances
- `jobs` â€” Batch execution runs
- `jobResults` â€” Per-row outcomes
- `dataRecords` â€” Encrypted business data
- `session_states` â€” Encrypted Playwright storageState
- `videoRecordings` â€” Bot session recordings (S3 URLs)
- `stepInputs` â€” Actual values typed (audit)
- `measurements` â€” Performance measurements
- `errorLogs` â€” Detailed error records
- `trails` â€” Data change history

---

## 10. Session Management (SSPOM)

### 10.1 Session Model

**File**: `admin-backend/src/api/sessions/models/session.model.ts`

**Statuses**: `initializing | available | leased | human_action_pending | expired | terminating | terminated`

**Fields**:
- `session_id` â€” UUID (only cross-region field)
- `tenant_id`
- `portal_ref`
- `portal_account_ref` â€” Opaque credential identifier (NO PII)
- `leased_by_thread_id`
- `active_human_action_id`
- `expires_at`
- `cir_id` â€” Links to Capacity Increase Request

### 10.2 StorageState Encryption

**File**: `probot-backend/src/api/session-state/models/sessionState.model.ts`

- Joined to session by `sessionId`
- **Whole-blob encryption**: Entire `storageState` object is JSON-stringified and encrypted with `FLIGHT_ENCRYPTION_KEY`
- Format: `ENC:<iv>:<cipher>` prefix
- Idempotent (safe to re-encrypt), decrypted transparently on `post('init')`
- Deliberately does NOT use `encryptDataField` helper (which walks top-level string values only)
- Refuses writes when key is unset

### 10.3 Bot Session Fetch/Save

**Bot fetches storageState**:
- Socket event: `private:session-state:get`
- File: `probot-bot/src/server.ts`
- Returns decrypted storageState to bot

**Bot saves storageState**:
- Socket event: `private:session-state:save`
- Payload includes `earliestCookieExpiry` for TTL calculation

### 10.4 Session Lifecycle

**State transitions**:
- `initializing â†’ available`: Human completes authentication (`markAuthenticated`)
- `available â†’ leased`: Thread acquires session
- `leased â†’ available`: Thread releases session (reusable)
- `available â†’ expired`: Proactive re-auth (5 min before `expires_at`)
- `leased â†’ expired`: `ERR_SESSION_EXPIRED` outcome
- `initializing â†’ terminated`: Abandoned auth flow (>15 min grace)
- `available â†’ terminating â†’ terminated`: Downscale

### 10.5 Capacity Management

**File**: `admin-backend/src/api/sessions/services/capacityManager.service.ts`

**PQT (Projected Queue Time)** computation:
- Every 30 seconds sweeper checks each portal
- Counts parked threads with `RATE_LIMIT_BACKOFF`
- Multiplies by `NOMINAL_SERVICE_MS`
- If PQT > threshold â†’ raise CIR

**Baseline top-up**:
- Only when `tenantId && profile.allow_unattended_auth && activeCount < baseline_sessions`
- Default `allow_unattended_auth: false` (BRD-compliant secure default)

**Proactive re-auth**:
- `REAUTH_LEAD_MS = 5 * 60_000` (5 minutes before expiry)
- Only retires `available` unleased sessions

**Downscale**:
- One session per tick
- Respects `baseline_sessions` hard floor
- Never touches `user_triggered` sessions (human effort preserved)
- Never touches leased or CAPTCHA-blocked sessions

---

## 11. Data Flow: Job â†’ Outcome

### 11.1 Complete Data Flow

```
1. Data Import
   User uploads CSV â†’ DataRecords created in tenant DB
   Each DataRecord.data is encrypted with FLIGHT_ENCRYPTION_KEY

2. Job Creation
   User selects workflow + dataIds â†’ Job created
   Job tracks: succeededDataIds, failedDataIds, startPayload

3. Job Queue Enqueue
   Probot-backend enqueues one SQS message per dataId on workflow-processing.fifo
   Message: { jobId, dataId, workflowId, dataSource }

4. Bot Processing
   Warm bot (or newly launched) long-polls the queue
   For each message:
   a. Decrypt data record
   b. Lease a session from SSPOM (via admin-backend)
   c. Restore session storageState in Playwright browser context
   d. Execute workflow via CrawlerService
   e. Publish STEP_RESULT for each significant step

5. Orchestrator Decision Making
   Admin-backend's stepResultConsumer.service.ts consumes STEP_RESULTs
   For each STEP_RESULT:
   a. Fetch thread state
   b. Fetch capability manifest + policy
   c. Evaluate IQA rules on outcome + state
   d. Decide: retry, redirect, human-task, pause, complete, fail
   e. Transactional write: state + thread_event
   f. If continuing: publish new DISPATCH on nasiqa-dispatch-{env}.fifo

6. Row Completion
   Bot fires private:bot:workflow:row:complete for each row
   Bot fires private:bot:workflow:run:complete for entire job
   Tenant DB records: DataRecord.processedByBotId, processedBySessionId, processDurationMs
```

### 11.2 Data Structures

**DataRecord** (`probot-backend/src/api/dataSources/models/dataRecord.model.ts`):
- `tenantId`, `dataSourceKey`, `data` (encrypted)
- `statusId` â€” Current processing status
- `processedByBotId`, `processedBySessionId`, `processDurationMs` â€” Attribution

**Job** (`probot-backend/src/api/jobs/models/job.model.ts`):
- One workflow-run over a set of dataIds
- `succeededDataIds`, `failedDataIds` â€” Outcomes
- `startPayload` â€” Snapshot of workflow at job creation

**Thread** (`admin-backend/src/api/threads/models/thread.model.ts`):
- One orchestrator thread per Job Ã— capability action binding
- `state_version` monotonic (optimistic concurrency)
- `attempt_id`, `retry_count`, `step_retry_count`
- `last_outcome_code`, `wait_reason_code`
- `human_task` (per-workflow input contract)

---

## 12. Message Queues (SQS)

**File**: `docker/init-queues.sh`

**Region**: `me-central-1` (configurable via `AWS_REGION`)

**All queues are FIFO with ContentBasedDeduplication**:

| Queue | Purpose | Publisher | Consumer |
|---|---|---|---|
| `admin-events.fifo` | Probot â†’ Admin events (thread updates, observations, telemetry) | probot-backend | admin-backend |
| `admin-events-dlq.fifo` | Dead-letter for invalid admin events | Auto | Manual review |
| `workflow-processing.fifo` | Per-row job queue | probot-backend | probot-bot |
| `nasiqa-dispatch-{env}.fifo` | Orchestrator DISPATCH commands | admin-backend | probot-backend `dispatchConsumer.service.ts` |
| `nasiqa-step-results-{env}.fifo` | STEP_RESULT reports | probot-bot | admin-backend `stepResultConsumer.service.ts` |

### 12.1 Message Group ID Strategy

- **Dispatch messages**: `MessageGroupId = thread_id` â€” ensures per-thread ordering
- **Step results**: `MessageGroupId = thread_id` â€” matched ordering
- **Deduplication**: `MessageDeduplicationId = dispatch_id` â€” prevents duplicate dispatches

---

## 13. Failure Classification & Retry Model

### 13.1 Failure Class Hierarchy

**File**: `probot-bot/src/crawler/crawler.ts` (FailureClass enum)

**Classes**:
- `CAPTCHA`, `AUTH`, `RATE_LIMIT`, `UPSTREAM_DOWN`, `NETWORK`, `TIMEOUT`
- `PORTAL_LAYOUT`, `PORTAL_VALIDATION`, `SESSION_EXPIRED`
- `DATA_REFERENCE`, `VALIDATION_FIXABLE`
- `HUMAN_INPUT_REQUIRED`, `CONCURRENCY_LOCK`
- `TENANT_CONFIGURATION`, `BOT_DEFECT`, `UNKNOWN`

### 13.2 Outcome Code Mapping

**File**: `probot-bot/src/services/orchestrator-step-result.service.ts`

The `OUTCOME_BY_FAILURE_CLASS` maps each failure class to an outcome code:

| Failure Class | Outcome Code |
|---|---|
| CAPTCHA | ERR_CAPTCHA_REQUIRED |
| AUTH | ERR_AUTH_FAILED |
| RATE_LIMIT | ERR_RATE_LIMITED |
| UPSTREAM_DOWN | ERR_UPSTREAM_UNAVAILABLE |
| TIMEOUT | ERR_TIMEOUT |
| PORTAL_LAYOUT | ERR_PORTAL_CHANGED |
| PORTAL_VALIDATION | ERR_PORTAL_VALIDATION |
| SESSION_EXPIRED | ERR_SESSION_EXPIRED |
| VALIDATION_FIXABLE | ERR_HUMAN_INPUT_REQUIRED |
| ... | ... |

Total: **19 outcome codes** (18 error + `OK`)

### 13.3 Failure Categorization

**File**: `admin-backend/src/common/services/failureClassification.ts`

Categories (with default backoff):
- `TRANSIENT` â€” Retry allowed (e.g., NETWORK 15s, TIMEOUT 15s)
- `PERSISTENT` â€” Retry-limited (e.g., PORTAL_LAYOUT after 2 retries becomes NON_RECOVERABLE)
- `NON_RECOVERABLE` â€” Terminate immediately (e.g., TENANT_CONFIGURATION)
- `POLICY_DRIVEN` â€” Route to human (e.g., CAPTCHA, MFA, VALIDATION_FIXABLE)

### 13.4 Retry Hierarchy

Three retry layers, from tightest to loosest:

1. **Object-level** (bot-owned):
   - In `crawler.ts`
   - Bounded schedule: `[500ms, 1500ms, 3000ms]`
   - Only for transient interaction faults (element not found, etc.)
   - Invisible to orchestrator

2. **Task-level** (orchestrator-owned):
   - `step_retry_count` on thread
   - Capped by `min(manifest_step.max_retry_count, policy.max_step_retries)`
   - Default policy: `max_step_retries: 10`

3. **Thread-level** (orchestrator-owned):
   - `retry_count` on thread
   - Never reset (accumulates across attempts)
   - Ultimate ceiling for entire thread lifecycle

---

## 14. Known Architectural Gaps

Based on comprehensive code investigation, the following gaps exist:

### 14.1 CRITICAL

**Phase 4 CIR Mint Not Implemented**
- CIRs (Capacity Increase Requests) are raised when demand spikes
- Code has NO transition from `requested â†’ materializing â†’ fulfilled`
- Only stale-CIR reaper writes `rejected` status
- **Impact**: Session pool cannot scale beyond baseline under demand
- **Effort to fix**: 4-6 weeks (batch notification service, mass-auth UI, CIR state machine)

**AI Actor Infrastructure Absent**
- No LLM/AI API integrations (zero openai/anthropic/gpt/claude code)
- No `ai` in `ACTOR_TYPES` enum
- No AI governance framework
- No AI observability
- **Impact**: BRD's "AI-Driven Execution Environments" segment unsupported
- **Effort to fix**: 4-6 weeks

### 14.2 HIGH

**Compliance/Audit Surface Incomplete**
- Per-thread audit endpoint only (no cross-thread global query)
- No CSV/PDF audit export
- No IQA rule id/policy version captured in thread_events
- `evidence_ref` field always null (B8 change removed botlogs pipeline)
- **Impact**: Compliance officer cannot produce defensible reports without custom queries
- **Effort to fix**: 2-3 weeks

**Human Actions UI Integration Gap**
- Human Actions queue does NOT embed live browser view
- Operators must navigate separately to bot's live view
- No direct linkage between queue row and bot preview
- **Impact**: Operator experience friction, potential delays
- **Effort to fix**: 1-2 weeks

### 14.3 MEDIUM

**skip_re_login Bot-Side Control**
- `crawler.ts:3692-3728` â€” Bot self-decides to skip workflow steps based on DOM inspection
- Config-gated but locally evaluated
- Technically violates BRD Â§3.2 (bot shouldn't make progression decisions)
- **Impact**: Small technical debt, works reliably
- **Effort to fix**: 2-3 days (refactor login-check as separate dispatched step)

**Internal Tool Connectors Missing**
- No Google Sheets, Office 365, SharePoint, OneDrive integrations
- `portalRef` required on workflows (no `spreadsheetRef` alternative)
- **Impact**: BRD's "Non-Deterministic Internal Tools" segment unsupported
- **Effort to fix**: 4 weeks

**Bot-Side Hardcoded Delays**
- 8 hardcoded `waitForTimeout(500|1000)` calls in `crawler.ts`
- Not policy-driven
- **Impact**: Small BRD Â§2.3 violation (uncontrolled timing)
- **Effort to fix**: 1-2 weeks (replace with policy-driven waits)

### 14.4 LOW

**5 Empty Catch Blocks**
- In probot-bot: `server.ts:1927, 2095, 2110`, `crawler.ts:3704`, `recording.service.ts:274`
- 4 low-risk (UI streams, cleanup), 1 concerning (crawler.ts:3704)
- **Impact**: Silent failures possible
- **Effort to fix**: 1-2 days

**4 `as any` Outcome Code Bypasses**
- In admin-backend: threadSweeper.service.ts:304,415, orchestratorDispatcher.service.ts:809,961
- Bypasses enum contract
- **Impact**: Contract enforcement leaks
- **Effort to fix**: 1-2 days

---

## Appendix A: Key Files Reference

### Workflows
- `probot-backend/src/api/workflows/models/workflow.model.ts`
- `probot-frontend/src/components/dashboard/admin/workflow/types/workflow.types.ts`
- `probot-frontend/src/components/dashboard/admin/workflow/containers/workflow-create.container.tsx`

### Bots
- `probot-backend/src/api/bots/models/bot.model.ts`
- `probot-backend/src/api/bots/types/bot.types.ts`
- `probot-backend/src/api/bots/services/bot.service.ts`
- `probot-backend/src/common/utils/bot-process-manager.ts`
- `probot-backend/src/common/services/ecs-bot-manager.service.ts`
- `probot-backend/src/common/services/dispatchConsumer.service.ts`

### Crawler / Bot Runtime
- `probot-bot/src/crawler/crawler.ts` (~3900 lines â€” main crawler)
- `probot-bot/src/server.ts` (main bot server, remote-frame streaming)
- `probot-bot/src/services/error-classification.service.ts`
- `probot-bot/src/services/orchestrator-step-result.service.ts`
- `probot-bot/src/services/auto-extract.service.ts`
- `probot-bot/src/services/recording.service.ts`

### Sessions & Human Actions
- `admin-backend/src/api/sessions/models/session.model.ts`
- `admin-backend/src/api/sessions/services/capacityManager.service.ts`
- `admin-backend/src/api/sessions/services/session.service.ts`
- `admin-backend/src/api/human-actions/models/human-action.model.ts`
- `admin-backend/src/api/human-actions/services/human-action.service.ts`
- `admin-backend/src/api/human-actions/handlers/human-action.handler.ts`
- `probot-backend/src/api/session-state/models/sessionState.model.ts`
- `probot-frontend/src/components/dashboard/sysadmin/human-actions/containers/HumanActions.container.tsx`

### Orchestrator
- `admin-backend/src/api/threads/models/thread.model.ts`
- `admin-backend/src/api/threads/handlers/resumeThread.handler.ts`
- `admin-backend/src/common/services/orchestratorDecisionEngine.service.ts`
- `admin-backend/src/common/services/orchestratorDispatcher.service.ts`
- `admin-backend/src/common/services/stateMachine.ts`
- `admin-backend/src/common/services/failureClassification.ts`
- `admin-backend/src/common/services/iqaEvaluator.ts`

### Infrastructure
- `probot-backend/src/common/services/tenantDbManager.service.ts`
- `probot-backend/src/socket/socketServer.socket.ts`
- `docker/init-queues.sh`
- `probot-bot/src/types/socket-events.ts` (comprehensive wire contract)

---

## Appendix B: Environment Variables Reference

**Bot Runtime Environment**:
- `BOT_ID` â€” Bot instance identifier
- `WORKFLOW_ID` â€” Workflow to execute
- `RUN_ID` â€” Job identifier
- `BACKEND_URL` â€” Probot-backend URL
- `BOT_ACCESS_KEY` â€” Authentication token
- `PORT` â€” HTTP port for bot server
- `HEADLESS` â€” Browser headless mode (default: false)
- `SQS_QUEUE_URL` â€” Workflow processing queue
- `ADMIN_EVENTS_QUEUE_URL` â€” Admin events queue
- `STEP_RESULTS_QUEUE_URL` â€” Step results queue
- `DISPATCH_ID` â€” Set when launched by orchestrator (enters orchestrator mode)
- `THREAD_ID` â€” Associated thread
- `CURRENT_STEP` â€” Current step in dispatch
- `STATE_VERSION` â€” Optimistic concurrency version
- `STEP_TIMEOUT_MS` â€” Timeout for this step
- `AWS_ENDPOINT_URL_SQS` â€” LocalStack endpoint (dev)
- `AWS_REGION` â€” Deployment region

**Backend Environment**:
- `NODE_ENV` â€” DEV / QA / PROD
- `DB_CONNECTION_STRING` â€” MongoDB connection
- `TENANT_DB_CONNECTION_STRING` â€” Tenant databases cluster
- `REDIS_CONNECTION_STRING` â€” Redis for caching
- `FLIGHT_ENCRYPTION_KEY` â€” StorageState encryption key
- `TELEMETRY_HASH_SECRET` â€” Hashed tenant IDs
- `SESSION_MANAGEMENT_ENABLED` â€” Enables SSPOM
- `WARM_BOT_POOL_ENABLED` â€” Enables warm bot pool
- `ENFORCE_CENTRAL_REGION` â€” Startup region check

---

## Appendix C: End-to-End Example â€” Visa Application

**Scenario**: Process 100 visa applications through government portal

```
Step 1 â€” Data Import
- User uploads CSV of 100 applications
- 100 DataRecords created in tenant DB (encrypted)

Step 2 â€” Job Creation
- User selects "Visa Submission Workflow"
- Job created with dataIds = [rec1, rec2, ..., rec100]

Step 3 â€” Session Preparation (SSPOM)
- Portal has baseline of 5 sessions
- Human operator has previously authenticated 5 sessions
- Sessions stored encrypted in tenant region

Step 4 â€” Job Queue Enqueue
- 100 messages enqueued on workflow-processing.fifo
- One message per dataId

Step 5 â€” Bot Launch
- Warm bot picks up first message
- Additional bots launched (ECS Fargate) to serve pool
- Each bot leases a session from SSPOM

Step 6 â€” Workflow Execution (per row)
For each application:
  a. Bot fetches encrypted storageState from tenant DB
  b. Playwright browser context restored with cookies
  c. Bot navigates to portal (already logged in)
  d. Bot fills form fields (using DataRecord data)
  e. Bot clicks submit
  f. Bot detects response:
     - Success â†’ emit success outcome
     - CAPTCHA â†’ pause, notify human queue
     - Rate limit â†’ publish RATE_LIMIT outcome
     - Validation error â†’ check trustMode, either retry or human-fix
  g. Publish STEP_RESULT to orchestrator

Step 7 â€” Orchestrator Decisions
For each STEP_RESULT:
  a. Central failureClassification analyzes outcome
  b. IQA evaluator determines next action:
     - retry (with backoff)
     - redirect (jump to different step)
     - human-task (pause for human input)
     - complete (mark thread completed)
     - fail (terminal failure)
  c. Transactional write: state + thread_event
  d. If continuing: publish new DISPATCH

Step 8 â€” Human Intervention (if needed)
If CAPTCHA detected:
  a. Bot pauses (browser stays open)
  b. Session â†’ human_action_pending
  c. HumanAction created in queue
  d. Operator claims task
  e. Operator navigates to bot's live view
  f. Operator solves CAPTCHA via remote-mouse/key
  g. Operator marks resolved
  h. Session â†’ available
  i. Thread resumes via /resume/human-task

Step 9 â€” Job Completion
- Bot completes all 100 rows (or as many as possible)
- Session released back to pool
- Job aggregates: succeededDataIds, failedDataIds
- Video recordings uploaded to S3
- Full audit trail available in thread_events
```

---

**End of Document**

For questions or clarifications, contact the ProBot engineering team.