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

      this.initGeminiHelper()
        .then(() => {
          this.setupListeners();
          this.startObserver();

          // Scan for questions
          this.totalQuestions = this.getQuestionContainers().length;
          
          if (this.totalQuestions === 0) {
            this.sendStatusUpdate("No questions found on this page", true);
            this.disable();
            return;
          }
          
          this.sendStatusUpdate(`Found ${this.totalQuestions} questions`);
          this.processVisibleQuestions();

          console.log("MCQ Auto-Answerer initialized");
        })
        .catch((err) => {
          console.error("Failed to initialize MCQ Auto-Answerer:", err);
          this.sendError("Failed to start: " + (err.message || "Unknown error"));
          this.disable();
        });
      console.log("MCQAutoAnswerer initializing...");
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
          this.processVisibleQuestions();
        }
      });

      const formContent = document.querySelector("form");
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
        const questionElement = container.querySelector("[data-params]");
        if (!questionElement) continue;

        const questionId = this.getQuestionId(questionElement);
        if (!questionId || this.processedQuestions.has(questionId)) continue;

        const { question, options } = this.extractQuestionData(container);
        if (!question || options.length === 0) continue;

        this.processingQuestion = true;
        this.processedQuestions.add(questionId);

        try {
          if (this.geminiHelper) {
            try {
              const correctOptionText = await this.geminiHelper.getAnswerForMCQ(
                question,
                options
              );
              
              if (correctOptionText) {
                this.selectCorrectOption(container, correctOptionText);
                processedThisRound++;
                this.questionsAnswered++;
                this.sendStatusUpdate(`Answered ${this.questionsAnswered} of ${this.totalQuestions}`);
                
                // If we've answered all questions, auto-disable
                if (this.questionsAnswered >= this.totalQuestions) {
                  this.sendStatusUpdate("All questions answered", true);
                  this.disable();
                }
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
      
      // If we didn't process any questions and there are unanswered ones, wait and try again
      if (processedThisRound === 0 && this.questionsAnswered < this.totalQuestions) {
        setTimeout(() => {
          if (this.enabled) {
            this.processVisibleQuestions();
          }
        }, 1000);
      }
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
        .filter((text) => text);

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
          if (input) {
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
            clickable.click();
            console.log("Selected alternative answer:", optionText);
            break;
          }
        }
      }
    }

    isTextSimilar(text1, text2) {
      return (
        text1.toLowerCase().includes(text2.toLowerCase()) ||
        text2.toLowerCase().includes(text1.toLowerCase())
      );
    }

    sendStatusUpdate(message, completed = false) {
      chrome.runtime.sendMessage({
        action: "updateStatus",
        status: message,
        completed: completed
      });
    }
    
    sendError(message) {
      chrome.runtime.sendMessage({
        action: "showError", 
        error: message
      });
    }

    disable() {
      this.enabled = false;
      if (this.observer) {
        this.observer.disconnect();
      }
      console.log("MCQ Auto-Answerer disabled");
    }
  }

  const autoAnswerer = new MCQAutoAnswerer();
}