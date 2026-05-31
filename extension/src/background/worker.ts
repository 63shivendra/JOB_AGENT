import { ApiClient } from '../shared/api';

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Job Authenticity Agent] Service Worker Installed.');
});

// Listener to proxy all API requests from content script to bypass host CSP and CORS
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Job Authenticity Agent] Worker received message type:', message.type);

  if (message.type === 'SCORE_PAGE') {
    ApiClient.scorePage(message.url, message.rawText, message.titleHint, message.companyHint)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.type === 'SAVE_JOB') {
    ApiClient.saveJob(message.job, message.scored, message.notes)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }

  if (message.type === 'GET_SAVED_JOBS') {
    ApiClient.getSavedJobs()
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }

  if (message.type === 'DELETE_SAVED_JOB') {
    ApiClient.deleteSavedJob(message.id)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }

  return false;
});

// Handle clicking the extension icon: broadcast toggle message to content script
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' })
      .catch((err) => {
        console.log('[Job Authenticity Agent] Direct message skipped (tab is not a supported webpage or needs refresh):', err.message);
      });
  }
});
