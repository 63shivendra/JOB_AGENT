var u=Object.defineProperty;var v=(l,e,i)=>e in l?u(l,e,{enumerable:!0,configurable:!0,writable:!0,value:i}):l[e]=i;var p=(l,e,i)=>(v(l,typeof e!="symbol"?e+"":e,i),i);class m{static scorePage(e,i,t,s){return new Promise((a,n)=>{chrome.runtime.sendMessage({type:"SCORE_PAGE",url:e,rawText:i,titleHint:t,companyHint:s},o=>{if(chrome.runtime.lastError)return n(new Error(chrome.runtime.lastError.message));o&&o.success?a(o.data):n(new Error((o==null?void 0:o.error)||"Unknown score error"))})})}static saveJob(e,i,t){return new Promise((s,a)=>{chrome.runtime.sendMessage({type:"SAVE_JOB",job:e,scored:i,notes:t},n=>{if(chrome.runtime.lastError)return a(new Error(chrome.runtime.lastError.message));n&&n.success?s(n.data):a(new Error((n==null?void 0:n.error)||"Unknown save error"))})})}static getSavedJobs(){return new Promise((e,i)=>{chrome.runtime.sendMessage({type:"GET_SAVED_JOBS"},t=>{if(chrome.runtime.lastError)return i(new Error(chrome.runtime.lastError.message));t&&t.success?e(t.data):i(new Error((t==null?void 0:t.error)||"Unknown fetch error"))})})}static deleteSavedJob(e){return new Promise((i,t)=>{chrome.runtime.sendMessage({type:"DELETE_SAVED_JOB",id:e},s=>{if(chrome.runtime.lastError)return t(new Error(chrome.runtime.lastError.message));s&&s.success?i():t(new Error((s==null?void 0:s.error)||"Unknown delete error"))})})}}const g=m;console.log("[Job Authenticity Agent] Injected content script active.");class w{constructor(){p(this,"container",null);p(this,"isOpen",!1);p(this,"isLoading",!1);p(this,"pageData",null);p(this,"savedJobs",[]);p(this,"isSaving",!1);p(this,"isSaved",!1);p(this,"activeTab","analysis");this.init()}async init(){try{chrome.storage.local.get(["sidebarOpen"],e=>{this.isOpen=!!e.sidebarOpen,this.inject(),this.isOpen&&this.triggerAnalysis()})}catch(e){console.warn("[Job Authenticity Agent] Chrome storage not available:",e),this.inject()}chrome.runtime.onMessage.addListener(e=>{e.type==="TOGGLE_SIDEBAR"&&this.toggle()})}inject(){const e=document.getElementById("job-authenticity-agent-sidebar");e&&e.remove(),this.container=document.createElement("div"),this.container.id="job-authenticity-agent-sidebar",this.applyStyles(),this.render(),document.body.appendChild(this.container),this.loadSavedListings()}async toggle(){this.isOpen=!this.isOpen;try{chrome.storage.local.set({sidebarOpen:this.isOpen})}catch(e){console.warn("[Job Authenticity Agent] Failed to persist sidebar state:",e)}if(this.container){this.container.style.transform=this.isOpen?"translateX(0)":"translateX(-100%)";const e=this.container.querySelector(".sidebar-handle-btn");e&&(e.innerHTML=this.isOpen?"◀":"🛡️",e.style.backgroundColor=this.isOpen?"rgba(20, 20, 20, 0.96)":"#2563eb",e.style.border=`1px solid rgba(255, 255, 255, ${this.isOpen?"0.08":"0.2"})`,e.style.borderLeft="none",e.style.boxShadow=this.isOpen?"none":"0 4px 20px rgba(37, 99, 235, 0.5)")}this.isOpen&&await this.triggerAnalysis()}applyStyles(){this.container&&Object.assign(this.container.style,{position:"fixed",left:"0",top:"0",width:"360px",height:"100vh",zIndex:"9999999",backgroundColor:"rgba(20, 20, 20, 0.96)",backdropFilter:"blur(16px) saturate(180%)",webkitBackdropFilter:"blur(16px) saturate(180%)",color:"#f5f5f4",fontFamily:"Inter, system-ui, -apple-system, sans-serif",boxShadow:this.isOpen?"0 0 40px rgba(0, 0, 0, 0.7), 1px 0 1px rgba(255, 255, 255, 0.1)":"none",borderRight:"1px solid rgba(255, 255, 255, 0.08)",display:"flex",flexDirection:"column",boxSizing:"border-box",transition:"transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",transform:this.isOpen?"translateX(0)":"translateX(-100%)"})}async triggerAnalysis(){if(this.isOpen){this.isLoading=!0,this.isSaved=!1,this.render();try{const e=document.body.innerText.substring(0,1e4),i=window.location.href,t=document.title;let s="";const a=o=>{var d;const r=document.querySelector(o);return r&&((d=r.textContent)==null?void 0:d.trim())||""};s=a(".job-details-jobs-unified-top-card__company-name")||a(".topcard__org-name-link")||a(".jobs-unified-top-card__company-name")||a(".jobs-details-top-card__company-url")||a('[data-company-name="true"]')||a(".jobsearch-CompanyInfoWithoutHeaderImageUsed")||a(".inlineHeader-companyName")||a(".jd-header-comp-name")||a(".pad-rt-8")||a('[data-test="employer-name"]')||a(".JobDetails_employerName__Omxw5")||a(".company_name")||"",console.log("[Job Authenticity Agent] Fetching page evaluation with hints...");const n=await g.scorePage(i,e,t,s);if(this.pageData=n,this.pageData.is_job&&this.pageData.score.tier==="verified")try{await g.saveJob(this.pageData.job,{trust_score:this.pageData.score.trust_score,tier:this.pageData.score.tier,flags:this.pageData.score.flags,reason:this.pageData.score.reason,cached:!1}),this.isSaved=!0,this.loadSavedListings()}catch(o){String(o).includes("already saved")&&(this.isSaved=!0)}}catch(e){console.error("[Job Authenticity Agent] Page analysis failed:",e),this.pageData={is_job:!1,reason:"Failed to connect to scoring server."}}finally{this.isLoading=!1,this.render()}}}async loadSavedListings(){try{this.savedJobs=await g.getSavedJobs(),this.container&&this.activeTab==="saved"&&this.render()}catch(e){console.warn("[Job Authenticity Agent] Failed to fetch saved jobs:",e)}}async handleSave(){if(!(!this.pageData||!this.pageData.is_job||this.isSaving||this.isSaved)){this.isSaving=!0,this.render();try{const e={trust_score:this.pageData.score.trust_score,tier:this.pageData.score.tier,flags:this.pageData.score.flags,reason:this.pageData.score.reason,cached:!1};await g.saveJob(this.pageData.job,e),this.isSaved=!0,await this.loadSavedListings()}catch(e){console.error("Manual save failed:",e),alert("Failed to save job post. Ensure scoring server is active.")}finally{this.isSaving=!1,this.render()}}}async handleDeleteJob(e){try{await g.deleteSavedJob(e),this.loadSavedListings()}catch(i){console.error("Delete job failed:",i)}}render(){if(!this.container)return;this.applyStyles(),this.container.innerHTML=`
      <!-- Drag/Toggle Handle on right edge -->
      <div class="sidebar-handle-btn" style="
        position: absolute;
        left: 100%;
        top: 50%;
        transform: translateY(-50%);
        width: 32px;
        height: 60px;
        background-color: ${this.isOpen?"rgba(20, 20, 20, 0.96)":"#2563eb"};
        color: #ffffff;
        border: 1px solid rgba(255, 255, 255, ${this.isOpen?"0.08":"0.2"});
        border-left: none;
        border-radius: 0 12px 12px 0;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: ${this.isOpen?"none":"0 4px 20px rgba(37, 99, 235, 0.5)"};
        font-size: 15px;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 999999999;
        text-shadow: ${this.isOpen?"none":"0 0 4px rgba(255,255,255,0.4)"};
      ">${this.isOpen?"◀":"🛡️"}</div>

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
            color: ${this.activeTab==="analysis"?"#3b82f6":"#737373"};
            border-bottom: 2px solid ${this.activeTab==="analysis"?"#3b82f6":"transparent"};
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
            color: ${this.activeTab==="saved"?"#3b82f6":"#737373"};
            border-bottom: 2px solid ${this.activeTab==="saved"?"#3b82f6":"transparent"};
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
    `;const e=this.container.querySelector(".sidebar-handle-btn");e==null||e.addEventListener("click",r=>{r.stopPropagation(),this.toggle()});const i=this.container.querySelector(".sidebar-close-btn");i==null||i.addEventListener("click",r=>{r.stopPropagation(),this.toggle()});const t=this.container.querySelector(".tab-btn-analysis");t==null||t.addEventListener("click",()=>{this.activeTab="analysis",this.render()});const s=this.container.querySelector(".tab-btn-saved");s==null||s.addEventListener("click",()=>{this.activeTab="saved",this.render()});const a=this.container.querySelector(".sidebar-save-btn");a==null||a.addEventListener("click",r=>{r.stopPropagation(),this.handleSave()}),this.container.querySelectorAll(".delete-saved-btn").forEach(r=>{r.addEventListener("click",d=>{d.stopPropagation();const c=r.dataset.id;c&&confirm("Remove this listing from your saved pipeline?")&&this.handleDeleteJob(c)})}),this.container.querySelectorAll(".check-accordion-header").forEach(r=>{r.addEventListener("click",()=>{var x;const d=r.dataset.check,c=(x=this.container)==null?void 0:x.querySelector(`.check-details-${d}`),b=r.querySelector(".accordion-arrow");if(c&&b){const y=c.style.display==="none"||!c.style.display;c.style.display=y?"block":"none",b.style.transform=y?"rotate(90deg)":"rotate(0deg)"}})})}renderActiveTab(){return this.activeTab==="saved"?this.renderSavedList():this.isLoading?this.renderLoading():this.pageData?this.pageData.is_job?this.renderAnalysisResults():`
        <div style="text-align: center; color: #e5e5e5; padding: 30px 10px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.1); border-radius: 12px;">
          <div style="font-size: 28px; margin-bottom: 10px;">ℹ️</div>
          <h4 style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700;">No Job Post Identified</h4>
          <p style="margin: 0; font-size: 11px; line-height: 1.5; color: #a3a3a3;">
            Our AI did not detect a job listing context on this page.<br><br>
            Please navigate to a job post on <strong>LinkedIn, Indeed, Naukri, Glassdoor, or Internshala</strong>.
          </p>
        </div>
      `:`
        <div style="text-align: center; color: #a3a3a3; padding: 40px 10px;">
          <div style="font-size: 32px; margin-bottom: 12px;">🔍</div>
          <p style="margin: 0; font-size: 12px; line-height: 1.5;">Click the extension icon or toggle handle to analyze this webpage context.</p>
        </div>
      `}renderLoading(){return`
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
    `}renderAnalysisResults(){const{job:e,score:i}=this.pageData,{trust_score:t,tier:s,reason:a,checks:n}=i;let o="#10b981",r="Verified";s==="suspicious"?(o="#f59e0b",r="Suspicious"):s==="fake"&&(o="#ef4444",r="High Risk");const d=2*Math.PI*18,c=d-t/100*d;return`
      <!-- Score Circle Header Card -->
      <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 16px; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <span style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #737373; tracking-wider; display: block;">Authenticity Rating</span>
          <h3 style="margin: 4px 0 2px 0; font-size: 18px; font-weight: 900; color: ${o};">${r}</h3>
          <span style="font-size: 9px; font-weight: 600; color: #a3a3a3;">Confidence Match</span>
        </div>

        <!-- SVG Circular Progress -->
        <div style="position: relative; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center;">
          <svg style="width: 50px; height: 50px; transform: rotate(-90deg);">
            <circle cx="25" cy="25" r="18" stroke="rgba(255,255,255,0.05)" stroke-width="3" fill="transparent"/>
            <circle cx="25" cy="25" r="18" stroke="${o}" stroke-width="3" fill="transparent"
              stroke-dasharray="${d}"
              stroke-dashoffset="${c}"
              style="transition: stroke-dashoffset 0.5s ease-in-out;"
            />
          </svg>
          <span style="position: absolute; font-size: 11.5px; font-weight: 900; color: #ffffff;">${t}%</span>
        </div>
      </div>

      <!-- Quick Extracted Info -->
      <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 12px; padding: 12px;">
        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #525252; letter-spacing: 0.5px; display: block; margin-bottom: 6px;">Extracted Metadata</span>
        <h4 style="margin: 0; font-size: 13px; font-weight: 800; color: #ffffff; line-height: 1.3;" title="${e.title}">${e.title}</h4>
        <p style="margin: 4px 0 0 0; font-size: 11px; font-weight: 500; color: #a3a3a3;">${e.company} • ${e.location}</p>
        ${e.salary?`<div style="margin-top: 6px; font-size: 10.5px; font-weight: 700; color: #3b82f6;">💵 ${e.salary}</div>`:""}
      </div>

      <!-- Verdict Paragraph -->
      <div style="font-size: 11.5px; line-height: 1.45; color: #d4d4d4;">
        <strong>Audit Summary:</strong> ${a}
      </div>

      <!-- Detailed Score Audits Accordion -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #525252; letter-spacing: 0.5px; margin-bottom: 2px;">Evaluation Checks</span>
        
        ${this.renderCheckRow("language","Language Audit",n.language)}
        ${this.renderCheckRow("reality","Reality Match",n.reality)}
        ${this.renderCheckRow("consistency","Consistency Check",n.consistency)}
        ${this.renderCheckRow("contact","Contact Cyber Audit",n.contact)}
        ${this.renderCheckRow("pattern","Spam Pattern Scan",n.pattern)}
      </div>

      <!-- Save Actions -->
      <button class="sidebar-save-btn" style="
        width: 100%;
        background-color: ${this.isSaved?"#10b981":"#2563eb"};
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
      " ${this.isSaving||this.isSaved?"disabled":""}>
        ${this.isSaving?"Saving...":this.isSaved?"✓ Saved to Dashboard":"Save Job Posting"}
      </button>
    `}renderCheckRow(e,i,t){const s=t.score>=7,a=t.score>=7?"#10b981":t.score>=4?"#f59e0b":"#ef4444",n=s?"✓":"⚠️",o=t.flags&&t.flags.length>0?t.flags.map(r=>`
          <li style="margin-bottom: 4px; font-size: 9.5px; color: #fca5a5; display: flex; align-items: flex-start; gap: 5px;">
            <span style="color: #ef4444; font-size: 11px; line-height: 1;">•</span>
            <span>${r}</span>
          </li>
        `).join(""):'<li style="font-size: 9.5px; color: #a7f3d0; list-style: none;">✓ No red flags identified.</li>';return`
      <div style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); border-radius: 8px; overflow: hidden;">
        <div class="check-accordion-header" data-check="${e}" style="padding: 10px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="color: ${a}; font-size: 12px; font-weight: 900;">${n}</span>
            <span style="font-size: 11px; font-weight: 700; color: #e5e5e5;">${i}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 10px; font-weight: 800; color: ${a};">${t.score}/10</span>
            <span class="accordion-arrow" style="font-size: 8px; color: #737373; transition: transform 0.2s;">▶</span>
          </div>
        </div>
        
        <!-- Accordion Details (Hidden initially) -->
        <div class="check-details-${e}" style="display: none; padding: 0px 10px 10px 10px; border-top: 1px solid rgba(255,255,255,0.02); background: rgba(0,0,0,0.15);">
          <p style="margin: 8px 0; font-size: 10px; color: #a3a3a3; line-height: 1.35;">${t.reason}</p>
          <div style="border-t: 1px solid rgba(255,255,255,0.02); padding-top: 6px;">
            <ul style="margin: 0; padding: 0; list-style: none;">
              ${o}
            </ul>
          </div>
        </div>
      </div>
    `}renderSavedList(){if(this.savedJobs.length===0)return`
        <div style="text-align: center; color: #525252; padding: 60px 10px;">
          <div style="font-size: 32px; margin-bottom: 12px;">📁</div>
          <p style="margin: 0; font-size: 11px; line-height: 1.4;">Your saved listings pipeline is currently empty. Bookmark verified listings to view them here.</p>
        </div>
      `;const e={verified:"#10b981",suspicious:"#f59e0b",fake:"#ef4444"};return`
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <span style="font-size: 8.5px; font-weight: 700; text-transform: uppercase; color: #525252; letter-spacing: 0.5px; margin-bottom: 2px;">Saved Pipeline Listings</span>
        ${this.savedJobs.map(t=>{const s=e[t.tier]||"#a3a3a3";return`
        <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); hover:border-white; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 6px; position: relative;">
          <!-- Top indicators -->
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 8px; font-weight: 700; text-transform: uppercase; background: rgba(255,255,255,0.06); padding: 1.5px 5px; border-radius: 4px; color: #a3a3a3;">${t.source_platform}</span>
            <span style="font-size: 9px; font-weight: 800; color: ${s};">${t.trust_score}% Trust</span>
          </div>

          <!-- Job Details -->
          <div>
            <h4 style="margin: 0; font-size: 11.5px; font-weight: 700; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 20px;">${t.title}</h4>
            <p style="margin: 2px 0 0 0; font-size: 9.5px; color: #a3a3a3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${t.company} • ${t.location}</p>
          </div>

          <!-- Actions -->
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.02); padding-top: 6px;">
            <a href="${t.apply_url}" target="_blank" style="font-size: 9.5px; font-weight: 700; color: #3b82f6; text-decoration: none; display: flex; align-items: center; gap: 3px;">
              Apply Link ↗
            </a>
            <button class="delete-saved-btn" data-id="${t.id}" style="background: none; border: none; color: #ef4444; font-size: 9px; cursor: pointer; padding: 2px; font-weight: 700;">
              Remove
            </button>
          </div>
        </div>
      `}).join("")}
      </div>
    `}}let h="",f=null;async function k(){const l=window.location.href;l!==h&&(h=l,console.log(`[Job Authenticity Agent] Navigated to new page: ${l}`),f&&await f.triggerAnalysis())}f=new w;const S=new MutationObserver(()=>{window.location.href!==h&&k()});S.observe(document.body,{childList:!0,subtree:!0});
