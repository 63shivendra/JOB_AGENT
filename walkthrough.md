# Job Authenticity Agent - Technical Walkthrough & Verification

We have successfully designed, implemented, and verified the next major architectural evolution of the **Job Authenticity Agent** under `E:\eperimei1`. 

This update resolves the brittleness of DOM-scraper selectors and improves the user interface by transitioning to a unified **AI Page-Context Analyzer** and a **Persistent Left-Side Sidebar**.

---

## 1. Phase 2 Key Developments

### 1.1. AI-Agent Page-Context Scraping (`POST /score/page`)
We migrated from brittle, hardcoded CSS DOM selectors (which constantly break when job boards update their HTML layouts) to a unified **AI Page-Context Scraper**:
- **Content Script Scraping**: Grabs the raw, visible text of the webpage using `document.body.innerText` (truncating it to a safe 10,000 characters).
- **Backend API Classification**: Exposes the `/score/page` endpoint. When called, it uses a single-pass Gemini API model configuration (`PAGE_ANALYZER_PROMPT`) to:
  1. Determine if the webpage actually contains a job listing (`is_job: boolean`).
  2. If it is a job listing, automatically extract key metadata (`title`, `company`, `location`, `salary`, `description`) without relying on hardcoded CSS classes.
  3. Evaluate authenticity across the 5 core checks in a single LLM pass, significantly reducing latency and API costs.
- **Robust Local Fallback (`local_mock_page_eval`)**: Implements split-based text parsing and keyword matching in Python to support fully offline-first developer testing when no API key is active.

### 1.2. Persistent Left-Docked Sidebar (`extension/src/content/content.ts`)
We rebuilt the floating capsule badge into a full-featured, persistent left-docked sidebar panel:
- **Premium Glassmorphic Design**: Styled with a translucent background (`rgba(20, 20, 20, 0.96)`), heavy backdrop filters (`blur(16px)`), bright HSL glowing colors, and sleek borders.
- **State Persistence**: Integrates `chrome.storage.local` to remember if the sidebar was open or closed. If a user leaves the sidebar open, it automatically slides out and starts analyzing new listings on subsequent page loads or tab navigations.
- **Toolbar Action Toggle**: Removed standard browser popups to allow clicking the extension action toolbar icon to directly broadcast `TOGGLE_SIDEBAR` messages from the service worker (`worker.ts`) to active tabs.
- **Collapsible Toggle Handle**: Added a sticky toggle tab projecting from the right edge of the sidebar panel (`◀` / `🛡️`), enabling smooth collapsing and expanding of the drawer directly on screen.
- **Multi-Tab Dashboard View**:
  - **Active Analysis Tab**: Renders a circular SVG trust gauge, extracted metadata, evaluation summary, and detailed accordion checklists for the 5 criteria (Language, Reality, Consistency, Contact, and Pattern checks) displaying scores and expanding lists of flags.
  - **Saved Pipeline Tab**: Embeds a real-time list of bookmarks directly inside the sidebar, fetching saved entries from the local API, opening listings, and allowing direct removal.

---

## 2. Updated Project Directory Structure

```
E:/eperimei1/
├── backend/
│   ├── main.py                     # FastAPI server, Page-level Scorer, cache engine
│   ├── test_main.py                # Unit tests for local scoring & page classifications
│   └── requirements.txt            # Python dependencies
├── extension/
│   ├── package.json                # Bundler configurations
│   ├── vite.config.ts              # Rollup inputs for content & worker
│   ├── manifest.json               # Action clicks and worker permissions
│   ├── src/
│   │   ├── shared/
│   │   │   ├── types.ts            # Job models & state schemas
│   │   │   └── api.ts              # scorePage & saveJob client triggers
│   │   ├── content/
│   │   │   └── content.ts          # PersistentSidebar implementation, innerText scraper
│   │   └── background/
│   │       └── worker.ts           # Toolbar action clicked message broadcaster
│   └── dist/                       # Compiled Chrome Extension packed artifact
└── task.md                         # Progress checklist
```

---

## 3. Automated Test Verification

We expanded `backend/test_main.py` with specific assertions verifying the classification and field extraction of the `local_mock_page_eval` engine. 

Running the unit test suite yields 100% success:

```powershell
E:\eperimei1\backend> python test_main.py
.....
----------------------------------------------------------------------
Ran 5 tests in 0.001s

OK
Scam Test Score: 39 (Tier: fake)
Flags detected: ["Free email provider in contact: 'globalhr@gmail.com'", "Excessive urgency or exclamation marks", "Requires application or contact via WhatsApp", "Shortened link redirects for job application", "Vague or spam phrase: 'rockstar'", "Unrealistic commission-based or daily salary model", "Vague or spam phrase: 'passive income'"]
Suspicious Test Score: 69 (Tier: suspicious)
Flags detected: ["Excessive technical skills stack required for fresher role (10 tools)", "Senior title requiring zero experience"]
Verified Test Score: 100 (Tier: verified)
```

---

## 4. How to Load and Test Phase 2

### Step 4.1: Ensure Backend Server is Running
The FastAPI server will automatically reload when code changes. Make sure it is active in the background on port `8000`:
```powershell
cd E:\eperimei1\backend
python main.py
```

### Step 4.2: Load / Refresh Unpacked Extension
1. Open Google Chrome and go to `chrome://extensions/`.
2. Find the **Job Authenticity Agent** card and click the **Reload icon** (or click **Load unpacked** and select `E:\eperimei1\extension\dist` if adding for the first time).

### Step 4.3: Test Context Scanning
1. Go to any job listing on **LinkedIn, Indeed, or Naukri**.
2. Click the **Job Authenticity Agent** icon in your Chrome toolbar (or click the projecting `🛡️` handle tab on the far left edge of the screen) to open the sidebar drawer.
3. The sidebar will slide open, immediately scrape the visible page text, extract title/company/location, and present your rating metrics!
4. Navigate from one job to another; the open sidebar will automatically re-run the scanning engine on the new page, updating your trust details in real-time.
5. Click **Save Job Posting** to save it to your bookmarks, and switch to the **Saved Pipeline** tab to see your saved listings sync immediately!
