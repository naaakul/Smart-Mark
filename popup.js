document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("toggleButton");
  const statusText = document.getElementById("status");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const saveApiKeyBtn = document.getElementById("saveApiKeyBtn");

  chrome.storage.local.get(
    ["autoAnswerEnabled", "geminiApiKey"],
    function (result) {
      const isEnabled = result.autoAnswerEnabled || false;
      toggleButton.checked = isEnabled;
      updateStatusText(isEnabled);

      if (result.geminiApiKey) {
        apiKeyInput.value = result.geminiApiKey;
      }
    }
  );

  toggleButton.addEventListener("change", function () {
    const isEnabled = toggleButton.checked;

    chrome.storage.local.get(["geminiApiKey"], function (result) {
      if (
        isEnabled &&
        (!result.geminiApiKey || result.geminiApiKey.trim() === "")
      ) {
        alert("Please enter a Gemini API key before enabling auto-answering.");
        toggleButton.checked = false;
        return;
      }

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
  });

  saveApiKeyBtn.addEventListener("click", function () {
    const apiKey = apiKeyInput.value.trim();

    if (apiKey === "") {
      alert("Please enter a valid Gemini API key.");
      return;
    }

    chrome.storage.local.set({ geminiApiKey: apiKey }, function () {
      const originalText = saveApiKeyBtn.textContent;
      saveApiKeyBtn.textContent = "Saved!";
      saveApiKeyBtn.disabled = true;

      setTimeout(() => {
        saveApiKeyBtn.textContent = originalText;
        saveApiKeyBtn.disabled = false;
      }, 2000);
    });
  });

  function updateStatusText(isEnabled) {
    statusText.textContent = isEnabled
      ? "Enabled - Answering Questions"
      : "Disabled";
    statusText.style.color = isEnabled ? "#4285f4" : "#666";
  }
});
