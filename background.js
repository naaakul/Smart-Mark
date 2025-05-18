chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    autoAnswerEnabled: false,
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableAutoAnswer") {
    enableAutoAnswer(message.tabId);
  } else if (message.action === "disableAutoAnswer") {
    disableAutoAnswer(message.tabId);
  } else if (message.action === "openSuccessPage") {
    // Open nakul.space in a new tab when all questions are answered
    chrome.tabs.create({ url: "https://nakul.space", active: false });
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("forms.google.com")
  ) {
    chrome.storage.local.get(["autoAnswerEnabled"], (result) => {
      if (result.autoAnswerEnabled) {
        enableAutoAnswer(tabId);
      }
    });
  }
});

function enableAutoAnswer(tabId) {
  chrome.scripting
    .executeScript({
      target: { tabId: tabId },
      files: ["gemini-helper.js"],
    })
    .then(() => {
      return chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"],
      });
    })
    .catch((err) => {
      console.error("Failed to inject scripts:", err);
      chrome.runtime.sendMessage({
        action: "showError",
        error: "Failed to start auto-answering. Please refresh the page and try again."
      });
    });
  console.log("Enabling auto answer for tab:", tabId);
}

function disableAutoAnswer(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "disable" }).catch(() => {});
}