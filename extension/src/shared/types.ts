export interface JobPost {
  title: string;
  company: string;
  description: string;
  salary?: string;
  location: string;
  apply_url: string;
  source_platform: string;
}

export interface ScoredJob {
  trust_score: number;
  tier: 'verified' | 'suspicious' | 'fake';
  flags: string[];
  reason: string;
  cached: boolean;
}

export interface SavedJob extends JobPost {
  id: string;
  content_hash: string;
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
