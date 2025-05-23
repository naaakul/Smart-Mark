chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    autoAnswerEnabled: false,
  });

  chrome.storage.local.remove([
    "apiRequestHistory",
    "hourlyRequestCount",
    "lastHourReset",
  ]);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "enableAutoAnswer") {
    chrome.tabs.get(message.tabId, (tab) => {
      if (isGoogleForm(tab.url)) {
        enableAutoAnswer(message.tabId);
      } else {
        chrome.runtime.sendMessage({
          action: "showError",
          error: "Extension only works on Google Forms",
        });
      }
    });
  } else if (message.action === "disableAutoAnswer") {
    disableAutoAnswer(message.tabId);
  } else if (message.action === "openSuccessPage") {
    chrome.tabs.create({ url: "https://nakul.space", active: false });
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && isGoogleForm(tab.url)) {
    chrome.storage.local.get(["autoAnswerEnabled"], (result) => {
      if (result.autoAnswerEnabled) {
        enableAutoAnswer(tabId);
      }
    });
  }
});

function isGoogleForm(url) {
  return (
    url &&
    (url.includes("docs.google.com/forms") ||
      url.includes("forms.google.com") ||
      url.includes("forms.gle"))
  );
}

function enableAutoAnswer(tabId) {
  chrome.tabs.get(tabId, (tab) => {
    if (!isGoogleForm(tab.url)) {
      chrome.runtime.sendMessage({
        action: "showError",
        error: "Extension only works on Google Forms",
      });
      return;
    }

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
      .then(() => {
        console.log("Scripts injected successfully for tab:", tabId);
      })
      .catch((err) => {
        console.error("Failed to inject scripts:", err);
        let errorMessage =
          "Failed to start. Please refresh the page and try again.";

        if (err.message && err.message.includes("Cannot access")) {
          errorMessage =
            "Cannot access this page. Make sure you're on a Google Form.";
        } else if (err.message && err.message.includes("frame")) {
          errorMessage =
            "Page not ready. Please wait for the form to load completely.";
        }

        chrome.runtime.sendMessage({
          action: "showError",
          error: errorMessage,
        });
      });
  });
}

function disableAutoAnswer(tabId) {
  chrome.tabs.sendMessage(tabId, { action: "disable" }).catch((error) => {
    console.log("Could not disable auto-answer:", error);
  });
}

// Clean up old data periodically
chrome.alarms.create("cleanupApiData", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "cleanupApiData") {
    const now = Date.now();
    chrome.storage.local.get(["apiRequestHistory"], (result) => {
      if (result.apiRequestHistory) {
        const recentRequests = result.apiRequestHistory.filter(
          (timestamp) => now - timestamp < 3600000
        );
        chrome.storage.local.set({ apiRequestHistory: recentRequests });
      }
    });
  }
});
