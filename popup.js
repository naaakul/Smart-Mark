document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleButton');
  const statusText = document.getElementById('status');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  
  // Load the saved state and API key when popup opens
  chrome.storage.local.get(['autoAnswerEnabled', 'geminiApiKey'], function(result) {
    // Default to false if not set
    const isEnabled = result.autoAnswerEnabled || false;
    toggleButton.checked = isEnabled;
    updateStatusText(isEnabled);
    
    // Set saved API key if exists
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });
  
  // Add click listener to toggle button
  toggleButton.addEventListener('change', function() {
    const isEnabled = toggleButton.checked;
    
    // Check if API key is set before enabling
    chrome.storage.local.get(['geminiApiKey'], function(result) {
      if (isEnabled && (!result.geminiApiKey || result.geminiApiKey.trim() === '')) {
        // If enabling without API key, alert user and reset toggle
        alert('Please enter a Gemini API key before enabling auto-answering.');
        toggleButton.checked = false;
        return;
      }
      
      // Save state
      chrome.storage.local.set({autoAnswerEnabled: isEnabled});
      updateStatusText(isEnabled);
      
      // Get current active tab
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          // Send message to background script to handle the toggle
          chrome.runtime.sendMessage({
            action: isEnabled ? 'enableAutoAnswer' : 'disableAutoAnswer',
            tabId: tabs[0].id
          });
        }
      });
    });
  });
  
  // Add listener for API key save button
  saveApiKeyBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    
    if (apiKey === '') {
      alert('Please enter a valid Gemini API key.');
      return;
    }
    
    // Save API key to storage
    chrome.storage.local.set({geminiApiKey: apiKey}, function() {
      // Show success message
      const originalText = saveApiKeyBtn.textContent;
      saveApiKeyBtn.textContent = 'Saved!';
      saveApiKeyBtn.disabled = true;
      
      // Reset button after 2 seconds
      setTimeout(() => {
        saveApiKeyBtn.textContent = originalText;
        saveApiKeyBtn.disabled = false;
      }, 2000);
    });
  });
  
  // Helper function to update status text
  function updateStatusText(isEnabled) {
    statusText.textContent = isEnabled ? 'Enabled - Answering Questions' : 'Disabled';
    statusText.style.color = isEnabled ? '#4285f4' : '#666';
  }
});