-- Enable UUID generation extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  plan_tier     TEXT DEFAULT 'free',  -- free | pro | team
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Job Posts (Scored and deduplicated)
CREATE TABLE IF NOT EXISTS job_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash  TEXT UNIQUE NOT NULL,  -- prevents duplicate scoring of same listing
  title         TEXT NOT NULL,
  company       TEXT NOT NULL,
  description   TEXT,
  salary        TEXT,
  location      TEXT,
  apply_url     TEXT,
  source        TEXT,   -- linkedin | naukri | indeed | glassdoor | internshala
  posted_date   DATE,
  expires_at    DATE,   -- estimated from posted_date + 30 days
  trust_score   INTEGER,  -- 0-100
  tier          TEXT,     -- verified | suspicious | fake
  flags         JSONB,    -- array of flag strings
  reason        TEXT,
  scraped_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Jobs (User bookmarks join table)
CREATE TABLE IF NOT EXISTS saved_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id        UUID REFERENCES job_posts(id) ON DELETE CASCADE,
  notes         TEXT,
  status        TEXT DEFAULT 'saved',  -- saved | applied | rejected | offer
  saved_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, job_id)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_saved_jobs_user ON saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_job_posts_tier  ON job_posts(tier);
CREATE INDEX IF NOT EXISTS idx_job_posts_exp   ON job_posts(expires_at);
CREATE INDEX IF NOT EXISTS idx_job_posts_hash  ON job_posts(content_hash);
