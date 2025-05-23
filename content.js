if (typeof window.mcqAutoAnswererRunning === "undefined") {
  window.mcqAutoAnswererRunning = true;

  class MCQAutoAnswerer {
    constructor() {
      this.enabled = true;
      this.processingQuestion = false;
      this.observerConfig = { childList: true, subtree: true };
      this.observer = null;
      this.processedQuestions = new Set();
      this.geminiHelper = null;
      this.questionsAnswered = 0;
      this.totalQuestions = 0;
      this.processingDelay = 2000;

      if (!this.isGoogleForm()) {
        this.sendError("Extension only works on Google Forms");
        this.disable();
        return;
      }

      this.initGeminiHelper()
        .then(() => {
          this.setupListeners();
          this.startObserver();

          setTimeout(() => {
            this.totalQuestions = this.getQuestionContainers().length;

            if (this.totalQuestions === 0) {
              this.sendStatusUpdate(
                "No questions found. Make sure the form is fully loaded.",
                true
              );
              this.disable();
              return;
            }

            this.sendStatusUpdate(`Found ${this.totalQuestions} questions`);
            this.processVisibleQuestions();
          }, 1000);

          console.log("MCQ Auto-Answerer initialized");
        })
        .catch((err) => {
          console.error("Failed to initialize MCQ Auto-Answerer:", err);
          this.sendError(
            "Failed to start: " + (err.message || "Unknown error")
          );
          this.disable();
        });
      console.log("MCQAutoAnswerer initializing...");
    }

    isGoogleForm() {
      return (
        window.location.href.includes("docs.google.com/forms") ||
        window.location.href.includes("forms.google.com") ||
        window.location.href.includes("forms.gle")
      );
    }

    initGeminiHelper() {
      if (typeof window.GeminiHelper !== "undefined") {
        this.geminiHelper = new window.GeminiHelper();
        return Promise.resolve();
      } else {
        return Promise.reject(new Error("AI service not loaded"));
      }
    }

    setupListeners() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "disable") {
          this.disable();
          sendResponse({ status: "disabled" });
        }
        return true;
      });
    }

    startObserver() {
      this.observer = new MutationObserver(() => {
        if (this.enabled && !this.processingQuestion) {
          clearTimeout(this.observerTimeout);
          this.observerTimeout = setTimeout(() => {
            this.processVisibleQuestions();
          }, 500);
        }
      });

      const formContent = document.querySelector("form") || document.body;
      if (formContent) {
        this.observer.observe(formContent, this.observerConfig);
      }
    }

    async processVisibleQuestions() {
      if (!this.enabled) return;

      const questionContainers = this.getQuestionContainers();
      const totalQuestionsNow = questionContainers.length;

      if (totalQuestionsNow > this.totalQuestions) {
        this.totalQuestions = totalQuestionsNow;
        this.sendStatusUpdate(`Found ${this.totalQuestions} questions`);
      }

      let processedThisRound = 0;

      for (const container of questionContainers) {
        if (!this.enabled) break;

        const questionElement = container.querySelector("[data-params]");
        if (!questionElement) continue;

        const questionId = this.getQuestionId(questionElement);
        if (!questionId || this.processedQuestions.has(questionId)) continue;

        const { question, options } = this.extractQuestionData(container);
        if (!question || options.length === 0) continue;

        if (this.isQuestionAnswered(container)) {
          this.processedQuestions.add(questionId);
          continue;
        }

        this.processingQuestion = true;
        this.processedQuestions.add(questionId);

        try {
          if (this.geminiHelper) {
            this.sendStatusUpdate(
              `Processing question ${this.questionsAnswered + 1} of ${
                this.totalQuestions
              }...`
            );

            try {
              const correctOptionText = await this.geminiHelper.getAnswerForMCQ(
                question,
                options
              );

              if (correctOptionText && this.enabled) {
                this.selectCorrectOption(container, correctOptionText);
                processedThisRound++;
                this.questionsAnswered++;
                this.sendStatusUpdate(
                  `Answered ${this.questionsAnswered} of ${this.totalQuestions}`
                );

                if (this.questionsAnswered >= this.totalQuestions) {
                  this.sendStatusUpdate(
                    "All questions answered successfully!",
                    true
                  );

                  chrome.runtime.sendMessage({
                    action: "openSuccessPage",
                  });
                  this.disable();
                  return;
                }

                await this.delay(this.processingDelay);
              }
            } catch (apiError) {
              console.error("Error using Gemini API:", apiError);
              this.sendError("AI service error: " + apiError.message);
              this.disable();
              break;
            }
          } else {
            this.sendError("AI service not available");
            this.disable();
            break;
          }
        } catch (error) {
          console.error("Error answering question:", error);
          this.sendError("Error: " + error.message);
          this.disable();
        } finally {
          this.processingQuestion = false;
        }
      }

      if (
        processedThisRound === 0 &&
        this.questionsAnswered < this.totalQuestions &&
        this.enabled
      ) {
        setTimeout(() => {
          if (this.enabled) {
            this.processVisibleQuestions();
          }
        }, 3000);
      }
    }

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    isQuestionAnswered(container) {
      const selectedRadio = container.querySelector(
        'input[type="radio"]:checked'
      );
      if (selectedRadio) return true;

      const selectedCheckbox = container.querySelector(
        'input[type="checkbox"]:checked'
      );
      if (selectedCheckbox) return true;

      const textInput = container.querySelector('input[type="text"], textarea');
      if (textInput && textInput.value.trim()) return true;

      return false;
    }

    getQuestionContainers() {
      const containers = Array.from(
        document.querySelectorAll('div[role="listitem"]')
      );

      if (containers.length === 0) {
        const altContainers = Array.from(
          document.querySelectorAll(
            ".freebirdFormviewerComponentsQuestionBaseRoot"
          )
        );
        if (altContainers.length > 0) {
          return altContainers;
        }

        return Array.from(
          document.querySelectorAll(".freebirdFormviewerViewItemsItemItem")
        );
      }

      return containers;
    }

    getQuestionId(element) {
      return element.textContent.trim().substring(0, 50);
    }

    extractQuestionData(container) {
      let questionElement = container.querySelector("[data-params]");
      if (!questionElement) {
        questionElement = container.querySelector(
          ".freebirdFormviewerComponentsQuestionBaseHeader"
        );
      }
      if (!questionElement) {
        questionElement = container.querySelector(
          ".freebirdFormviewerViewItemsItemItemTitle"
        );
      }

      const question = questionElement
        ? questionElement.textContent.trim()
        : "";

      let optionElements = Array.from(container.querySelectorAll("label"));
      if (optionElements.length === 0) {
        optionElements = Array.from(
          container.querySelectorAll(".docssharedWizToggleLabeledContainer")
        );
      }
      if (optionElements.length === 0) {
        optionElements = Array.from(
          container.querySelectorAll(
            ".freebirdFormviewerComponentsQuestionRadioChoice"
          )
        );
      }

      const options = optionElements
        .map((option) => {
          const optionText = option.textContent.trim();
          return optionText;
        })
        .filter((text) => text && text.length > 0);

      console.log("Extracted question:", question);
      console.log("Extracted options:", options);
      return { question, options };
    }

    selectCorrectOption(container, correctOptionText) {
      const optionLabels = Array.from(container.querySelectorAll("label"));
      let clicked = false;

      for (const label of optionLabels) {
        const labelText = label.textContent.trim();

        if (this.isTextSimilar(labelText, correctOptionText)) {
          const input = label.querySelector('input[type="radio"]');
          if (input && !input.checked) {
            input.click();
            console.log("Selected answer:", labelText);
            clicked = true;
            break;
          }
        }
      }

      if (!clicked) {
        const altOptions = Array.from(
          container.querySelectorAll(".docssharedWizToggleLabeledContainer")
        );
        for (const option of altOptions) {
          const optionText = option.textContent.trim();
          if (this.isTextSimilar(optionText, correctOptionText)) {
            const clickable =
              option.querySelector(".docssharedWizToggleLabeledLabelWrapper") ||
              option.querySelector(
                ".freebirdFormviewerComponentsQuestionRadioChoiceContainer"
              ) ||
              option;
            if (clickable) {
              clickable.click();
              console.log("Selected alternative answer:", optionText);
              clicked = true;
              break;
            }
          }
        }
      }

      if (!clicked) {
        console.warn("Could not find matching option for:", correctOptionText);
      }
    }

    isTextSimilar(text1, text2) {
      const clean1 = text1.toLowerCase().trim();
      const clean2 = text2.toLowerCase().trim();

      return (
        clean1.includes(clean2) || clean2.includes(clean1) || clean1 === clean2
      );
    }

    sendStatusUpdate(message, completed = false) {
      chrome.runtime.sendMessage({
        action: "updateStatus",
        status: message,
        completed: completed,
      });
    }

    sendError(message) {
      chrome.runtime.sendMessage({
        action: "showError",
        error: message,
      });
    }

    disable() {
      this.enabled = false;
      if (this.observer) {
        this.observer.disconnect();
      }
      if (this.observerTimeout) {
        clearTimeout(this.observerTimeout);
      }
      console.log("MCQ Auto-Answerer disabled");
    }
  }

  const autoAnswerer = new MCQAutoAnswerer();
}
