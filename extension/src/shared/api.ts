import { JobPost, ScoredJob, SavedJob } from './types';

const API_BASE_URL = 'http://127.0.0.1:8000';

export class ApiClient {
  static async scoreJob(job: JobPost): Promise<ScoredJob> {
    try {
      const response = await fetch(`${API_BASE_URL}/score`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(job),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to score job:', error);
      throw error;
    }
  }

  static async scorePage(url: string, rawText: string, titleHint?: string, companyHint?: string): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/score/page`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          url, 
          raw_text: rawText, 
          title_hint: titleHint, 
          company_hint: companyHint 
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to score page:', error);
      throw error;
    }
  }

  static async saveJob(
    job: JobPost,
    scored: ScoredJob,
    notes?: string
  ): Promise<SavedJob> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          job,
          trust_score: scored.trust_score,
          tier: scored.tier,
          flags: scored.flags,
          reason: scored.reason,
          status: 'saved',
          notes,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || `API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to save job:', error);
      throw error;
    }
  }

  static async getSavedJobs(): Promise<SavedJob[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/saved`);
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch saved jobs:', error);
      throw error;
    }
  }

  static async deleteSavedJob(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Failed to delete saved job:', error);
      throw error;
    }
  }

  static async getAnalyticsSummary(): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/analytics/summary`);
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      throw error;
    }
  }
}
