// Background service worker for MCQ Auto-Answerer extension

// Initialize extension state
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    autoAnswerEnabled: false,
    geminiApiKey: ''
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle enable/disable requests
  if (message.action === 'enableAutoAnswer') {
    enableAutoAnswer(message.tabId);
  } else if (message.action === 'disableAutoAnswer') {
    disableAutoAnswer(message.tabId);
  }
  return true;
});

// Handle tab updates (page loads/navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // If the page has completely loaded and URL is a Google Form
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('forms.google.com')) {
    // Check if auto answer is enabled
    chrome.storage.local.get(['autoAnswerEnabled'], (result) => {
      if (result.autoAnswerEnabled) {
        // Inject the content script
        enableAutoAnswer(tabId);
      }
    });
  }
});

// Function to enable auto answering
function enableAutoAnswer(tabId) {
  // First inject the helper script that provides Gemini API functionality
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }).catch(err => console.error("Failed to inject content script:", err));
}

// Function to disable auto answering
function disableAutoAnswer(tabId) {
  // Send a message to the content script to disable
  chrome.tabs.sendMessage(tabId, {action: 'disable'}).catch(() => {
    // Swallow errors if content script is not loaded
  });
}