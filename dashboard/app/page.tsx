'use client';

import React, { useEffect, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, AreaChart, Area, Legend
} from 'recharts';
import { 
  Layers, ShieldCheck, AlertTriangle, XCircle, Search, 
  Trash2, ExternalLink, Calendar, MapPin, RefreshCw, BarChart2, PlusCircle
} from 'lucide-react';

// --- Shared TypeScript Interfaces ---
interface SavedJob {
  id: string;
  title: string;
  company: string;
  description: string;
  salary?: string;
  location: string;
  apply_url: string;
  source: string;
  posted_date: string;
  expires_at: string;
  trust_score: number;
  tier: 'verified' | 'suspicious' | 'fake';
  flags: string[];
  reason: string;
  status: 'saved' | 'applied' | 'rejected' | 'offer';
  notes?: string;
  saved_at: string;
}

interface AnalyticsSummary {
  total_saved: number;
  tier_counts: { verified: number; suspicious: number; fake: number };
  skills_heatmap: { name: string; value: number }[];
  category_distribution: { name: string; value: number }[];
  experience_levels: { entry: number; mid: number; senior: number };
  score_distribution: { bucket: string; count: number }[];
}

// --- High-Quality Local Mock Data fallback ---
const MOCK_SAVED_JOBS: SavedJob[] = [
  {
    id: 'job-1',
    title: 'Lead Software Engineer',
    company: 'Apex Solutions Inc',
    description: 'Vague description with urgent exclamation marks!!! Earn up to 2 lakhs per week from home. Contact recruiters at recruitment@gmail.com or WhatsApp us immediately!',
    salary: '₹12L - ₹18L',
    location: 'Mumbai, India',
    apply_url: 'https://www.linkedin.com/jobs/view/123456',
    source: 'linkedin',
    posted_date: '2026-05-30',
    expires_at: '2026-06-03', // Expiring soon (<3 days - Red)
    trust_score: 32,
    tier: 'fake',
    flags: ['Gmail address in contact info', 'WhatsApp application path', 'Urgency exclamation marks', 'Work from home earn big promises'],
    reason: 'Contact details utilize personal Gmail domains and WhatsApp links rather than standard enterprise portals.',
    status: 'saved',
    saved_at: new Date().toISOString()
  },
  {
    id: 'job-2',
    title: 'Machine Learning Research Engineer',
    company: 'Neural Labs',
    description: 'We are seeking a Machine Learning Engineer to join our core AI systems team. Candidates must have solid experience in Python, PyTorch, and NLP architectures. Experience with Docker and AWS is preferred. Required: 3-5 Years experience.',
    salary: '₹18L - ₹24L',
    location: 'Bengaluru, India (Hybrid)',
    apply_url: 'https://indeed.com/viewjob?id=98765',
    source: 'indeed',
    posted_date: '2026-05-28',
    expires_at: '2026-06-25', // Expiring far (>7 days - Green)
    trust_score: 95,
    tier: 'verified',
    flags: [],
    reason: 'Professional criteria matches company standard expectations with detailed, role-specific guidelines.',
    status: 'applied',
    saved_at: new Date().toISOString()
  },
  {
    id: 'job-3',
    title: 'Junior Data Analyst',
    company: 'Synergy Holdings Ltd',
    description: 'Looking for freshers with 0 experience to handle senior BI reporting structures. Must know SQL, Python, Tableau, Docker, AWS, Kubernetes, Spark, Hadoop, Rust, and C++.',
    salary: '₹3L - ₹5L',
    location: 'New Delhi, India',
    apply_url: 'https://naukri.com/job-listings/data-analyst',
    source: 'naukri',
    posted_date: '2026-05-29',
    expires_at: '2026-06-06', // Expiring in 6 days (Orange)
    trust_score: 55,
    tier: 'suspicious',
    flags: ['Junior title requiring 10+ advanced tools', 'Unrealistic salary for skills required'],
    reason: 'Demands an excessive amount of technical capabilities mismatching junior seniority rates and base salaries.',
    status: 'saved',
    saved_at: new Date().toISOString()
  }
];

const MOCK_ANALYTICS: AnalyticsSummary = {
  total_saved: 3,
  tier_counts: { verified: 1, suspicious: 1, fake: 1 },
  skills_heatmap: [
    { name: 'Python', value: 2 },
    { name: 'SQL', value: 2 },
    { name: 'PyTorch', value: 1 },
    { name: 'Tableau', value: 1 },
    { name: 'Docker', value: 1 },
    { name: 'AWS', value: 1 }
  ],
  category_distribution: [
    { name: 'Software Engineer', value: 1 },
    { name: 'ML/AI Engineer', value: 1 },
    { name: 'Data Analyst', value: 1 }
  ],
  experience_levels: { entry: 1, mid: 1, senior: 1 },
  score_distribution: [
    { bucket: '0-10', count: 0 },
    { bucket: '10-20', count: 0 },
    { bucket: '20-30', count: 0 },
    { bucket: '30-40', count: 1 },
    { bucket: '40-50', count: 0 },
    { bucket: '50-60', count: 1 },
    { bucket: '60-70', count: 0 },
    { bucket: '70-80', count: 0 },
    { bucket: '80-90', count: 0 },
    { bucket: '90-100', count: 1 }
  ]
};

const TIER_COLORS = {
  verified: '#10b981', // Emerald
  suspicious: '#f59e0b', // Amber
  fake: '#ef4444' // Rose
};

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#f43f5e'];

export default function Dashboard() {
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>(MOCK_SAVED_JOBS);
  const [analytics, setAnalytics] = useState<AnalyticsSummary>(MOCK_ANALYTICS);
  const [loading, setLoading] = useState<boolean>(false);
  const [isLive, setIsLive] = useState<boolean>(false);

  const [search, setSearch] = useState<string>('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  
  const [activeJob, setActiveJob] = useState<SavedJob | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const resJobs = await fetch('http://127.0.0.1:8000/jobs/saved');
      if (resJobs.ok) {
        const jobsData = await resJobs.json();
        setSavedJobs(jobsData.length > 0 ? jobsData : MOCK_SAVED_JOBS);
        setIsLive(true);
      } else {
        setIsLive(false);
      }

      const resAnalytics = await fetch('http://127.0.0.1:8000/analytics/summary');
      if (resAnalytics.ok) {
        const analyticsData = await resAnalytics.json();
        setAnalytics(analyticsData.total_saved > 0 ? analyticsData : MOCK_ANALYTICS);
      }
    } catch (e) {
      console.warn('FastAPI server unreachable. Operating in Offline Mode.');
      setIsLive(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteJob = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to remove this saved job application?')) return;

    if (isLive) {
      try {
        const res = await fetch(`http://127.0.0.1:8000/jobs/${id}`, { method: 'DELETE' });
        if (res.ok) {
          fetchData();
          if (activeJob?.id === id) setActiveJob(null);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      const updated = savedJobs.filter(j => j.id !== id);
      setSavedJobs(updated);
      
      const updatedAnalytics = { ...analytics };
      updatedAnalytics.total_saved = updated.length;
      setAnalytics(updatedAnalytics);
      if (activeJob?.id === id) setActiveJob(null);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: any) => {
    const updated = savedJobs.map(j => {
      if (j.id === id) {
        return { ...j, status: newStatus };
      }
      return j;
    });
    setSavedJobs(updated);
    if (activeJob && activeJob.id === id) {
      setActiveJob({ ...activeJob, status: newStatus });
    }
  };

  const getExpiryLabel = (expiresStr: string) => {
    const expires = new Date(expiresStr);
    const today = new Date();
    const diffTime = expires.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
      return { text: 'Expired', color: 'text-red-500 bg-red-950/40 border-red-900/60' };
    } else if (diffDays <= 3) {
      return { text: `Expiring in ${diffDays}d`, color: 'text-rose-400 bg-rose-950/40 border-rose-900/60' };
    } else if (diffDays <= 7) {
      return { text: `Expires in ${diffDays}d`, color: 'text-amber-400 bg-amber-950/40 border-amber-900/60' };
    } else {
      return { text: `${diffDays} days left`, color: 'text-emerald-400 bg-emerald-950/40 border-emerald-900/60' };
    }
  };

  const filteredJobs = savedJobs.filter(job => {
    const matchesSearch = job.title.toLowerCase().includes(search.toLowerCase()) || 
                          job.company.toLowerCase().includes(search.toLowerCase()) ||
                          job.location.toLowerCase().includes(search.toLowerCase());
    const matchesPlatform = selectedPlatform === 'all' || job.source === selectedPlatform;
    const matchesTier = selectedTier === 'all' || job.tier === selectedTier;
    const matchesStatus = selectedStatus === 'all' || job.status === selectedStatus;

    return matchesSearch && matchesPlatform && matchesTier && matchesStatus;
  });

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-40 bg-[#0c0a09]/90 backdrop-blur-md border-b border-[#292524] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-lg text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            A
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-wide text-white">JOB AUTHENTICITY AGENT</h1>
            <p className="text-[10px] text-stone-500 uppercase tracking-wider">Analytics & Pipeline Dashboard</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-stone-800 bg-stone-900/60">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-amber-500 shadow-[0_0_8px_#f59e0b]'}`}></span>
            <span className="text-[11px] font-semibold text-stone-300">
              {isLive ? 'Backend Live' : 'Demo Mode'}
            </span>
          </div>

          <button 
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-stone-300 bg-stone-800 hover:bg-stone-700 active:bg-stone-800 border border-stone-700 hover:border-stone-600 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        <div className="xl:col-span-1 flex flex-col gap-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wide">Scored Pipeline</span>
              <h3 className="text-2xl font-black mt-2 text-white">{analytics.total_saved}</h3>
            </div>
            
            <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide">Verified</span>
              <h3 className="text-2xl font-black mt-2 text-emerald-400">{analytics.tier_counts.verified}</h3>
            </div>

            <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-4 flex flex-col justify-between">
              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wide">Fake Posts</span>
              <h3 className="text-2xl font-black mt-2 text-rose-400">{analytics.tier_counts.fake + analytics.tier_counts.suspicious}</h3>
            </div>
          </div>

          <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-stone-800/80 pb-3">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300">Skills Demand Analyzer</h3>
              </div>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-md bg-blue-950/40 text-blue-400 border border-blue-900/60">Top In-Demand</span>
            </div>

            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.skills_heatmap} layout="vertical" margin={{ left: -10, right: 10, top: 0, bottom: 0 }}>
                  <XAxis type="number" stroke="#57534e" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#a8a29e" fontSize={10} axisLine={false} tickLine={false} width={80} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #292524', borderRadius: '8px' }}
                    labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
                    itemStyle={{ color: '#3b82f6' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={12}>
                    {analytics.skills_heatmap.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-5 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-stone-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300">Role Category Breakdown</h3>
              </div>
            </div>

            <div className="h-[200px] w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.category_distribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {analytics.category_distribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #292524', borderRadius: '8px' }}
                    itemStyle={{ color: '#ffffff' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle" 
                    iconSize={8}
                    formatter={(value) => <span className="text-[10px] text-stone-400">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="xl:col-span-2 flex flex-col gap-6">
          <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-5 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4.5 h-4.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text"
                  placeholder="Search listings by title, company, location..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-sm bg-[#0c0a09] border border-[#292524] focus:border-stone-600 rounded-lg text-stone-100 placeholder-stone-500 outline-none transition-colors"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                  className="bg-[#0c0a09] border border-[#292524] text-xs font-semibold px-3 py-2 rounded-lg outline-none text-stone-300 focus:border-stone-600 cursor-pointer"
                >
                  <option value="all">All Boards</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                  <option value="naukri">Naukri</option>
                  <option value="glassdoor">Glassdoor</option>
                </select>

                <select
                  value={selectedTier}
                  onChange={(e) => setSelectedTier(e.target.value)}
                  className="bg-[#0c0a09] border border-[#292524] text-xs font-semibold px-3 py-2 rounded-lg outline-none text-stone-300 focus:border-stone-600 cursor-pointer"
                >
                  <option value="all">All Ratings</option>
                  <option value="verified">Verified</option>
                  <option value="suspicious">Suspicious</option>
                  <option value="fake">Fake / Scam</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="bg-[#0c0a09] border border-[#292524] text-xs font-semibold px-3 py-2 rounded-lg outline-none text-stone-300 focus:border-stone-600 cursor-pointer"
                >
                  <option value="all">All Statuses</option>
                  <option value="saved">Saved</option>
                  <option value="applied">Applied</option>
                  <option value="rejected">Rejected</option>
                  <option value="offer">Offer Received</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-start">
            <div className={`flex flex-col gap-4 ${activeJob ? 'md:col-span-3' : 'md:col-span-5'}`}>
              {filteredJobs.length === 0 ? (
                <div className="bg-[#1c1917] border border-[#292524] rounded-xl p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
                  <span className="text-4xl mb-4">📂</span>
                  <h3 className="text-sm font-bold text-stone-200">No Job Postings Found</h3>
                  <p className="text-xs text-stone-500 mt-1 max-w-sm leading-relaxed">
                    Ensure the pipeline filters match your criteria or save mock jobs using the extension popup.
                  </p>
                </div>
              ) : (
                filteredJobs.map((job) => {
                  const expiry = getExpiryLabel(job.expires_at);
                  const isJobActive = activeJob?.id === job.id;

                  return (
                    <div
                      key={job.id}
                      onClick={() => setActiveJob(job)}
                      className={`group p-4 bg-[#1c1917] border ${isJobActive ? 'border-blue-500/80 bg-[#241e1b]' : 'border-[#292524] hover:border-stone-700'} rounded-xl cursor-pointer flex items-center justify-between transition-all`}
                    >
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${expiry.color}`}>
                            {expiry.text}
                          </span>
                          <span className="text-[10px] font-bold text-stone-400 capitalize px-2 py-0.5 rounded bg-[#0c0a09] border border-stone-800">
                            {job.source}
                          </span>
                        </div>

                        <h4 className="text-sm font-bold text-white mt-2 group-hover:text-blue-400 transition-colors truncate">
                          {job.title}
                        </h4>
                        
                        <div className="flex items-center gap-4 text-xs text-stone-400 mt-1">
                          <span className="font-medium text-stone-300">{job.company}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-stone-500" /> {job.location}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex flex-col items-end">
                          <span 
                            className="text-xs font-black px-2.5 py-1 rounded-lg border"
                            style={{
                              borderColor: `${TIER_COLORS[job.tier]}60`,
                              backgroundColor: `${TIER_COLORS[job.tier]}15`,
                              color: TIER_COLORS[job.tier]
                            }}
                          >
                            {job.trust_score}%
                          </span>
                          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 mt-1 capitalize">
                            {job.tier}
                          </span>
                        </div>

                        <button 
                          onClick={(e) => handleDeleteJob(job.id, e)}
                          className="p-2 text-stone-500 hover:text-rose-400 hover:bg-stone-800 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {activeJob && (
              <div className="md:col-span-2 bg-[#1c1917] border border-[#292524] rounded-xl p-5 flex flex-col gap-4 sticky top-24 max-h-[calc(100vh-120px)] overflow-y-auto animate-in slide-in-from-right duration-300">
                <div className="flex justify-between items-start border-b border-stone-800 pb-3">
                  <div>
                    <h3 className="font-bold text-white text-sm leading-tight">{activeJob.title}</h3>
                    <p className="text-xs text-stone-400 mt-1">{activeJob.company}</p>
                  </div>
                  <button 
                    onClick={() => setActiveJob(null)}
                    className="text-stone-400 hover:text-white bg-stone-800/80 px-2 py-1 rounded-md text-xs font-semibold"
                  >
                    Hide
                  </button>
                </div>

                <div 
                  className="rounded-lg p-4 border"
                  style={{
                    borderColor: `${TIER_COLORS[activeJob.tier]}40`,
                    backgroundColor: `${TIER_COLORS[activeJob.tier]}08`
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-stone-400">Agent Assessment:</span>
                    <span 
                      className="text-sm font-black px-2 py-0.5 rounded border"
                      style={{
                        borderColor: `${TIER_COLORS[activeJob.tier]}60`,
                        backgroundColor: `${TIER_COLORS[activeJob.tier]}15`,
                        color: TIER_COLORS[activeJob.tier]
                      }}
                    >
                      {activeJob.trust_score}% TRUST
                    </span>
                  </div>
                  <p className="text-xs text-stone-300 mt-2 leading-relaxed font-medium">
                    {activeJob.reason}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Pipeline Status</span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {['saved', 'applied', 'rejected', 'offer'].map((st) => (
                      <button
                        key={st}
                        onClick={() => handleUpdateStatus(activeJob.id, st as any)}
                        className={`text-xs font-semibold py-1.5 px-3 rounded-lg border capitalize cursor-pointer ${
                          activeJob.status === st 
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/60' 
                            : 'bg-[#0c0a09] text-stone-400 border-stone-855 border-stone-800/80 hover:border-stone-750'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Assessment Checklists</span>
                  <div className="bg-[#0c0a09] border border-stone-850 p-3 rounded-lg mt-2">
                    {activeJob.flags.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {activeJob.flags.map((fl, idx) => (
                          <li key={idx} className="flex gap-2 items-start text-xs text-rose-300">
                            <span className="text-rose-500 font-bold">•</span>
                            <span>{fl}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-emerald-400 font-medium">✓ Scanned clean. Fully compliant listing.</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 bg-[#0c0a09]/50 p-3 rounded-lg border border-stone-800/60 text-xs">
                  <div className="flex justify-between"><span className="text-stone-500">Location:</span><span className="text-stone-300">{activeJob.location}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Salary Range:</span><span className="text-stone-300">{activeJob.salary || 'Not specified'}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Source:</span><span className="text-stone-300 capitalize">{activeJob.source}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Scraped At:</span><span className="text-stone-300">{new Date(activeJob.saved_at).toLocaleDateString()}</span></div>
                </div>

                <a
                  href={activeJob.apply_url}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-600 font-semibold text-xs text-center text-white rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                  View Original Listing
                </a>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="border-t border-[#292524] px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 bg-[#0c0a09]">
        <span>© 2026 Job Authenticity Agent Corp. All rights reserved.</span>
        <div className="flex gap-4 mt-2 sm:mt-0 font-medium">
          <span className="hover:text-stone-400 cursor-pointer">Support</span>
          <span className="hover:text-stone-400 cursor-pointer">Privacy Policy</span>
          <span className="hover:text-stone-400 cursor-pointer">Terms of Service</span>
        </div>
      </footer>
    </div>
  );
}
