import { JobPost, ScoredJob, SavedJob } from '../shared/types';

class ContentApiClient {
  static scorePage(url: string, rawText: string, titleHint?: string, companyHint?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SCORE_PAGE', url, rawText, titleHint, companyHint }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown score error'));
        }
      });
    });
  }

  static saveJob(job: JobPost, scored: ScoredJob, notes?: string): Promise<SavedJob> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'SAVE_JOB', job, scored, notes }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown save error'));
        }
      });
    });
  }

  static getSavedJobs(): Promise<SavedJob[]> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'GET_SAVED_JOBS' }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Unknown fetch error'));
        }
      });
    });
  }

  static deleteSavedJob(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'DELETE_SAVED_JOB', id }, (response) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (response && response.success) {
          resolve();
        } else {
          reject(new Error(response?.error || 'Unknown delete error'));
        }
      });
    });
  }
}

const ApiClient = ContentApiClient;

console.log('[Job Authenticity Agent] Injected content script active.');

class PersistentSidebar {
  private container: HTMLDivElement | null = null;
  private isOpen: boolean = false;
  private isLoading: boolean = false;
  private pageData: any | null = null;
  private savedJobs: SavedJob[] = [];
  private isSaving: boolean = false;
  private isSaved: boolean = false;
  private activeTab: 'analysis' | 'saved' = 'analysis';

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    // Check saved state from chrome storage
    try {
      chrome.storage.local.get(['sidebarOpen'], (result) => {
        this.isOpen = !!result.sidebarOpen;
        this.inject();
        if (this.isOpen) {
          this.triggerAnalysis();
        }
      });
    } catch (e) {
      console.warn('[Job Authenticity Agent] Chrome storage not available:', e);
      this.inject();
    }

    // Listen for toggle messages from service worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'TOGGLE_SIDEBAR') {
        this.toggle();
      }
    });
  }

  public inject(): void {
    const existing = document.getElementById('job-authenticity-agent-sidebar');
    if (existing) existing.remove();

    this.container = document.createElement('div');
    this.container.id = 'job-authenticity-agent-sidebar';
    this.applyStyles();
    this.render();
    document.body.appendChild(this.container);

    // Initial load of saved jobs in background
    this.loadSavedListings();
  }

  public async toggle(): Promise<void> {
    this.isOpen = !this.isOpen;
    
    // Save state
    try {
      chrome.storage.local.set({ sidebarOpen: this.isOpen });
    } catch (e) {
      console.warn('[Job Authenticity Agent] Failed to persist sidebar state:', e);
    }

    if (this.container) {
      this.container.style.transform = this.isOpen ? 'translateX(0)' : 'translateX(-100%)';
      const handleBtn = this.container.querySelector('.sidebar-handle-btn') as HTMLElement;
      if (handleBtn) {
        handleBtn.innerHTML = this.isOpen ? '◀' : '🛡️';
        handleBtn.style.backgroundColor = this.isOpen ? 'rgba(20, 20, 20, 0.96)' : '#2563eb';
        handleBtn.style.border = `1px solid rgba(255, 255, 255, ${this.isOpen ? '0.08' : '0.2'})`;
        handleBtn.style.borderLeft = 'none';
        handleBtn.style.boxShadow = this.isOpen ? 'none' : '0 4px 20px rgba(37, 99, 235, 0.5)';
      }
    }

    if (this.isOpen) {
      await this.triggerAnalysis();
    }
  }

  private applyStyles(): void {
    if (!this.container) return;

    Object.assign(this.container.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: '360px',
      height: '100vh',
      zIndex: '9999999',
      backgroundColor: 'rgba(20, 20, 20, 0.96)',
      backdropFilter: 'blur(16px) saturate(180%)',
      webkitBackdropFilter: 'blur(16px) saturate(180%)',
      color: '#f5f5f4',
      fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      boxShadow: this.isOpen ? '0 0 40px rgba(0, 0, 0, 0.7), 1px 0 1px rgba(255, 255, 255, 0.1)' : 'none',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      display: 'flex',
      flexDirection: 'column',
      boxSizing: 'border-box',
      transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      transform: this.isOpen ? 'translateX(0)' : 'translateX(-100%)',
    });
  }

  public async triggerAnalysis(): Promise<void> {
    if (!this.isOpen) return;
    
    this.isLoading = true;
    this.isSaved = false;
    this.render();

    try {
      // Gather raw page text content (truncate to keep it within safe limits)
      const rawText = document.body.innerText.substring(0, 10000);
      const url = window.location.href;

      // Extract DOM hints for robust local fallbacks
      const titleHint = document.title;
      let companyHint = '';
      const getCleanText = (selector: string): string => {
        const el = document.querySelector(selector);
        return el ? el.textContent?.trim() || '' : '';
      };
      companyHint = getCleanText('.job-details-jobs-unified-top-card__company-name') || 
                    getCleanText('.topcard__org-name-link') || 
                    getCleanText('.jobs-unified-top-card__company-name') ||
                    getCleanText('.jobs-details-top-card__company-url') ||
                    getCleanText('[data-company-name="true"]') || 
                    getCleanText('.jobsearch-CompanyInfoWithoutHeaderImageUsed') || 
                    getCleanText('.inlineHeader-companyName') ||
                    getCleanText('.jd-header-comp-name') || 
                    getCleanText('.pad-rt-8') ||
                    getCleanText('[data-test="employer-name"]') || 
                    getCleanText('.JobDetails_employerName__Omxw5') ||
                    getCleanText('.company_name') || '';

      console.log('[Job Authenticity Agent] Fetching page evaluation with hints...');
      const response = await ApiClient.scorePage(url, rawText, titleHint, companyHint);
      this.pageData = response;

      // Auto-save Verified listings
      if (this.pageData.is_job && this.pageData.score.tier === 'verified') {
        try {
          await ApiClient.saveJob(this.pageData.job, {
            trust_score: this.pageData.score.trust_score,
            tier: this.pageData.score.tier,
            flags: this.pageData.score.flags,
            reason: this.pageData.score.reason,
            cached: false
          });
          this.isSaved = true;
          this.loadSavedListings(); // reload list
        } catch (err) {
          // Silent catch for duplicate saving
          if (String(err).includes('already saved')) {
            this.isSaved = true;
          }
        }
      }
    } catch (error) {
      console.error('[Job Authenticity Agent] Page analysis failed:', error);
      this.pageData = { is_job: false, reason: 'Failed to connect to scoring server.' };
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private async loadSavedListings(): Promise<void> {
    try {
      this.savedJobs = await ApiClient.getSavedJobs();
      if (this.container && this.activeTab === 'saved') {
        this.render();
      }
    } catch (e) {
      console.warn('[Job Authenticity Agent] Failed to fetch saved jobs:', e);
    }
  }

  private async handleSave(): Promise<void> {
    if (!this.pageData || !this.pageData.is_job || this.isSaving || this.isSaved) return;

    this.isSaving = true;
    this.render();

    try {
      const scoreObj: ScoredJob = {
        trust_score: this.pageData.score.trust_score,
        tier: this.pageData.score.tier,
        flags: this.pageData.score.flags,
        reason: this.pageData.score.reason,
        cached: false
      };
      await ApiClient.saveJob(this.pageData.job, scoreObj);
      this.isSaved = true;
      await this.loadSavedListings();
    } catch (err) {
      console.error('Manual save failed:', err);
      alert('Failed to save job post. Ensure scoring server is active.');
    } finally {
      this.isSaving = false;
      this.render();
    }
  }

  private async handleDeleteJob(id: string): Promise<void> {
    try {
      await ApiClient.deleteSavedJob(id);
      this.loadSavedListings();
    } catch (e) {
      console.error('Delete job failed:', e);
    }
  }

  private render(): void {
    if (!this.container) return;

    // Reset styles just in case
    this.applyStyles();

    // 1. Base Shell Markup
    this.container.innerHTML = `
      <!-- Drag/Toggle Handle on right edge -->
      <div class="sidebar-handle-btn" style="
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        width: 32px;
        height: 60px;
        background-color: ${this.isOpen ? 'rgba(20, 20, 20, 0.96)' : '#2563eb'};
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, ${this.isOpen ? '0.08' : '0.2'});
        border-left: none;
        border-radius: 0 12px 12px 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${this.isOpen ? 'none' : '0 4px 20px rgba(37, 99, 235, 0.5)'};
        font-size: 15px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 999999999;
        text-shadow: ${this.isOpen ? 'none' : '0 0 4px rgba(255,255,255,0.4)'};
      ">${this.isOpen ? '◀' : '🛡️'}</div>

      <!-- Main Panel Wrapper -->
      <div style="display: flex; flex-direction: column; height: 100%; box-sizing: border-box; overflow: hidden;">
        
        <!-- Header -->
        <div style="padding: 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(0,0,0,0.2);">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 28px; height: 28px; background: #3b82f6; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; box-shadow: 0 0 10px rgba(59,130,246,0.3);">A</div>
            <div>
              <h2 style="margin: 0; font-size: 13.5px; font-weight: 800; tracking-wide; text-transform: uppercase;">Authenticity Agent</h2>
              <div style="display: flex; align-items: center; gap: 5px; margin-top: 2px;">
                <span style="width: 5px; height: 5px; border-radius: 50%; background: #10b981; box-shadow: 0 0 5px #10b981;"></span>
                <span style="font-size: 9px; color: #a3a3a3; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Live Page Scraper</span>
              </div>
            </div>
          </div>
          <button class="sidebar-close-btn" style="background: none; border: none; color: #737373; font-size: 16px; cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; transition: background 0.2s;">×</button>
        </div>

        <!-- Navigation Tabs -->
        <div style="display: flex; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0,0,0,0.1);">
          <button class="tab-btn-analysis" style="
            flex: 1;
            background: none;
            border: none;
            padding: 10px;
            font-size: 11.5px;
            font-weight: 700;
            color: ${this.activeTab === 'analysis' ? '#3b82f6' : '#737373'};
            border-bottom: 2px solid ${this.activeTab === 'analysis' ? '#3b82f6' : 'transparent'};
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          ">Active Analysis</button>
          <button class="tab-btn-saved" style="
            flex: 1;
            background: none;
            border: none;
            padding: 10px;
            font-size: 11.5px;
            font-weight: 700;
            color: ${this.activeTab === 'saved' ? '#3b82f6' : '#737373'};
            border-bottom: 2px solid ${this.activeTab === 'saved' ? '#3b82f6' : 'transparent'};
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.3px;
          ">Saved Pipeline (${this.savedJobs.length})</button>
        </div>

        <!-- Content Area -->
        <div class="sidebar-scrollable-content" style="flex: 1; overflow-y: auto; padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; gap: 14px;">
          ${this.renderActiveTab()}
        </div>

        <!-- Footer -->
        <div style="padding: 10px; border-t: 1px solid rgba(255, 255, 255, 0.08); font-size: 9px; text-align: center; color: #525252; background: rgba(0,0,0,0.2);">
          Job Authenticity SaaS • Dev Console Mode
        </div>
      </div>
    `;

    // 2. Wire Element Event Listeners
    const handleBtn = this.container.querySelector('.sidebar-handle-btn');
    handleBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    const closeBtn = this.container.querySelector('.sidebar-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    const tabAnalysisBtn = this.container.querySelector('.tab-btn-analysis');
    tabAnalysisBtn?.addEventListener('click', () => {
      this.activeTab = 'analysis';
      this.render();
    });

    const tabSavedBtn = this.container.querySelector('.tab-btn-saved');
    tabSavedBtn?.addEventListener('click', () => {
      this.activeTab = 'saved';
      this.render();
    });

    // Save button event listener
    const saveBtn = this.container.querySelector('.sidebar-save-btn');
    saveBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleSave();
    });

    // Delete buttons event listener
    const deleteBtns = this.container.querySelectorAll('.delete-saved-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.id;
        if (id && confirm('Remove this listing from your saved pipeline?')) {
          this.handleDeleteJob(id);
        }
      });
    });

    // Accordion toggles
    const checkHeaders = this.container.querySelectorAll('.check-accordion-header');
    checkHeaders.forEach(header => {
      header.addEventListener('click', () => {
        const checkKey = (header as HTMLElement).dataset.check;
        const detailEl = this.container?.querySelector(`.check-details-${checkKey}`) as HTMLElement;
        const arrowEl = header.querySelector('.accordion-arrow') as HTMLElement;
        if (detailEl && arrowEl) {
          const isCollapsed = detailEl.style.display === 'none' || !detailEl.style.display;
          detailEl.style.display = isCollapsed ? 'block' : 'none';
          arrowEl.style.transform = isCollapsed ? 'rotate(90deg)' : 'rotate(0deg)';
        }
      });
    });
  }

  private renderActiveTab(): string {
    if (this.activeTab === 'saved') {
      return this.renderSavedList();
    }

    if (this.isLoading) {
      return this.renderLoading();
    }

    if (!this.pageData) {
      return `
        <div style="text-align: center; color: #a3a3a3; padding: 40px 10px;">
          <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
          <p style="margin: 0; font-size: 12px; line-height: 1.5;">Click the extension icon or toggle handle to analyze this webpage context.</p>
        </div>
      `;
    }

    if (!this.pageData.is_job) {
      return `
        <div style="text-align: center; color: #e5e5e5; padding: 30px 10px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">
          <div style="font-size: 28px; margin-bottom: 10px;">ℹ️</div>
          <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700;">No Job Post Identified</h4>
          <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #a3a3a3;">
            Our AI did not detect a job listing context on this page.<br><br>
            Please navigate to a job post on <strong>LinkedIn, Indeed, Naukri, Glassdoor, or Internshala</strong>.
          </p>
        </div>
      `;
    }

    return this.renderAnalysisResults();
  }

  private renderLoading(): string {
    return `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; gap: 16px;">
        <div class="agent-loader-spin" style="
          width: 32px;
          height: 32px;
          border: 3px solid rgba(255,255,255,0.08);
          border-top: 3px solid #3b82f6;
          border-radius: 50%;
          animation: spin-kf 1s linear infinite;
        "></div>
        <div style="text-align: center;">
          <h4 style="margin: 0; font-size: 12.5px; font-weight: 700; color: #e5e5e5;">AI Agent Scanning Page...</h4>
          <p style="margin: 4px 0 0 0; font-size: 10px; color: #737373;">Extracting job metadata & scoring risk</p>
        </div>
        <style>
          @keyframes spin-kf {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
  }

  private renderAnalysisResults(): string {
    const { job, score } = this.pageData;
    const { trust_score, tier, reason, checks } = score;

    let tierColor = '#10b981';
    let tierText = 'Verified';
    let gradientBg = 'conic-gradient(#10b981 0%, #10b981 85%, transparent 85%)';
    if (tier === 'suspicious') {
      tierColor = '#f59e0b';
      tierText = 'Suspicious';
    } else if (tier === 'fake') {
      tierColor = '#ef4444';
      tierText = 'High Risk';
    }

    // Circular gauge properties
    const circumference = 2 * Math.PI * 18;
    const offset = circumference - (trust_score / 100) * circumference;

    return `
      <!-- Score Circle Header Card -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 16px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #737373; tracking-wider; display: block;">Authenticity Rating</span>
          <h3 style="margin: 4px 0 2px 0; font-size: 18px; font-weight: 900; color: ${tierColor};">${tierText}</h3>
          <span style="font-size: 9px; font-weight: 600; color: #a3a3a3;">Confidence Match</span>
        </div>

        <!-- SVG Circular Progress -->
        <div style="position: relative; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 50px; height: 50px; transform: rotate(-90deg);">
            <circle cx="25" cy="25" r="18" stroke="rgba(255,255,255,0.05)" stroke-width="3" fill="transparent"/>
            <circle cx="25" cy="25" r="18" stroke="${tierColor}" stroke-width="3" fill="transparent"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              style="transition: stroke-dashoffset 0.5s ease-in-out;"
            />
          </svg>
          <span style="position: absolute; font-size: 11.5px; font-weight: 900; color: #ffffff;">${trust_score}%</span>
        </div>
      </div>

      <!-- Quick Extracted Info -->
      <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 12px; padding: 12px;">
        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #525252; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Extracted Metadata</span>
        <h4 style="margin: 0; font-size: 13px; font-weight: 800; color: #ffffff; line-height: 1.3;" title="${job.title}">${job.title}</h4>
        <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 500; color: #a3a3a3;">${job.company} • ${job.location}</p>
        ${job.salary ? `<div style="margin-top: 6px; font-size: 10.5px; font-weight: 700; color: #3b82f6;">💵 ${job.salary}</div>` : ''}
      </div>

      <!-- Verdict Paragraph -->
      <div style="font-size: 11.5px; line-height: 1.45; color: #d4d4d4;">
        <strong>Audit Summary:</strong> ${reason}
      </div>

      <!-- Detailed Score Audits Accordion -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #525252; letter-spacing: 0.5px; margin-bottom: 2px;">Evaluation Checks</span>
        
        ${this.renderCheckRow('language', 'Language Audit', checks.language)}
        ${this.renderCheckRow('reality', 'Reality Match', checks.reality)}
        ${this.renderCheckRow('consistency', 'Consistency Check', checks.consistency)}
        ${this.renderCheckRow('contact', 'Contact Cyber Audit', checks.contact)}
        ${this.renderCheckRow('pattern', 'Spam Pattern Scan', checks.pattern)}
      </div>

      <!-- Save Actions -->
      <button class="sidebar-save-btn" style="
        width: 100%;
        background-color: ${this.isSaved ? '#10b981' : '#2563eb'};
        color: white;
        border: none;
        padding: 10px;
        font-size: 12px;
        font-weight: 700;
        border-radius: 8px;
        cursor: pointer;
        transition: background-color 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 6px;
      " ${this.isSaving || this.isSaved ? 'disabled' : ''}>
        ${this.isSaving ? 'Saving...' : this.isSaved ? '✓ Saved to Dashboard' : 'Save Job Posting'}
      </button>
    `;
  }

  private renderCheckRow(key: string, label: string, checkObj: any): string {
    const isPassing = checkObj.score >= 7;
    const scoreColor = checkObj.score >= 7 ? '#10b981' : checkObj.score >= 4 ? '#f59e0b' : '#ef4444';
    const indicatorIcon = isPassing ? '✓' : '⚠️';

    const flagsHtml = checkObj.flags && checkObj.flags.length > 0
      ? checkObj.flags.map((f: string) => `
          <li style="margin-bottom: 4px; font-size: 9.5px; color: #fca5a5; display: flex; align-items: flex-start; gap: 5px;">
            <span style="color: #ef4444; font-size: 11px; line-height: 1;">•</span>
            <span>${f}</span>
          </li>
        `).join('')
      : `<li style="font-size: 9.5px; color: #a7f3d0; list-style: none;">✓ No red flags identified.</li>`;

    return `
      <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden;">
        <div class="check-accordion-header" data-check="${key}" style="padding: 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${scoreColor}; font-size: 12px; font-weight: 900;">${indicatorIcon}</span>
            <span style="font-size: 11px; font-weight: 700; color: #e5e5e5;">${label}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 10px; font-weight: 800; color: ${scoreColor};">${checkObj.score}/10</span>
            <span class="accordion-arrow" style="font-size: 8px; color: #737373; transition: transform 0.2s;">▶</span>
          </div>
        </div>
        
        <!-- Accordion Details (Hidden initially) -->
        <div class="check-details-${key}" style="display: none; padding: 0px 10px 10px 10px; border-top: 1px solid rgba(255,255,255,0.02); background: rgba(0,0,0,0.15);">
          <p style="margin: 8px 0; font-size: 10px; color: #a3a3a3; line-height: 1.35;">${checkObj.reason}</p>
          <div style="border-t: 1px solid rgba(255,255,255,0.02); padding-top: 6px;">
            <ul style="margin: 0; padding: 0; list-style: none;">
              ${flagsHtml}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  private renderSavedList(): string {
    if (this.savedJobs.length === 0) {
      return `
        <div style="text-align: center; color: #525252; padding: 60px 10px;">
          <div style="font-size: 32px; margin-bottom: 12px;">📁</div>
          <p style="margin: 0; font-size: 11px; line-height: 1.4;">Your saved listings pipeline is currently empty. Bookmark verified listings to view them here.</p>
        </div>
      `;
    }

    const TIER_COLORS = {
      verified: '#10b981',
      suspicious: '#f59e0b',
      fake: '#ef4444'
    };

    const listHtml = this.savedJobs.map(job => {
      const tierColor = TIER_COLORS[job.tier] || '#a3a3a3';
      return `
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); hover:border-white; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; position: relative;">
          <!-- Top indicators -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.06); padding: 1.5px 5px; border-radius: 4px; color: #a3a3a3;">${job.source_platform}</span>
            <span style="font-size: 9px; font-weight: 800; color: ${tierColor};">${job.trust_score}% Trust</span>
          </div>

          <!-- Job Details -->
          <div>
            <h4 style="margin: 0; font-size: 11.5px; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;">${job.title}</h4>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #a3a3a3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${job.company} • ${job.location}</p>
          </div>

          <!-- Actions -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.02); padding-top: 6px;">
            <a href="${job.apply_url}" target="_blank" style="font-size: 9.5px; font-weight: 700; color: #3b82f6; text-decoration: none; display: flex; align-items: center; gap: 3px;">
              Apply Link ↗
            </a>
            <button class="delete-saved-btn" data-id="${job.id}" style="background: none; border: none; color: #ef4444; font-size: 9px; cursor: pointer; padding: 2px; font-weight: 700;">
              Remove
            </button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #525252; letter-spacing: 0.5px; margin-bottom: 2px;">Saved Pipeline Listings</span>
        ${listHtml}
      </div>
    `;
  }
}

// --- Controller Orchestration ---
let lastUrl = '';
let activeSidebar: PersistentSidebar | null = null;

async function processPage() {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;
  lastUrl = currentUrl;

  console.log(`[Job Authenticity Agent] Navigated to new page: ${currentUrl}`);

  // Re-run analysis if the sidebar exists and is currently OPEN
  if (activeSidebar) {
    await activeSidebar.triggerAnalysis();
  }
}

// Initial Instantiation
activeSidebar = new PersistentSidebar();

// SPA support: check for URL updates on click / scroll mutation events
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    processPage();
  }
});
observer.observe(document.body, { childList: true, subtree: true });
