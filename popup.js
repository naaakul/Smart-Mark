document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("toggleButton");
  const statusText = document.getElementById("status");

  chrome.storage.local.get(["autoAnswerEnabled"], function (result) {
    const isEnabled = result.autoAnswerEnabled || false;
    toggleButton.checked = isEnabled;
    updateStatusText(isEnabled);
  });

  toggleButton.addEventListener("change", function () {
    const isEnabled = toggleButton.checked;

    chrome.storage.local.set({ autoAnswerEnabled: isEnabled });
    updateStatusText(isEnabled);

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.runtime.sendMessage({
          action: isEnabled ? "enableAutoAnswer" : "disableAutoAnswer",
          tabId: tabs[0].id,
        });
      }
    });
  });

  function updateStatusText(isEnabled) {
    statusText.textContent = isEnabled
      ? "Enabled - Answering Questions"
      : "Disabled";
    statusText.style.color = isEnabled ? "#4285f4" : "#666";
  }
});
