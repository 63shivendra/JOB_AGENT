# Job Authenticity Agent - Task List

- `[x]` Task Initialization and Directory Setup
- `[x]` Database Schema creation (`supabase/schema.sql`)
- `[x]` FastAPI Backend development
    - `[x]` Setup dependencies and virtual environment
    - `[x]` Implement standard API router and mock/Gemini LLM scoring pipelines
    - `[x]` Add weighted aggregator logic and scoring checks
    - `[x]` Implement local file caching / Redis caching
- `[x]` Chrome Extension development
    - `[x]` Create Vite + React workspace
    - `[x]` Add Manifest V3 configurator
    - `[x]` Implement content scripts (detector, scraper, badge)
    - `[x]` Implement background worker
    - `[x]` Implement React Popup UI and badge states
- `[x]` Next.js Dashboard development
    - `[x]` Initialize app
    - `[x]` Create jobs table and state indicators
    - `[x]` Build analytics pages with Recharts visualizer
- `[x]` Verification and Manual Testing

## Phase 2: AI Page-Context Scoring & Persistent Left Sidebar
- `[x]` Implement `/score/page` endpoint in FastAPI backend (`backend/main.py`)
    - `[x]` Add `PageAnalysisRequest` Pydantic model
    - `[x]` Define unified `PAGE_ANALYZER_PROMPT` for single-pass Gemini evaluation
    - `[x]` Implement `local_mock_page_eval` for regex-based fallback evaluations
    - `[x]` Add cache hashing and Redis/in-memory integration
- `[x]` Rebuild Chrome Extension components
    - `[x]` Add `scorePage` call to the API client (`extension/src/shared/api.ts`)
    - `[x]` Remove default browser popup from `extension/manifest.json`
    - `[x]` Wire action clicked handler in the service worker (`extension/src/background/worker.ts`)
    - `[x]` Implement persistent left-docked sidebar UI in `extension/src/content/content.ts`
        - `[x]` Integrate `chrome.storage.local` to persist the open/closed state
        - `[x]` Render a premium glassmorphic fixed sidebar on the left
        - `[x]` Scraping integration via `document.body.innerText`
        - `[x]` Add sidebar collapsible audits list, Circular trust score gauge, and Saved Jobs tab
- `[x]` Re-compile extension, run backend tests, and verify

