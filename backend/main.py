import asyncio
import hashlib
import json
import logging
import os
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

import httpx
from fastapi import FastAPI, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Initialize Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

app = FastAPI(
    title="Job Authenticity Agent API",
    description="LLM scoring engine and datastore for evaluating job post legitimacy",
    version="1.0.0"
)

# Enable CORS for Chrome Extension and Web Dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration Constants
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
REDIS_URL = os.getenv("REDIS_URL")

# --- In-Memory Caching and Database Simulators for zero-friction testing ---
IN_MEMORY_CACHE: Dict[str, Dict[str, Any]] = {}
SAVED_JOBS_DB: List[Dict[str, Any]] = []

# Check Redis connection optionally
redis_client = None
if REDIS_URL:
    try:
        import redis
        redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        redis_client.ping()
        logger.info("Connected to Redis successfully.")
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}. Falling back to in-memory cache.")
        redis_client = None

# --- Pydantic Data Models ---
class JobPost(BaseModel):
    title: str = Field(..., description="Job listing title")
    company: str = Field(..., description="Hiring company name")
    description: str = Field(..., description="Full text of the job description")
    salary: Optional[str] = Field(None, description="Reported salary compensation")
    location: str = Field(..., description="Job location")
    apply_url: str = Field(..., description="URL where the application is submitted")
    source_platform: Optional[str] = Field("unknown", description="Source board (e.g. LinkedIn, Indeed)")

class SaveJobRequest(BaseModel):
    job: JobPost
    trust_score: int
    tier: str
    flags: List[str]
    reason: str
    status: Optional[str] = "saved"
    notes: Optional[str] = None

class PageAnalysisRequest(BaseModel):
    url: str
    raw_text: str
    title_hint: Optional[str] = None
    company_hint: Optional[str] = None

# --- Prompts Specification ---
LANGUAGE_PROMPT = """
You are a job post analyst specializing in detecting fraudulent listings.
Analyze the following job details for language quality red flags.

Score from 0 to 10 where:
  0 = completely fake/spam language
  10 = professional, specific, legitimate language

Red flags to detect:
- Vague requirements with no specifics ("dynamic", "go-getter", "passionate")
- Unrealistic income promises ("earn 1 lakh per day", "unlimited income")
- Work-from-home scam phrases ("no experience needed", "be your own boss")
- Excessive exclamation marks or ALL CAPS urgency
- No mention of specific tools, technologies, or day-to-day responsibilities
- Generic filler text with no company-specific context

Return ONLY valid JSON in this format:
{
  "score": <integer 0-10>,
  "flags": [<list of specific red flag strings found, keep them short and factual>],
  "reason": "<one sentence summary explaining the language quality>"
}
"""

REALITY_PROMPT = """
You are a compensation and hiring expert.
Analyze this job post for realistic claims given the role, location, and requirements.

Score from 0 to 10 where:
  0 = completely unrealistic / impossible claims
  10 = fully realistic expectations

Check for:
- Salary vs market rate for the city and role
- Experience required vs seniority of the title (e.g. Senior Engineer needing 0 YOE)
- Number of required skills vs role level (20+ skills for a fresher)
- Impossible combinations (e.g. "Immediate joiner, 10 LPA, 0 YOE, IIT only")

Return ONLY valid JSON in this format:
{
  "score": <integer 0-10>,
  "flags": [<list of unrealistic claims, keep them short and factual>],
  "reason": "<one sentence summary of the reality check>"
}
"""

CONSISTENCY_PROMPT = """
You are a hiring manager auditor.
Analyze this job post for internal contradictions or inconsistencies.

Score from 0 to 10 where:
  0 = severe internal contradictions
  10 = perfectly consistent structure and text

Check for:
- Title vs responsibilities (e.g. title is "Backend Engineer" but description focuses on sales calls or cold calling)
- Company size / stability vs infrastructure expectations
- Work mode alignment (e.g. listed as "100% Remote" but description requires "daily office presence" or "must live in office city")
- Mismatch in educational requirements throughout the text

Return ONLY valid JSON in this format:
{
  "score": <integer 0-10>,
  "flags": [<list of inconsistencies, keep them short and factual>],
  "reason": "<one sentence summary of consistency review>"
}
"""

CONTACT_PROMPT = """
You are a cybersecurity analyst reviewing job post contact information.

Score from 0 to 10 where:
  0 = clearly fraudulent contact details (WhatsApp, personal Gmail)
  10 = professional, company-domain contact info

Red flags to detect:
- Email domain is gmail.com, yahoo.com, hotmail.com, or similar free providers instead of official company domain
- Contact via WhatsApp, Telegram, or personal mobile number
- Apply URL goes to a URL shortener (bit.ly, tinyurl) or unrelated domain
- No company website or official listing link
- Instructions asking users to comment "YES" or message recruiter directly on social channels for details

Return ONLY valid JSON in this format:
{
  "score": <integer 0-10>,
  "flags": [<list of suspicious contact details, keep them short and factual>],
  "reason": "<one sentence summary of cybersecurity review>"
}
"""

PATTERN_PROMPT = """
You are a pattern matching analyst.
Detect if this job post matches common automated spam templates, AI filler generators, or known phishing templates.

Score from 0 to 10 where:
  0 = clear duplicate / automated template match / generic AI text
  10 = highly customized, human-written, detailed post

Check for:
- Generic "we are a fast-paced company committed to excellence" type filler without detail
- Extremely standard boilerplate structure with no custom content or company details
- High probability of raw AI generator output with zero specific roles listed
- Copy-paste signatures of common phishing job boards

Return ONLY valid JSON in this format:
{
  "score": <integer 0-10>,
  "flags": [<list of matched patterns, keep them short and factual>],
  "reason": "<one sentence summary of pattern check>"
}
"""

PAGE_ANALYZER_PROMPT = """
You are a job board auditor and AI scraper agent.
Analyze the following raw webpage text.

Determine if this webpage is a job posting / job listing detail page.
If the webpage text does NOT contain a job listing/posting, return ONLY valid JSON in this format:
{
  "is_job": false,
  "reason": "Explain why this page is not a job listing"
}

If the webpage text DOES contain a job listing/posting, perform the following two tasks:
1. Extract job metadata details:
   - "title": Job title (e.g. Senior Software Engineer)
   - "company": Hiring company name
   - "location": Job location (e.g. Remote, City Name)
   - "salary": Reported salary compensation (if mentioned, e.g. $100k-$120k or INR 10L, otherwise null)
   - "description": Clean, comprehensive extracted job description (excluding headers, footers, sidebars, navigations, and unrelated page text)

2. Evaluate the job listing for authenticity across these 5 checks (score each from 0 to 10, where 0 is a clear scam/risk and 10 is fully professional/legitimate):
   - language: Check for language quality red flags (vague dynamic requirements, unrealistic income promises, work-from-home scam phrases, excessive urgency, ALL CAPS text, no specific responsibilities).
   - reality: Check for realistic claims (salary vs market rate, senior title with 0 YOE, excessive skill stacking for freshers, immediate joiner extreme combos).
   - consistency: Check for internal contradictions (listed as remote but requiring in-office, backend title focusing on sales/telecalling, education mismatches).
   - contact: Check for cybersecurity contact flags (free emails like gmail.com/yahoo.com, contact via WhatsApp/Telegram, shortened bit.ly redirects, asking to comment YES).
   - pattern: Check for automated templates (generic high-risk scam posting templates, raw AI generator output with zero specific details, standard phishing layouts).

Return ONLY valid JSON in this format:
{
  "is_job": true,
  "extracted_job": {
    "title": "extracted title",
    "company": "extracted company",
    "location": "extracted location",
    "salary": "extracted salary or null",
    "description": "extracted clean description text"
  },
  "checks": {
    "language": {
      "score": <0-10>,
      "flags": [<short red flag strings>],
      "reason": "One sentence explanation of language check"
    },
    "reality": {
      "score": <0-10>,
      "flags": [<short red flag strings>],
      "reason": "One sentence explanation of reality check"
    },
    "consistency": {
      "score": <0-10>,
      "flags": [<short red flag strings>],
      "reason": "One sentence explanation of consistency check"
    },
    "contact": {
      "score": <0-10>,
      "flags": [<short red flag strings>],
      "reason": "One sentence explanation of contact check"
    },
    "pattern": {
      "score": <0-10>,
      "flags": [<short red flag strings>],
      "reason": "One sentence explanation of pattern check"
    }
  }
}
"""

WEIGHTS = {
    "language":    0.25,
    "reality":     0.20,
    "consistency": 0.20,
    "contact":     0.25,
    "pattern":     0.10
}

# --- Helper Logic: Local Rule-Based Mock Scoring ---
def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if "linkedin.com" in url_lower: return "linkedin"
    if "indeed.com" in url_lower: return "indeed"
    if "naukri.com" in url_lower: return "naukri"
    if "glassdoor.com" in url_lower or "glassdoor.co.in" in url_lower: return "glassdoor"
    if "internshala.com" in url_lower: return "internshala"
    return "unknown"

def local_mock_page_eval(url: str, raw_text: str, title_hint: str = None, company_hint: str = None) -> Dict[str, Any]:
    """
    Simulates AI extraction and evaluation of raw page text.
    Provides immediate offline/mock support.
    """
    text_lower = raw_text.lower()
    
    # 1. Determine if this page is a job listing
    is_job_board = detect_platform(url) != "unknown"
    has_job_keywords = sum(1 for kw in ["job", "apply", "salary", "experience", "qualification", "responsibilities", "role", "description"] if kw in text_lower) >= 2
    
    if not (is_job_board or has_job_keywords):
        return {
            "is_job": False,
            "reason": "Page text does not contain key job posting indicators or standard board URLs."
        }
    
    # 2. Extract job details from text/hints
    title = "Unknown Job"
    company = "Unknown Company"
    location = "Not Listed"
    salary = None
    
    # Process Title Hint
    if title_hint:
        clean_title = title_hint
        if " | " in clean_title:
            clean_title = clean_title.split(" | ")[0]
        if " - " in clean_title:
            clean_title = clean_title.split(" - ")[0]
        clean_title = re.sub(r"\(\d+\+?\)\s*", "", clean_title).strip()
        if clean_title and clean_title != "LinkedIn" and clean_title != "Indeed" and clean_title != "Glassdoor":
            title = clean_title
            
    # Process Company Hint
    if company_hint and company_hint.strip():
        company = company_hint.strip()
        
    # Heuristic Fallback
    if title == "Unknown Job":
        lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
        if lines:
            for line in lines[:5]:
                if "hiring for" in line.lower():
                    part = re.split(r"hiring for", line, flags=re.IGNORECASE)[-1].strip()
                    if " at " in part.lower():
                        title_company = re.split(r"\s+at\s+", part, flags=re.IGNORECASE)
                        title = title_company[0].strip()
                        if company == "Unknown Company":
                            company = title_company[1].strip()
                    else:
                        title = part
                    break
            
            if title == "Unknown Job":
                title = lines[0][:60]
                
    if company == "Unknown Company" or company == "Mock Enterprise":
        company_match = re.search(r"(?:company|employer|firm|agency):\s*([^\n]+)", raw_text, re.IGNORECASE)
        if company_match:
            company = company_match.group(1).strip()
        else:
            company = "Mock Enterprise"
            
    loc_match = re.search(r"(?:location|city|job location):\s*([^\n]+)", raw_text, re.IGNORECASE)
    if loc_match:
        location = loc_match.group(1).strip()
    elif "remote" in text_lower or "work from home" in text_lower:
        location = "Remote"
    else:
        location = "Bengaluru, India"
        
    sal_match = re.search(r"(?:salary|compensation|stipend|pay):\s*([^\n]+)", raw_text, re.IGNORECASE)
    if sal_match:
        salary = sal_match.group(1).strip()
        
    description = raw_text[:2000]
    
    job = JobPost(
        title=title,
        company=company,
        location=location,
        salary=salary,
        apply_url=url,
        description=description,
        source_platform=detect_platform(url)
    )
    
    checks = local_mock_eval(job)
    
    return {
        "is_job": True,
        "extracted_job": {
            "title": job.title,
            "company": job.company,
            "location": job.location,
            "salary": job.salary,
            "description": job.description
        },
        "checks": checks
    }

def local_mock_eval(job: JobPost) -> Dict[str, Any]:
    """
    Evaluates job listings using regex pattern matching.
    Provides immediate local testing utility without API keys or costs.
    """
    desc_lower = job.description.lower()
    title_lower = job.title.lower()
    url_lower = job.apply_url.lower()
    comp_lower = job.company.lower()
    
    # 1. Language Check
    lang_flags = []
    lang_score = 10
    vague_phrases = ["dynamic self-starter", "go-getter", "rockstar", "ninja", "earn quick", "passive income", "earn money daily"]
    for phrase in vague_phrases:
        if phrase in desc_lower:
            lang_flags.append(f"Vague or spam phrase: '{phrase}'")
            lang_score = max(0, lang_score - 2)
    if "!" * 3 in job.description or desc_lower.count("urgent") > 3:
        lang_flags.append("Excessive urgency or exclamation marks")
        lang_score = max(0, lang_score - 2)
    if len(job.description) < 150:
        lang_flags.append("Extremely short job description")
        lang_score = max(0, lang_score - 3)
        
    # 2. Reality Check
    real_flags = []
    real_score = 10
    
    # Check experience vs title
    seniority_terms = ["principal", "staff", "lead", "architect", "senior", "head", "director"]
    is_senior = any(term in title_lower for term in seniority_terms)
    
    # YOE patterns
    yoe_match = re.search(r"(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years|yoe|yrs)", desc_lower)
    if yoe_match:
        min_yoe = int(yoe_match.group(1))
        if is_senior and min_yoe <= 1:
            real_flags.append(f"Senior title with low experience requirement ({min_yoe} YOE)")
            real_score = max(0, real_score - 3)
    elif "no experience" in desc_lower or "freshers" in desc_lower or "0 experience" in desc_lower:
        if is_senior:
            real_flags.append("Senior title requiring zero experience")
            real_score = max(0, real_score - 4)

    # Technical skill stacking checks
    tech_tags = ["sql", "python", "tableau", "docker", "aws", "kubernetes", "spark", "hadoop", "rust", "c++", "react", "node", "typescript"]
    tech_count = sum(1 for tag in tech_tags if tag in desc_lower)
    if tech_count >= 6 and ("fresher" in desc_lower or "junior" in title_lower or "0 experience" in desc_lower or "no experience" in desc_lower):
        real_flags.append(f"Excessive technical skills stack required for fresher role ({tech_count} tools)")
        real_score = max(0, real_score - 4)

    # Wild salary claims
    if job.salary:
        sal_lower = job.salary.lower()
        if "unlimited" in sal_lower or "daily" in sal_lower or "commission" in sal_lower:
            real_flags.append("Unrealistic commission-based or daily salary model")
            real_score = max(0, real_score - 3)

    # 3. Consistency Check
    cons_flags = []
    cons_score = 10
    if "remote" in title_lower and ("daily office" in desc_lower or "office presence" in desc_lower or "in-office" in desc_lower):
        cons_flags.append("Listed as Remote but text demands office presence")
        cons_score = max(0, cons_score - 4)
    if "backend" in title_lower and ("sales" in desc_lower or "telecaller" in desc_lower):
        cons_flags.append("Technical backend title but text references sales roles")
        cons_score = max(0, cons_score - 4)

    # 4. Contact Red Flags
    cont_flags = []
    cont_score = 10
    email_matches = re.findall(r"[\w\.-]+@[\w\.-]+\.\w+", job.description)
    free_providers = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "rediffmail.com"]
    for email in email_matches:
        domain = email.split("@")[-1].lower()
        if domain in free_providers:
            cont_flags.append(f"Free email provider in contact: '{email}'")
            cont_score = max(0, cont_score - 4)
            
    if "whatsapp" in desc_lower or "wa.me" in url_lower or re.search(r"contact.*whatsapp", desc_lower):
        cont_flags.append("Requires application or contact via WhatsApp")
        cont_score = max(0, cont_score - 4)
    if "telegram" in desc_lower:
        cont_flags.append("Requires application or contact via Telegram")
        cont_score = max(0, cont_score - 4)
    if "tinyurl.com" in url_lower or "bit.ly" in url_lower:
        cont_flags.append("Shortened link redirects for job application")
        cont_score = max(0, cont_score - 3)

    # 5. Pattern Matching
    pat_flags = []
    pat_score = 10
    standard_templates = [
        "we are a fast-growing startup looking for dynamic",
        "looking for dedicated individuals to work from home",
        "earn huge margins in your free time"
    ]
    for temp in standard_templates:
        if temp in desc_lower:
            pat_flags.append("Matches standard high-risk scam posting template")
            pat_score = max(0, pat_score - 3)
            
    if len(desc_lower.strip()) == 0:
        pat_flags.append("Empty description payload")
        pat_score = 0

    results = {
        "language": {"score": lang_score, "flags": lang_flags, "reason": "Evaluated language quality indicators locally."},
        "reality": {"score": real_score, "flags": real_flags, "reason": "Checked seniority and salary metrics against criteria locally."},
        "consistency": {"score": cons_score, "flags": cons_flags, "reason": "Reviewed title and content contradictions locally."},
        "contact": {"score": cont_score, "flags": cont_flags, "reason": "Analyzed communications channels locally."},
        "pattern": {"score": pat_score, "flags": pat_flags, "reason": "Scanned for automated post templates locally."}
    }
    return results

# --- Async LLM Connector to Gemini API ---
async def call_gemini_check(prompt: str, job_text: str) -> Dict[str, Any]:
    """
    Submits structured query to Gemini 1.5 Flash using raw HTTP client.
    Enforces valid JSON returns.
    """
    if not GEMINI_API_KEY:
        raise ValueError("Missing Gemini API Key configuration")
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    payload = {
        "contents": [{
            "parts": [{
                "text": f"Evaluate this job post:\n\n{job_text}"
            }]
        }],
        "systemInstruction": {
            "parts": [{
                "text": prompt
            }]
        },
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.0
        }
    }
    
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.post(url, json=payload)
            if response.status_code != 200:
                logger.error(f"Gemini API returned error {response.status_code}: {response.text}")
                return {"score": 5, "flags": ["API evaluation error"], "reason": "Gemini API request failed."}
                
            data = response.json()
            # Extract text containing JSON from Gemini response structure
            candidate_text = data["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(candidate_text.strip())
        except Exception as e:
            logger.exception("Error occurred in LLM scoring connection")
            return {"score": 5, "flags": [f"Connection error: {str(e)}"], "reason": "Internal connection exception during check."}

# --- Aggregation Formula ---
def aggregate_scores(results: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    raw_weighted = sum(results[k]["score"] * WEIGHTS[k] for k in WEIGHTS)
    trust_score = int(round(raw_weighted * 10))  # Convert scale 0-10 -> 0-100
    
    # Audit Veto Capping Rules
    if results["contact"]["score"] <= 3:
        # Severe contact flags immediately cap trust score to Fake tier (max 39)
        trust_score = min(trust_score, 39)
    elif results["contact"]["score"] <= 6 or results["reality"]["score"] <= 6:
        # Significant reality/contact flags cap trust score to Suspicious tier (max 69)
        trust_score = min(trust_score, 69)
        
    if trust_score >= 75:
        tier = "verified"
    elif trust_score >= 40:
        tier = "suspicious"
    else:
        tier = "fake"
        
    all_flags = []
    for k in results:
        all_flags.extend(results[k].get("flags", []))
        
    # Get primary reason from the check that scored lowest, or fallback to language quality
    lowest_check = min(results.keys(), key=lambda k: results[k]["score"])
    reason = results[lowest_check]["reason"]
    
    return {
        "trust_score": trust_score,
        "tier": tier,
        "flags": list(set(all_flags)),  # Deduplicate flags
        "reason": reason
    }

# --- REST Endpoints ---
@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "caching": "redis" if redis_client else "in_memory",
        "llm_engine": "live_gemini" if GEMINI_API_KEY else "local_mock"
    }

# --- Interactive Developer Console and HTML Live Dashboard ---
@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
async def serve_dashboard():
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Job Authenticity Agent - Developer Control Panel</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <script>
            tailwind.config = {
                theme: {
                    extend: {
                        colors: {
                            background: '#0c0a09',
                            card: '#1c1917',
                            border: '#292524',
                            primary: '#3b82f6'
                        },
                        fontFamily: {
                            sans: ['Inter', 'sans-serif']
                        }
                    }
                }
            }
        </script>
        <style>
            body {
                background-color: #0c0a09;
                color: #f5f5f4;
            }
            /* Custom sleek scrollbar */
            ::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            ::-webkit-scrollbar-track {
                background: #1c1917;
            }
            ::-webkit-scrollbar-thumb {
                background: #44403c;
                border-radius: 3px;
            }
            ::-webkit-scrollbar-thumb:hover {
                background: #78716c;
            }
        </style>
    </head>
    <body class="font-sans antialiased min-h-screen flex flex-col">

        <!-- Banner Header -->
        <header class="sticky top-0 z-40 bg-[#0c0a09]/95 backdrop-blur border-b border-[#292524] px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-lg text-white shadow-[0_0_15px_rgba(59,130,246,0.4)]">
                    A
                </div>
                <div>
                    <h1 class="font-extrabold text-sm tracking-wide text-white uppercase">Authenticity Agent</h1>
                    <p class="text-[9px] text-stone-500 uppercase tracking-widest font-bold">Developer Control Console</p>
                </div>
            </div>
            
            <div class="flex items-center gap-3 text-xs">
                <div class="flex items-center gap-2 px-3 py-1 rounded-full border border-stone-800 bg-stone-900/60">
                    <span class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                    <span class="text-[11px] font-semibold text-stone-300">FastAPI Live</span>
                </div>
                <button onclick="refreshData()" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-stone-300 bg-stone-800 hover:bg-stone-700 active:bg-stone-800 border border-stone-700 hover:border-stone-600 rounded-lg transition-all cursor-pointer">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5" id="refresh-icon"></i>
                    Sync Dashboard
                </button>
            </div>
        </header>

        <!-- Main Workspace Grid -->
        <main class="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">

            <!-- Left Panel: Job Scraper Simulator & Scorer -->
            <section class="lg:col-span-1 bg-[#1c1917] border border-[#292524] rounded-2xl p-5 flex flex-col gap-4 shadow-xl">
                <div class="border-b border-stone-800 pb-3 flex justify-between items-center">
                    <h2 class="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-2">
                        <i data-lucide="terminal" class="w-4 h-4 text-blue-500"></i>
                        Scrape & Score Simulator
                    </h2>
                    <span class="text-[9px] font-bold bg-blue-950 text-blue-400 border border-blue-900/80 px-2 py-0.5 rounded">Mock Boards</span>
                </div>

                <!-- Template Selector buttons -->
                <div>
                    <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-2">Preset Listing Templates</label>
                    <div class="grid grid-cols-3 gap-2">
                        <button onclick="loadTemplate('verified')" class="px-2 py-1.5 text-[10.5px] font-semibold bg-stone-900 border border-stone-800 hover:border-stone-750 text-emerald-400 hover:text-emerald-300 rounded-lg capitalize transition-all">Verified</button>
                        <button onclick="loadTemplate('suspicious')" class="px-2 py-1.5 text-[10.5px] font-semibold bg-stone-900 border border-stone-800 hover:border-stone-750 text-amber-400 hover:text-amber-300 rounded-lg capitalize transition-all">Suspicious</button>
                        <button onclick="loadTemplate('fake')" class="px-2 py-1.5 text-[10.5px] font-semibold bg-stone-900 border border-stone-800 hover:border-stone-750 text-rose-400 hover:text-rose-300 rounded-lg capitalize transition-all">Scam / Fake</button>
                    </div>
                </div>

                <!-- Simulation Form -->
                <form id="score-form" onsubmit="submitScore(event)" class="flex flex-col gap-3.5 text-xs">
                    <div>
                        <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Job Title</label>
                        <input type="text" id="title" required class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 placeholder-stone-600 outline-none transition-colors">
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Company Name</label>
                            <input type="text" id="company" required class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 placeholder-stone-600 outline-none transition-colors">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Platform Board</label>
                            <select id="source_platform" class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 outline-none transition-colors cursor-pointer">
                                <option value="linkedin">LinkedIn</option>
                                <option value="indeed">Indeed</option>
                                <option value="naukri">Naukri</option>
                                <option value="glassdoor">Glassdoor</option>
                                <option value="internshala">Internshala</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Location</label>
                            <input type="text" id="location" required class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 placeholder-stone-600 outline-none transition-colors">
                        </div>
                        <div>
                            <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Salary Range (Optional)</label>
                            <input type="text" id="salary" class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 placeholder-stone-600 outline-none transition-colors">
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Apply URL</label>
                        <input type="text" id="apply_url" required class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 placeholder-stone-600 outline-none transition-colors">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-stone-500 uppercase tracking-wider block mb-1">Job Description</label>
                        <textarea id="description" required rows="5" class="w-full bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg p-2 text-stone-200 placeholder-stone-600 outline-none transition-colors resize-none"></textarea>
                    </div>

                    <button type="submit" class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-600 font-bold text-white rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2">
                        <i data-lucide="shield-alert" class="w-4 h-4"></i>
                        Analyze & Save Listing
                    </button>
                </form>
            </section>

            <!-- Right Panel (2x span): Real-time dashboard pipeline -->
            <section class="lg:col-span-2 flex flex-col gap-6">

                <!-- Stats summary Row -->
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div class="bg-[#1c1917] border border-[#292524] rounded-xl p-4 flex items-center justify-between shadow-md">
                        <div>
                            <span class="text-[9px] font-bold text-stone-500 uppercase tracking-wide">Total Applications Scored</span>
                            <h3 class="text-2xl font-black text-white mt-1" id="stat-total">0</h3>
                        </div>
                        <div class="w-10 h-10 rounded-lg bg-blue-950/40 text-blue-400 border border-blue-900/60 flex items-center justify-center">
                            <i data-lucide="clipboard-list" class="w-5 h-5"></i>
                        </div>
                    </div>

                    <div class="bg-[#1c1917] border border-[#292524] rounded-xl p-4 flex items-center justify-between shadow-md">
                        <div>
                            <span class="text-[9px] font-bold text-emerald-500 uppercase tracking-wide">Verified Postings</span>
                            <h3 class="text-2xl font-black text-emerald-400 mt-1" id="stat-verified">0</h3>
                        </div>
                        <div class="w-10 h-10 rounded-lg bg-emerald-950/40 text-emerald-450 border border-emerald-900/60 flex items-center justify-center">
                            <i data-lucide="shield-check" class="w-5 h-5"></i>
                        </div>
                    </div>

                    <div class="bg-[#1c1917] border border-[#292524] rounded-xl p-4 flex items-center justify-between shadow-md">
                        <div>
                            <span class="text-[9px] font-bold text-rose-500 uppercase tracking-wide">High Risk / Suspicious</span>
                            <h3 class="text-2xl font-black text-rose-455 mt-1" id="stat-scam">0</h3>
                        </div>
                        <div class="w-10 h-10 rounded-lg bg-rose-950/40 text-rose-455 border border-rose-900/60 flex items-center justify-center">
                            <i data-lucide="alert-triangle" class="w-5 h-5"></i>
                        </div>
                    </div>
                </div>

                <!-- Live Pipeline List and analysis viewer -->
                <div class="bg-[#1c1917] border border-[#292524] rounded-2xl p-5 flex flex-col gap-4 shadow-xl flex-1">
                    
                    <div class="border-b border-stone-800 pb-3 flex justify-between items-center flex-wrap gap-3">
                        <h2 class="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-2">
                            <i data-lucide="layers" class="w-4 h-4 text-emerald-500"></i>
                            Scored Pipeline List
                        </h2>

                        <!-- Expiry urgency guide -->
                        <div class="flex gap-3 text-[10px] font-semibold text-stone-400">
                          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Safe</span>
                          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-amber-500"></span> Expiring Soon</span>
                          <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-500"></span> Critical / Expired</span>
                        </div>
                    </div>

                    <!-- Pipeline Listings list -->
                    <div class="flex-1 overflow-y-auto max-h-[360px]" id="pipeline-container">
                        <!-- Filled by Javascript dynamically -->
                        <div class="py-16 text-center text-stone-500 flex flex-col items-center justify-center gap-3">
                            <i data-lucide="folder-open" class="w-10 h-10 text-stone-600 animate-pulse"></i>
                            <p class="text-xs">Console Database is empty. Submit a mock job in the sidebar to populate listings.</p>
                        </div>
                    </div>

                    <!-- Live Aggregation metrics visualization (SVG Charts) -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 pt-4 border-t border-stone-800">
                        
                        <!-- Tech stack heatmap simulated -->
                        <div class="bg-stone-900/40 p-4 rounded-xl border border-stone-850 flex flex-col gap-2">
                            <h3 class="text-[10px] font-bold uppercase text-stone-400 tracking-wider flex items-center gap-1">
                                <i data-lucide="bar-chart-2" class="w-3.5 h-3.5 text-blue-500"></i> Tech Skill Frequency
                            </h3>
                            <div class="flex flex-col gap-2 mt-2" id="skill-chart-container">
                                <!-- Bars populated by JS -->
                                <div class="text-[10.5px] text-stone-600">No tools matched in saved listings descriptions.</div>
                            </div>
                        </div>

                        <!-- Tiers distribution -->
                        <div class="bg-stone-900/40 p-4 rounded-xl border border-stone-850 flex flex-col gap-2">
                            <h3 class="text-[10px] font-bold uppercase text-stone-400 tracking-wider flex items-center gap-1">
                                <i data-lucide="pie-chart" class="w-3.5 h-3.5 text-emerald-500"></i> Role Level split
                            </h3>
                            <div class="flex flex-col gap-2 mt-2" id="level-chart-container">
                                <div class="text-[10.5px] text-stone-600">No listings categorized yet.</div>
                            </div>
                        </div>

                    </div>

                </div>

            </section>

        </main>

        <!-- Footer -->
        <footer class="border-t border-[#292524] px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 bg-[#0c0a09]">
            <span>© 2026 Job Authenticity Agent Corp. DevConsole Version 1.0.</span>
            <div class="flex gap-4 mt-2 sm:mt-0 font-medium">
                <span class="hover:text-stone-400 cursor-pointer">Local API Endpoint: http://localhost:8000</span>
            </div>
        </footer>

        <!-- Javascript Operations scripts -->
        <script>
            // Hardcoded simulation templates
            const TEMPLATES = {
                verified: {
                    title: "Machine Learning Researcher",
                    company: "Neural Systems Corp",
                    location: "Bengaluru, India (Hybrid)",
                    salary: "₹18L - ₹24L",
                    apply_url: "https://careers.neuralsystems.com/jobs/view-985",
                    description: "We are seeking a Machine Learning Research Engineer to develop, scale, and optimize core NLP transformer models. Ideal candidates must hold a Masters or PhD in CS and possess at least 3 years experience with Python, PyTorch, Docker, and AWS. Typical day involves processing text datasets, training models, and deploying production pipelines on AWS ECS."
                },
                suspicious: {
                    title: "Junior SDE fresher role",
                    company: "Apex Tech Labs",
                    location: "Mumbai, India",
                    salary: "₹3L - ₹5L",
                    apply_url: "https://naukri.com/job-listings/apex-fresher-sde",
                    description: "Apex Tech is hiring freshers with 0-1 year experience for senior reporting principal duties. Must be an expert in Python, SQL, React, Node, TypeScript, Docker, AWS, Kubernetes, Rust, C++, Django, FastAPI, Hadoop, Spark, Tableau, GCP, Terraform, and machine learning models. Candidates must be immediate joiners."
                },
                fake: {
                    title: "Remote Customer Assistant",
                    company: "Fast Earn Global Inc",
                    location: "Remote / Work From Home",
                    salary: "unlimited daily commission margins",
                    apply_url: "https://bit.ly/scam-apply-link",
                    description: "URGENT Rockstars!!! Earn Rs 50,000 daily from home. No experience required, any college freshers can apply! Just copy-paste text and earn passive income. Contact HR immediately on WhatsApp +919999999999 or email us at globalhr@gmail.com. Unlimited income potential!"
                }
            };

            function loadTemplate(type) {
                const data = TEMPLATES[type];
                if (!data) return;
                document.getElementById('title').value = data.title;
                document.getElementById('company').value = data.company;
                document.getElementById('location').value = data.location;
                document.getElementById('salary').value = data.salary;
                document.getElementById('apply_url').value = data.apply_url;
                document.getElementById('description').value = data.description;
            }

            async function submitScore(e) {
                e.preventDefault();
                const btn = e.target.querySelector('button[type="submit"]');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="animate-spin mr-2">⏳</span> Scoring Post...`;
                btn.disabled = true;

                const job = {
                    title: document.getElementById('title').value,
                    company: document.getElementById('company').value,
                    location: document.getElementById('location').value,
                    salary: document.getElementById('salary').value || null,
                    apply_url: document.getElementById('apply_url').value,
                    description: document.getElementById('description').value,
                    source_platform: document.getElementById('source_platform').value
                };

                try {
                    // 1. Post to Scorer
                    const resScore = await fetch('/score', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(job)
                    });

                    if (!resScore.ok) throw new Error('Scoring request failed');
                    const scoreData = await resScore.json();

                    // 2. Post to Save Database
                    const resSave = await fetch('/jobs/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            job,
                            trust_score: scoreData.trust_score,
                            tier: scoreData.tier,
                            flags: scoreData.flags,
                            reason: scoreData.reason
                        })
                    });

                    if (!resSave.ok) throw new Error('Saving listing failed');

                    // Reset form and reload data
                    e.target.reset();
                    alert('Job post scored and saved to pipeline database successfully!');
                    refreshData();

                } catch (err) {
                    console.error(err);
                    alert('Error executing pipeline: ' + err.message);
                } finally {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }
            }

            async function refreshData() {
                const refreshIcon = document.getElementById('refresh-icon');
                if (refreshIcon) refreshIcon.classList.add('animate-spin');

                try {
                    const resJobs = await fetch('/jobs/saved');
                    const jobs = await resJobs.json();
                    
                    const resAnalytics = await fetch('/analytics/summary');
                    const summary = await resAnalytics.json();

                    renderDashboard(jobs, summary);
                } catch (e) {
                    console.error('Failed to sync console datastore:', e);
                } finally {
                    if (refreshIcon) refreshIcon.classList.remove('animate-spin');
                }
            }

            function renderDashboard(jobs, summary) {
                // Update stats counter
                document.getElementById('stat-total').innerText = summary.total_saved;
                document.getElementById('stat-verified').innerText = summary.tier_counts.verified;
                document.getElementById('stat-scam').innerText = summary.tier_counts.fake + summary.tier_counts.suspicious;

                // Render Pipeline list
                const container = document.getElementById('pipeline-container');
                if (jobs.length === 0) {
                    container.innerHTML = `
                        <div class="py-16 text-center text-stone-500 flex flex-col items-center justify-center gap-3">
                            <i data-lucide="folder-open" class="w-10 h-15 text-stone-600 animate-pulse"></i>
                            <p class="text-xs">Console Database is empty. Submit a mock job in the sidebar to populate listings.</p>
                        </div>
                    `;
                    lucide.createIcons();
                    return;
                }

                const TIER_BG_COLORS = {
                    verified: 'border-emerald-900/60 bg-emerald-950/20 text-emerald-400',
                    suspicious: 'border-amber-900/60 bg-amber-950/20 text-amber-400',
                    fake: 'border-rose-900/60 bg-rose-950/20 text-rose-450'
                };

                let pipelineHtml = `<div class="flex flex-col gap-3">`;
                jobs.forEach(j => {
                    const badgeClass = TIER_BG_COLORS[j.tier] || '';
                    const flagsHtml = j.flags.length > 0 
                        ? j.flags.map(f => `<span class="bg-rose-950/40 text-rose-350 border border-rose-900/60 text-[9.5px] px-1.5 py-0.5 rounded">${f}</span>`).join(' ') 
                        : `<span class="bg-emerald-950/40 text-emerald-350 border border-emerald-900/60 text-[9.5px] px-1.5 py-0.5 rounded">✓ Clean Audit</span>`;

                    pipelineHtml += `
                        <div class="p-4 bg-stone-900/60 border border-stone-850 hover:border-stone-700 rounded-xl transition-all flex items-start justify-between gap-4">
                            <div class="flex-1 min-w-0">
                                <div class="flex gap-2 items-center flex-wrap mb-1.5">
                                    <span class="text-[9px] font-black uppercase px-2 py-0.5 rounded border border-stone-850 bg-stone-950 text-stone-400 tracking-wider">${j.source}</span>
                                    <span class="text-[9.5px] text-stone-500 font-semibold">${new Date(j.saved_at).toLocaleDateString()}</span>
                                </div>
                                <h4 class="text-[13.5px] font-bold text-stone-150 truncate leading-tight">${j.title}</h4>
                                <p class="text-xs text-stone-400 font-medium mt-0.5 mb-2">${j.company} • ${j.location}</p>
                                
                                <div class="flex flex-wrap gap-1.5 items-center">
                                    ${flagsHtml}
                                </div>
                            </div>

                            <div class="flex items-center gap-3">
                                <div class="flex flex-col items-end">
                                    <span class="text-xs font-black border rounded-lg px-2 py-0.5 ${badgeClass}">${j.trust_score}%</span>
                                    <span class="text-[8.5px] font-bold uppercase tracking-wider text-stone-500 mt-1 capitalize">${j.tier}</span>
                                </div>
                                <button onclick="deleteJob('${j.id}')" class="p-1.5 text-stone-500 hover:text-rose-450 hover:bg-stone-850 rounded-lg transition-colors cursor-pointer">
                                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
                pipelineHtml += `</div>`;
                container.innerHTML = pipelineHtml;

                // Render Tech Chart SVG bars
                const skillContainer = document.getElementById('skill-chart-container');
                if (summary.skills_heatmap.length === 0) {
                    skillContainer.innerHTML = `<div class="text-[10.5px] text-stone-600">No tech tools matched in saved descriptions yet.</div>`;
                } else {
                    let skillsHtml = `<div class="flex flex-col gap-2.5">`;
                    const maxVal = Math.max(...summary.skills_heatmap.map(x => x.value));
                    summary.skills_heatmap.slice(0, 5).forEach(s => {
                        const pct = (s.value / maxVal) * 100;
                        skillsHtml += `
                            <div>
                                <div class="flex justify-between text-[10.5px] text-stone-300 font-semibold mb-1">
                                    <span>${s.name}</span>
                                    <span class="text-blue-400 font-black">${s.value} listings</span>
                                </div>
                                <div class="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-stone-850">
                                    <div class="bg-blue-500 h-full rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                                </div>
                            </div>
                        `;
                    });
                    skillsHtml += `</div>`;
                    skillContainer.innerHTML = skillsHtml;
                }

                // Render Experience Level distribution
                const levelContainer = document.getElementById('level-chart-container');
                const exp = summary.experience_levels;
                const totalExp = exp.entry + exp.mid + exp.senior;
                
                if (totalExp === 0) {
                    levelContainer.innerHTML = `<div class="text-[10.5px] text-stone-600">No listings categorized yet.</div>`;
                } else {
                    const entryPct = ((exp.entry / totalExp) * 100).toFixed(0);
                    const midPct = ((exp.mid / totalExp) * 100).toFixed(0);
                    const seniorPct = ((exp.senior / totalExp) * 100).toFixed(0);

                    levelContainer.innerHTML = `
                        <div class="flex flex-col gap-3 justify-center h-full">
                            <div class="flex justify-between text-[11px] text-stone-300 font-medium">
                                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Entry Level</span>
                                <span class="font-bold text-emerald-400">${exp.entry} (${entryPct}%)</span>
                            </div>
                            <div class="flex justify-between text-[11px] text-stone-300 font-medium">
                                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Mid Level</span>
                                <span class="font-bold text-blue-400">${exp.mid} (${midPct}%)</span>
                            </div>
                            <div class="flex justify-between text-[11px] text-stone-300 font-medium">
                                <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Senior Level</span>
                                <span class="font-bold text-purple-400">${exp.senior} (${seniorPct}%)</span>
                            </div>
                        </div>
                    `;
                }

                lucide.createIcons();
            }

            async function deleteJob(id) {
                if (!confirm('Are you sure you want to delete this listing from the console?')) return;
                try {
                    const res = await fetch('/jobs/' + id, { method: 'DELETE' });
                    if (res.ok) {
                        refreshData();
                    }
                } catch (e) {
                    console.error(e);
                }
            }

            // Initial load presets
            loadTemplate('verified');
            // Periodically refresh initial dataset
            window.addEventListener('DOMContentLoaded', () => {
                lucide.createIcons();
                refreshData();
            });
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content, status_code=200)

@app.post("/score")
async def score_job_endpoint(job: JobPost):
    # Create content hash to prevent redundant LLM scoring calls
    normalized_string = f"{job.title.strip()}|{job.company.strip()}|{job.description.strip()}|{job.location.strip()}|{job.salary or ''}|{job.apply_url.strip()}"
    content_hash = "score:" + hashlib.sha256(normalized_string.encode("utf-8")).hexdigest()
    
    # 1. Look up cached analysis
    if redis_client:
        try:
            cached = redis_client.get(content_hash)
            if cached:
                logger.info("Retrieved score analysis from Redis cache.")
                result = json.loads(cached)
                result["cached"] = True
                return result
        except Exception as e:
            logger.warning(f"Error reading from Redis cache: {e}")
            
    elif content_hash in IN_MEMORY_CACHE:
        logger.info("Retrieved score analysis from in-memory cache.")
        result = IN_MEMORY_CACHE[content_hash].copy()
        result["cached"] = True
        return result

    # 2. Run analysis pipelines
    job_text = (
        f"Title: {job.title}\n"
        f"Company: {job.company}\n"
        f"Location: {job.location}\n"
        f"Salary: {job.salary or 'Not Specified'}\n"
        f"Apply URL: {job.apply_url}\n"
        f"Description: {job.description}"
    )

    if GEMINI_API_KEY:
        logger.info("Executing parallel live LLM analysis using Gemini API.")
        results_list = await asyncio.gather(
            call_gemini_check(LANGUAGE_PROMPT, job_text),
            call_gemini_check(REALITY_PROMPT, job_text),
            call_gemini_check(CONSISTENCY_PROMPT, job_text),
            call_gemini_check(CONTACT_PROMPT, job_text),
            call_gemini_check(PATTERN_PROMPT, job_text)
        )
        checks_map = dict(zip(["language", "reality", "consistency", "contact", "pattern"], results_list))
    else:
        logger.info("No Gemini API key detected. Running regex-based local mock scoring pipeline.")
        checks_map = local_mock_eval(job)

    # 3. Aggregate checks
    final_evaluation = aggregate_scores(checks_map)
    final_evaluation["cached"] = False

    # 4. Save results to Cache
    if redis_client:
        try:
            redis_client.setex(content_hash, 86400, json.dumps(final_evaluation))  # Cache for 24 hours
        except Exception as e:
            logger.warning(f"Error saving to Redis cache: {e}")
    else:
        IN_MEMORY_CACHE[content_hash] = final_evaluation

    return final_evaluation

@app.post("/score/page")
async def score_page_endpoint(req: PageAnalysisRequest):
    # Truncate raw text to a maximum size of 15000 characters to keep payload and token costs safe
    raw_text = req.raw_text[:15000]
    
    # Create content hash using SHA-256 of raw text and URL to prevent redundant calls
    normalized_string = f"page:{req.url.strip()}|{raw_text.strip()}"
    content_hash = "score:page:" + hashlib.sha256(normalized_string.encode("utf-8")).hexdigest()
    
    # 1. Look up cached analysis
    if redis_client:
        try:
            cached = redis_client.get(content_hash)
            if cached:
                logger.info("Retrieved page score analysis from Redis cache.")
                result = json.loads(cached)
                result["cached"] = True
                return result
        except Exception as e:
            logger.warning(f"Error reading page cache from Redis: {e}")
            
    elif content_hash in IN_MEMORY_CACHE:
        logger.info("Retrieved page score analysis from in-memory cache.")
        result = IN_MEMORY_CACHE[content_hash].copy()
        result["cached"] = True
        return result

    # 2. Run analysis
    if GEMINI_API_KEY:
        logger.info("Executing live AI page analyzer using Gemini API.")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
        
        payload = {
            "contents": [{
                "parts": [{
                    "text": f"Webpage URL: {req.url}\n\nWebpage Raw Text:\n{raw_text}"
                }]
            }],
            "systemInstruction": {
                "parts": [{
                    "text": PAGE_ANALYZER_PROMPT
                }]
            },
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.0
            }
        }
        
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                response = await client.post(url, json=payload)
                if response.status_code != 200:
                    logger.error(f"Gemini page analyzer returned error {response.status_code}: {response.text}")
                    logger.info("Falling back to local mock evaluation due to API error.")
                    analysis_result = local_mock_page_eval(req.url, raw_text, req.title_hint, req.company_hint)
                else:
                    data = response.json()
                    candidate_text = data["candidates"][0]["content"]["parts"][0]["text"]
                    analysis_result = json.loads(candidate_text.strip())
            except Exception as e:
                logger.exception("Error during live Gemini page analysis call")
                logger.info("Falling back to local mock evaluation due to connection exception.")
                analysis_result = local_mock_page_eval(req.url, raw_text, req.title_hint, req.company_hint)
    else:
        logger.info("No Gemini API key detected. Running regex-based local mock page analyzer.")
        analysis_result = local_mock_page_eval(req.url, raw_text, req.title_hint, req.company_hint)

    # 3. Aggregate if it is a job
    if analysis_result.get("is_job"):
        extracted_job = analysis_result["extracted_job"]
        checks = analysis_result["checks"]
        
        # Run standard aggregator
        aggregated = aggregate_scores(checks)
        
        # Package full response
        final_result = {
            "is_job": True,
            "job": {
                "title": extracted_job.get("title", "Unknown Title"),
                "company": extracted_job.get("company", "Unknown Company"),
                "location": extracted_job.get("location", "Not Listed"),
                "salary": extracted_job.get("salary"),
                "description": extracted_job.get("description", ""),
                "apply_url": req.url,
                "source_platform": detect_platform(req.url)
            },
            "score": {
                "trust_score": aggregated["trust_score"],
                "tier": aggregated["tier"],
                "flags": aggregated["flags"],
                "reason": aggregated["reason"],
                "checks": checks
            },
            "cached": False
        }
    else:
        final_result = {
            "is_job": False,
            "reason": analysis_result.get("reason", "Not a job listing."),
            "cached": False
        }

    # 4. Save results to cache
    if redis_client:
        try:
            redis_client.setex(content_hash, 86400, json.dumps(final_result))  # Cache for 24 hours
        except Exception as e:
            logger.warning(f"Error saving page analysis to Redis cache: {e}")
    else:
        IN_MEMORY_CACHE[content_hash] = final_result

    return final_result

@app.post("/jobs/save")
async def save_job_endpoint(req: SaveJobRequest):
    # Check if duplicate in mock database
    normalized_string = f"{req.job.title.strip()}|{req.job.company.strip()}|{req.job.description.strip()}|{req.job.location.strip()}|{req.job.salary or ''}|{req.job.apply_url.strip()}"
    job_hash = hashlib.sha256(normalized_string.encode("utf-8")).hexdigest()
    
    # Check for duplicate - return existing job details (Idempotent success)
    for existing in SAVED_JOBS_DB:
        if existing["content_hash"] == job_hash:
            logger.info("Job listing already saved. Returning existing record for idempotency.")
            return existing
            
    # Add fake database record
    new_job = {
        "id": f"job-{len(SAVED_JOBS_DB) + 1}",
        "content_hash": job_hash,
        "title": req.job.title,
        "company": req.job.company,
        "description": req.job.description,
        "salary": req.job.salary,
        "location": req.job.location,
        "apply_url": req.job.apply_url,
        "source": req.job.source_platform,
        "posted_date": datetime.utcnow().date().isoformat(),
        "expires_at": (datetime.utcnow() + timedelta(days=30)).date().isoformat(),
        "trust_score": req.trust_score,
        "tier": req.tier,
        "flags": req.flags,
        "reason": req.reason,
        "status": req.status or "saved",
        "notes": req.notes,
        "saved_at": datetime.utcnow().isoformat()
    }
    
    SAVED_JOBS_DB.append(new_job)
    logger.info(f"Saved job post '{req.job.title}' to simulated datastore.")
    return new_job

@app.get("/jobs/saved")
async def get_saved_jobs_endpoint():
    return SAVED_JOBS_DB

@app.delete("/jobs/{job_id}")
async def delete_saved_job_endpoint(job_id: str):
    global SAVED_JOBS_DB
    original_len = len(SAVED_JOBS_DB)
    SAVED_JOBS_DB = [job for job in SAVED_JOBS_DB if job["id"] != job_id]
    
    if len(SAVED_JOBS_DB) == original_len:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job post not found in saved list."
        )
        
    return {"status": "ok", "message": f"Successfully deleted job {job_id}."}

@app.get("/analytics/summary")
async def get_analytics_summary_endpoint():
    """
    Computes aggregates for saved job records, generating responsive outputs for dashboard visualizations.
    """
    if not SAVED_JOBS_DB:
        return {
            "total_saved": 0,
            "tier_counts": {"verified": 0, "suspicious": 0, "fake": 0},
            "skills_heatmap": [],
            "category_distribution": [],
            "experience_levels": {"entry": 0, "mid": 0, "senior": 0},
            "score_distribution": []
        }
        
    tier_counts = {"verified": 0, "suspicious": 0, "fake": 0}
    skills_map = {}
    categories_map = {}
    exp_levels = {"entry": 0, "mid": 0, "senior": 0}
    scores = []
    
    # Tech tags to match in descriptions for heatmap
    tech_tags = ["python", "javascript", "typescript", "react", "next.js", "node.js", "fastapi", "sql", "postgresql", "docker", "aws", "kubernetes", "java", "c++", "go", "ruby", "django", "html", "css", "machine learning", "ai", "pandas"]
    
    for job in SAVED_JOBS_DB:
        # 1. Tier Counts
        tier = job["tier"]
        if tier in tier_counts:
            tier_counts[tier] += 1
            
        # 2. Score List
        scores.append(job["trust_score"])
        
        # 3. Match Tech tags
        desc_lower = (job["description"] or "").lower()
        title_lower = job["title"].lower()
        for tag in tech_tags:
            if tag in desc_lower or tag in title_lower:
                skills_map[tag] = skills_map.get(tag, 0) + 1
                
        # 4. Simple Category guessing
        is_devops = any(x in title_lower for x in ["devops", "cloud", "sre", "infrastructure"])
        is_data = any(x in title_lower for x in ["data", "analyst", "analytics", "bi"])
        is_ml_ai = any(x in title_lower for x in ["ml", "machine learning", "ai", "artificial intelligence", "nlp", "deep learning"])
        is_product = "product" in title_lower
        
        if is_devops:
            category = "DevOps"
        elif is_ml_ai:
            category = "ML/AI Engineer"
        elif is_data:
            category = "Data Analyst"
        elif is_product:
            category = "Product Manager"
        else:
            category = "Software Engineer"
            
        categories_map[category] = categories_map.get(category, 0) + 1
        
        # 5. Experience categorization
        yoe_match = re.search(r"(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years|yoe|yrs)", desc_lower)
        seniority_terms = ["principal", "staff", "lead", "architect", "senior", "head", "director"]
        is_senior = any(term in title_lower for term in seniority_terms)
        
        if yoe_match:
            min_yoe = int(yoe_match.group(1))
            if min_yoe >= 5:
                exp_levels["senior"] += 1
            elif min_yoe >= 2:
                exp_levels["mid"] += 1
            else:
                exp_levels["entry"] += 1
        elif is_senior:
            exp_levels["senior"] += 1
        else:
            # Default fallback for freshers or empty descriptions
            if "fresher" in desc_lower or "junior" in title_lower or "entry" in title_lower:
                exp_levels["entry"] += 1
            else:
                exp_levels["mid"] += 1

    # Format fields for Recharts consumption
    skills_heatmap = [{"name": skill.capitalize(), "value": count} for skill, count in sorted(skills_map.items(), key=lambda x: x[1], reverse=True)[:10]]
    category_distribution = [{"name": cat, "value": count} for cat, count in categories_map.items()]
    
    # Generate simple histogram for score distribution (groups of 10)
    histogram_map = {f"{i*10}-{(i+1)*10}": 0 for i in range(10)}
    for score in scores:
        bucket_index = min(9, score // 10)
        bucket_key = f"{bucket_index*10}-{(bucket_index+1)*10}"
        histogram_map[bucket_key] += 1
    score_distribution = [{"bucket": k, "count": v} for k, v in histogram_map.items()]

    return {
        "total_saved": len(SAVED_JOBS_DB),
        "tier_counts": tier_counts,
        "skills_heatmap": skills_heatmap,
        "category_distribution": category_distribution,
        "experience_levels": exp_levels,
        "score_distribution": score_distribution
    }

if __name__ == "__main__":
    import uvicorn
    # Load configuration port or fallback to default with auto-reload enabled
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
