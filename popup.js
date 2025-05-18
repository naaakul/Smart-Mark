document.addEventListener("DOMContentLoaded", function () {
  const actionButton = document.getElementById("actionButton");
  const statusText = document.getElementById("status");
  const errorMessage = document.getElementById("errorMessage");
  
  // Check current state
  chrome.storage.local.get(["autoAnswerEnabled", "errorState"], function (result) {
    const isEnabled = result.autoAnswerEnabled || false;
    updateButtonState(isEnabled);
    
    // If there was an error previously, display it
    if (result.errorState) {
      showError(result.errorState);
    }
  });

  actionButton.addEventListener("click", function () {
    // Get current state and toggle it
    chrome.storage.local.get(["autoAnswerEnabled"], function (result) {
      const isEnabled = result.autoAnswerEnabled || false;
      const newState = !isEnabled;
      
      // Clear any previous errors
      hideError();
      chrome.storage.local.remove(["errorState"]);
      
      // Update the state
      chrome.storage.local.set({ autoAnswerEnabled: newState });
      updateButtonState(newState);

      // Send message to the background script
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (tabs[0]) {
          chrome.runtime.sendMessage({
            action: newState ? "enableAutoAnswer" : "disableAutoAnswer",
            tabId: tabs[0].id,
          });
          
          if (newState) {
            statusText.textContent = "Answering the quiz...";
          }
        }
      });
    });
  });
  
  // Listen for messages from content script or background script
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === "updateStatus") {
      statusText.textContent = message.status;
      
      if (message.completed) {
        updateButtonState(false);
        chrome.storage.local.set({ autoAnswerEnabled: false });
      }
    } else if (message.action === "showError") {
      showError(message.error);
      updateButtonState(false);
      chrome.storage.local.set({ 
        autoAnswerEnabled: false,
        errorState: message.error 
      });
    }
  });
  
  function updateButtonState(isEnabled) {
    if (isEnabled) {
      actionButton.classList.add("active");
      statusText.textContent = "Answering the quiz...";
    } else {
      actionButton.classList.remove("active");
      statusText.textContent = "Click to start answering";
    }
  }
  
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }
  
  function hideError() {
    errorMessage.textContent = "";
    errorMessage.style.display = "none";
  }
});