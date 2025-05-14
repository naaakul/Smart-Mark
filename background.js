chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ autoAnswerEnabled: false });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableAutoAnswer") {
    enableAutoAnswer(message.tabId);
  } else if (message.action === "disableAutoAnswer") {
    disableAutoAnswer(message.tabId);
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
      files: ["content.js"],
    })
    .catch((err) => console.error("Failed to inject content script:", err));
}

function disableAutoAnswer(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "disable" }).catch(() => {});
}
