document.addEventListener("DOMContentLoaded", function () {
  const actionButton = document.getElementById("actionButton");
  const statusText = document.getElementById("status");
  const errorMessage = document.getElementById("errorMessage");

  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      const currentUrl = tabs[0].url;

      if (!isGoogleForm(currentUrl)) {
        actionButton.disabled = true;
        actionButton.style.opacity = "0.5";
        actionButton.style.cursor = "not-allowed";
        statusText.textContent = "Extension only works on Google Forms";
        statusText.style.color = "#ff9999";
        return;
      }

      initializeExtension();
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

  function initializeExtension() {
    chrome.storage.local.get(
      ["autoAnswerEnabled", "errorState"],
      function (result) {
        const isEnabled = result.autoAnswerEnabled || false;
        updateButtonState(isEnabled);

        if (result.errorState) {
          showError(result.errorState);
        }
      }
    );

    actionButton.addEventListener("click", function () {
      if (actionButton.disabled) return;

      chrome.storage.local.get(["autoAnswerEnabled"], function (result) {
        const isEnabled = result.autoAnswerEnabled || false;
        const newState = !isEnabled;

        hideError();
        chrome.storage.local.remove(["errorState"]);

        chrome.storage.local.set({ autoAnswerEnabled: newState });
        updateButtonState(newState);

        chrome.tabs.query(
          { active: true, currentWindow: true },
          function (tabs) {
            if (tabs[0]) {
              chrome.runtime.sendMessage({
                action: newState ? "enableAutoAnswer" : "disableAutoAnswer",
                tabId: tabs[0].id,
              });

              if (newState) {
                statusText.textContent = "Analyzing questions...";
              }
            }
          }
        );
      });
    });

    chrome.runtime.onMessage.addListener(function (message) {
      if (message.action === "updateStatus") {
        statusText.textContent = message.status;

        if (message.completed) {
          updateButtonState(false);
          chrome.storage.local.set({ autoAnswerEnabled: false });
          statusText.textContent = "Quiz completed successfully!";
        }
      } else if (message.action === "showError") {
        showError(message.error);
        updateButtonState(false);
        chrome.storage.local.set({
          autoAnswerEnabled: false,
          errorState: message.error,
        });
      }
    });
  }

  function updateButtonState(isEnabled) {
    if (isEnabled) {
      actionButton.classList.add("active");
      statusText.textContent = "Analyzing questions...";
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
