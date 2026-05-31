# Job Authenticity Agent - Implementation Plan

The Job Authenticity Agent is an end-to-end product designed to identify fraudulent, duplicate, or stale job listings using a three-tiered architecture:
1. **Chrome Extension (React + Vite + TypeScript, Manifest V3)**: Detects job board pages (LinkedIn, Indeed, Naukri, Glassdoor, Internshala), scrapes standard fields, displays an authenticity badge, and allows saving listings.
2. **FastAPI backend with LLM scoring engine (Python + OpenAI)**: Standardizes job descriptions, runs 5 specialized evaluation prompts in parallel, aggregates scores using weighted formulas, and caches results in Redis.
3. **Database & Dashboard (PostgreSQL via Supabase, Next.js, Recharts, TailwindCSS)**: Stores scored listings and user bookmarks, rendering analytics on skills demand, category distribution, and authenticity metrics.

We have migrated this workspace to `E:\eperimei1` as requested.

---

## User Review Required

> [!IMPORTANT]
> The scraping scripts depend on specific DOM selectors for LinkedIn, Indeed, and Naukri. Job boards frequently update their HTML layouts. We have isolated these selectors in dedicated modules to facilitate updates when DOM changes occur.

> [!WARNING]
> Running 5 parallel LLM queries per job post will consume API tokens. We have implemented aggressive Redis caching based on the SHA-256 hash of normalized job post content to avoid redundant LLM evaluations.

---

## Open Questions

> [!IMPORTANT]
> 1. **LLM Provider Preference**: The current specification proposes using OpenAI's `gpt-4o-mini` for speed and cost efficiency. Would you like to proceed with this model, or configure the backend to support fallback models like Claude Haiku?
> 2. **Authentication Method**: The design references Supabase Auth with JWT. Do you want to support passwordless email logins, social logins (e.g., Google OAuth), or standard email/password authentication?
> 3. **Redis and PostgreSQL Provisioning**: For local testing, should we configure a local Docker Compose setup with Redis and PostgreSQL, or should we connect directly to Supabase and a cloud Redis instance?

---

## Proposed Changes

We have organized the code into four directories within `E:\eperimei1`:
- `extension/`: Chrome Extension codebase.
- `backend/`: FastAPI API service and LLM engine.
- `dashboard/`: Next.js web application.
- `supabase/`: Database schema definitions.

---

### Component: Database Schema

We have defined the database structures for saved jobs, cached analysis, and user tracking.

#### [NEW] [schema.sql](file:///E:/eperimei1/supabase/schema.sql)
- Contains DDL statements for `users`, `job_posts`, and `saved_jobs` tables.
- Implements foreign keys, cascading deletes, and search indexes for performance.

---

### Component: FastAPI Backend Service

A Python-based service utilizing FastAPI to receive scraped payloads, interface with OpenAI API, evaluate criteria in parallel, and cache results.

#### [NEW] [requirements.txt](file:///E:/eperimei1/backend/requirements.txt)
- Specifies python packages: `fastapi`, `uvicorn`, `pydantic`, `openai`, `redis`, `asyncio`, `python-dotenv`.

#### [NEW] [main.py](file:///E:/eperimei1/backend/main.py)
- Exposes `/score` and subscription endpoints.
- Implements parallel scoring using `asyncio.gather`.
- Computes weighted score aggregation.
- Implements SHA-256 content-based hashing and Redis caching.

#### [NEW] [.env.example](file:///E:/eperimei1/backend/.env.example)
- Exposes keys for `OPENAI_API_KEY`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.

---

### Component: Chrome Extension

A React + Vite application compiled to Manifest V3.

#### [NEW] [manifest.json](file:///E:/eperimei1/extension/manifest.json)
- Configures background workers, host permissions, and injected content scripts.

#### [NEW] [package.json](file:///E:/eperimei1/extension/package.json)
- React, Vite, CRXJS, TailwindCSS, and TypeScript configuration.

#### [NEW] [vite.config.ts](file:///E:/eperimei1/extension/vite.config.ts)
- Custom Vite config utilizing the CRXJS plugin for fast updates.

#### [NEW] [types.ts](file:///E:/eperimei1/extension/src/shared/types.ts)
- Shared TypeScript interfaces for `JobPost`, `ScoredJob`, and api responses.

#### [NEW] [detector.ts](file:///E:/eperimei1/extension/src/content/detector.ts)
- Runs on active tab to identify target URLs and initiate content actions.

#### [NEW] [scraper.ts](file:///E:/eperimei1/extension/src/content/scraper.ts)
- Contains site-specific selectors for LinkedIn, Indeed, and Naukri.
- Normalizes DOM elements into standard fields.

#### [NEW] [badge.ts](file:///E:/eperimei1/extension/src/content/badge.ts)
- Injects color-coded visual indicator badges onto the job page DOM.

#### [NEW] [worker.ts](file:///E:/eperimei1/extension/src/background/worker.ts)
- Manages cross-origin communications, authorization tokens, and API queue.

#### [NEW] [Popup.tsx](file:///E:/eperimei1/extension/src/popup/Popup.tsx)
- Provides UI state displays: Loading spinner, verified results, warnings, and save commands.

---

### Component: Next.js Dashboard

A web UI for tracking applications and exploring job market statistics.

#### [NEW] [package.json](file:///E:/eperimei1/dashboard/package.json)
- Configures Next.js, TailwindCSS, Recharts, and TanStack Query.

#### [NEW] [page.tsx](file:///E:/eperimei1/dashboard/app/page.tsx)
- Main dashboard screen displaying pipeline statistics and high-level charts.

#### [NEW] [jobs/page.tsx](file:///E:/eperimei1/dashboard/app/jobs/page.tsx)
- Grid or tabular list of saved jobs with status dropdowns, search, and category filters.

#### [NEW] [analytics/page.tsx](file:///E:/eperimei1/dashboard/app/analytics/page.tsx)
- High-level analytics utilizing Recharts (Skills demand heatmap, category counts, experience levels, trust distributions).

---

## Verification Plan

### Automated Tests
- We will write Python test scripts for `backend/main.py` using `pytest` to mock OpenAI completions and assert scoring outputs.
- We will construct node-based scraper tests utilizing mock DOM payloads to verify scraper robustness.

### Manual Verification
- Run the extension locally in developer mode (`chrome://extensions`), injecting into mock HTML representations of LinkedIn and Indeed.
- Verify status code responses and network payloads using Chrome DevTools.
- Access the dashboard interface on `localhost:3000` to verify filter queries and chart updates.
