import React, { useEffect, useState } from 'react';
import { ApiClient } from '../shared/api';
import { JobPost, ScoredJob, SavedJob } from '../shared/types';

export default function Popup() {
  const [activeTabUrl, setActiveTabUrl] = useState<string>('');
  const [isJobPostPage, setIsJobPostPage] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [scoredData, setScoredData] = useState<ScoredJob | null>(null);
  const [jobDetails, setJobDetails] = useState<JobPost | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [activeTab, setActiveTab] = useState<'analyze' | 'pipeline'>('analyze');

  useEffect(() => {
    detectActiveTab();
    loadSavedJobs();
  }, []);

  const detectActiveTab = () => {
    if (typeof chrome === 'undefined' || !chrome.tabs) {
      setActiveTabUrl('https://www.linkedin.com/jobs/view/123456');
      setIsJobPostPage(true);
      setJobDetails({
        title: 'Lead Software Engineer',
        company: 'Apex Solutions Inc',
        description: 'Vague description with urgent exclamation marks!!! Earn up to 2 lakhs per week from home. Contact recruiters at recruitment@gmail.com or WhatsApp us immediately!',
        salary: '₹12L - ₹18L',
        location: 'Mumbai, India',
        apply_url: 'https://www.linkedin.com/jobs/view/123456',
        source_platform: 'linkedin'
      });
      return;
    }

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab || !tab.url) return;
      setActiveTabUrl(tab.url);

      const urlLower = tab.url.toLowerCase();
      const isMatch = urlLower.includes('linkedin.com/jobs') || 
                      urlLower.includes('linkedin.com/view') ||
                      urlLower.includes('indeed.com/viewjob') ||
                      urlLower.includes('indeed.com/rc/clk') ||
                      urlLower.includes('naukri.com/job-listings') ||
                      urlLower.includes('glassdoor.com/job-listing') ||
                      urlLower.includes('internshala.com/internship');

      setIsJobPostPage(isMatch);
      if (isMatch) {
        scrapeAndScoreTab(tab.id!);
      }
    });
  };

  const scrapeAndScoreTab = (tabId: number) => {
    setLoading(true);
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const getCleanText = (sel: string) => document.querySelector(sel)?.textContent?.trim() || '';
        const url = window.location.href.toLowerCase();
        let title = '';
        let company = '';
        let description = '';
        let location = '';
        let salary = '';

        if (url.includes('linkedin.com')) {
          title = getCleanText('.job-details-jobs-unified-top-card__job-title') || getCleanText('h1');
          company = getCleanText('.job-details-jobs-unified-top-card__company-name') || getCleanText('.topcard__org-name-link');
          description = getCleanText('#job-details') || getCleanText('.jobs-description-content');
          location = getCleanText('.job-details-jobs-unified-top-card__primary-description-container') || getCleanText('.topcard__flavor--bullet');
        } else if (url.includes('indeed.com')) {
          title = getCleanText('.jobsearch-JobInfoHeader-title') || getCleanText('h1');
          company = getCleanText('[data-company-name="true"]') || getCleanText('.inlineHeader-companyName');
          description = getCleanText('#jobDescriptionText');
          location = getCleanText('.jobsearch-JobInfoHeader-subtitle');
        } else {
          title = document.title.split(' - ')[0];
          company = 'Hiring Company';
          description = getCleanText('body');
        }

        return {
          title: title || document.title,
          company: company || 'Unknown',
          description: description || 'No Description Found',
          location: location || 'Not Specified',
          salary: salary || undefined,
          apply_url: window.location.href,
          source_platform: url.includes('linkedin') ? 'linkedin' : url.includes('indeed') ? 'indeed' : 'other'
        };
      }
    }, async (results) => {
      if (results && results[0] && results[0].result) {
        const payload = results[0].result as JobPost;
        setJobDetails(payload);

        try {
          const scored = await ApiClient.scoreJob(payload);
          setScoredData(scored);
        } catch (e) {
          console.error(e);
        }
      }
      setLoading(false);
    });
  };

  const loadSavedJobs = async () => {
    try {
      const data = await ApiClient.getSavedJobs();
      setSavedJobs(data);
    } catch (e) {
      console.error('Failed to load saved pipeline:', e);
    }
  };

  const handleSave = async () => {
    if (!jobDetails || !scoredData || isSaved) return;
    try {
      await ApiClient.saveJob(jobDetails, scoredData);
      setIsSaved(true);
      loadSavedJobs();
    } catch (e) {
      alert('Failed to save listing. Ensure backend service is running.');
    }
  };

  const handleDeleteSaved = async (id: string) => {
    try {
      await ApiClient.deleteSavedJob(id);
      loadSavedJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const openDashboard = () => {
    window.open('http://localhost:8000/dashboard', '_blank');
  };

  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const scorePercent = scoredData ? Math.min(100, Math.max(0, scoredData.trust_score)) : 0;
  const strokeOffset = circumference - (scorePercent / 100) * circumference;

  let tierColor = '#10b981';
  let tierBg = 'rgba(16, 185, 129, 0.1)';
  if (scoredData?.tier === 'suspicious') {
    tierColor = '#f59e0b';
    tierBg = 'rgba(245, 158, 11, 0.1)';
  } else if (scoredData?.tier === 'fake') {
    tierColor = '#ef4444';
    tierBg = 'rgba(239, 68, 68, 0.1)';
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '400px',
      backgroundColor: '#0c0a09',
      color: '#f5f5f4',
      padding: '16px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #292524',
        paddingBottom: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            backgroundColor: '#3b82f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '15px',
            boxShadow: '0 0 12px rgba(59, 130, 246, 0.4)'
          }}>A</div>
          <span style={{ fontWeight: '800', fontSize: '14px', letterSpacing: '0.2px' }}>AUTHENTICITY AGENT</span>
        </div>
        <button 
          onClick={openDashboard}
          style={{
            backgroundColor: 'rgba(255,255,255,0.06)',
            border: '1px solid #44403c',
            color: '#d6d3d1',
            padding: '4px 8px',
            borderRadius: '6px',
            fontSize: '10px',
            fontWeight: '600',
            cursor: 'pointer'
          }}
        >
          Dashboard ↗
        </button>
      </div>

      <div style={{
        display: 'flex',
        backgroundColor: '#1c1917',
        borderRadius: '8px',
        padding: '2px',
        marginBottom: '14px'
      }}>
        <button
          onClick={() => setActiveTab('analyze')}
          style={{
            flex: 1,
            backgroundColor: activeTab === 'analyze' ? '#292524' : 'transparent',
            border: 'none',
            color: activeTab === 'analyze' ? '#ffffff' : '#a8a29e',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Analyze Active
        </button>
        <button
          onClick={() => setActiveTab('pipeline')}
          style={{
            flex: 1,
            backgroundColor: activeTab === 'pipeline' ? '#292524' : 'transparent',
            border: 'none',
            color: activeTab === 'pipeline' ? '#ffffff' : '#a8a29e',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
        >
          Saved ({savedJobs.length})
        </button>
      </div>

      {activeTab === 'analyze' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {!isJobPostPage ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              textAlign: 'center',
              padding: '24px 16px',
              backgroundColor: '#171412',
              borderRadius: '12px',
              border: '1px dashed #44403c',
              minHeight: '220px'
            }}>
              <span style={{ fontSize: '28px', marginBottom: '12px' }}>🔍</span>
              <h3 style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 6px 0', color: '#f5f5f4' }}>No Job Listing Detected</h3>
              <p style={{ fontSize: '11px', color: '#a8a29e', margin: 0, lineHeight: '1.4' }}>
                Open a listing on LinkedIn, Indeed, Naukri, or Glassdoor to run the authenticity engine.
              </p>
            </div>
          ) : loading ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              backgroundColor: '#171412',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '220px'
            }}>
              <div style={{
                width: '28px',
                height: '28px',
                border: '3px solid rgba(255,255,255,0.06)',
                borderTop: '3px solid #3b82f6',
                borderRadius: '50%',
                animation: 'agent-spin-popup 1s linear infinite',
                marginBottom: '14px'
              }}></div>
              <span style={{ fontSize: '12px', color: '#d6d3d1', fontWeight: '500' }}>Evaluating listing flags...</span>
              <style>{`
                @keyframes agent-spin-popup {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : scoredData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                backgroundColor: '#171412',
                padding: '12px 16px',
                borderRadius: '12px',
                border: '1px solid #292524'
              }}>
                <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                  <svg style={{ transform: 'rotate(-90deg)', width: '64px', height: '64px' }}>
                    <circle
                      cx="32"
                      cy="32"
                      r={radius}
                      stroke="rgba(255,255,255,0.04)"
                      strokeWidth="5"
                      fill="transparent"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r={radius}
                      stroke={tierColor}
                      strokeWidth="5"
                      fill="transparent"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeOffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -55%)',
                    fontWeight: '800',
                    fontSize: '16px'
                  }}>
                    {scoredData.trust_score}
                  </div>
                </div>

                <div style={{ flex: 1 }}>
                  <span style={{
                    fontSize: '9px',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    backgroundColor: tierBg,
                    color: tierColor,
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px'
                  }}>
                    {scoredData.tier}
                  </span>
                  <h4 style={{ fontSize: '13px', fontWeight: '600', margin: '4px 0 2px 0', color: '#f5f5f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '170px' }}>
                    {jobDetails?.title}
                  </h4>
                  <p style={{ fontSize: '10.5px', color: '#a8a29e', margin: 0 }}>
                    {jobDetails?.company}
                  </p>
                </div>
              </div>

              <div style={{
                backgroundColor: '#171412',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #292524',
                fontSize: '11px',
                lineHeight: '1.4',
                color: '#d6d3d1'
              }}>
                {scoredData.reason}
              </div>

              <div style={{
                backgroundColor: 'rgba(0,0,0,0.2)',
                border: '1px solid #292524',
                borderRadius: '8px',
                padding: '8px 10px',
                flex: 1,
                maxHeight: '110px',
                overflowY: 'auto'
              }}>
                <div style={{ fontSize: '9px', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.5px' }}>Red Flags Scanned</div>
                {scoredData.flags.length > 0 ? (
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {scoredData.flags.map((f, i) => (
                      <li key={i} style={{ display: 'flex', gap: '6px', fontSize: '10.5px', color: '#fca5a5', marginBottom: '4px', alignItems: 'flex-start' }}>
                        <span style={{ color: '#ef4444' }}>•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ fontSize: '10.5px', color: '#86efac' }}>✓ No critical red flags detected.</div>
                )}
              </div>

              <button
                onClick={handleSave}
                style={{
                  width: '100%',
                  backgroundColor: isSaved ? '#10b981' : '#3b82f6',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  fontSize: '12px',
                  fontWeight: '600',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s',
                  marginTop: '4px'
                }}
                disabled={isSaved}
              >
                {isSaved ? '✓ Saved to Dashboard' : 'Save Job Posting'}
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              backgroundColor: '#171412',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '220px',
              textAlign: 'center'
            }}>
              <span style={{ fontSize: '20px', marginBottom: '10px' }}>⚡</span>
              <p style={{ fontSize: '11px', color: '#a8a29e', margin: 0 }}>
                Scraping page elements... Click 'Analyze Active' again if loading fails.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, maxHeight: '280px', overflowY: 'auto' }}>
          {savedJobs.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              textAlign: 'center',
              padding: '24px 16px',
              backgroundColor: '#171412',
              borderRadius: '12px',
              border: '1px dashed #44403c',
              minHeight: '200px'
            }}>
              <span style={{ fontSize: '20px', marginBottom: '8px' }}>📂</span>
              <h4 style={{ fontSize: '12px', margin: '0 0 4px 0', color: '#e7e5e4' }}>Pipeline is Empty</h4>
              <p style={{ fontSize: '10.5px', color: '#78716c', margin: 0 }}>
                Save job listings to see them tracked here in real time.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {savedJobs.map((job) => {
                let badgeClr = '#10b981';
                if (job.tier === 'suspicious') badgeClr = '#f59e0b';
                else if (job.tier === 'fake') badgeClr = '#ef4444';

                return (
                  <div 
                    key={job.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: '#171412',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #292524'
                    }}
                  >
                    <div style={{ flex: 1, overflow: 'hidden', marginRight: '12px' }}>
                      <h4 style={{ fontSize: '11.5px', fontWeight: '600', margin: 0, color: '#f5f5f4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.title}
                      </h4>
                      <p style={{ fontSize: '10px', color: '#78716c', margin: '2px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.company} • {job.location}
                      </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '700',
                        backgroundColor: 'rgba(255,255,255,0.06)',
                        color: badgeClr,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        border: '1px solid #292524'
                      }}>
                        {job.trust_score}
                      </span>
                      <button
                        onClick={() => handleDeleteSaved(job.id)}
                        style={{
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#e7e5e4',
                          cursor: 'pointer',
                          fontSize: '11px',
                          padding: '2px 4px'
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
