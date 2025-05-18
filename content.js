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

      this.initGeminiHelper()
        .then(() => {
          this.setupListeners();
          this.startObserver();

          this.processVisibleQuestions();

          console.log("MCQ Auto-Answerer initialized");
        })
        .catch((err) => {
          console.error("Failed to initialize MCQ Auto-Answerer:", err);
        });
      console.log("MCQAutoAnswerer initializing...");
      console.log("Document URL:", window.location.href);
    }

    async initGeminiHelper() {
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(["geminiApiKey"], (result) => {
          if (!result.geminiApiKey) {
            reject(new Error("No Gemini API key configured"));
            return;
          }

          if (typeof window.GeminiHelper !== "undefined") {
            this.geminiHelper = new window.GeminiHelper(result.geminiApiKey);
            resolve();
          } else {
            reject(new Error("GeminiHelper not loaded"));
          }
        });
      });
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
          let correctOptionText;

          if (this.geminiHelper) {
            try {
              correctOptionText = await this.geminiHelper.getAnswerForMCQ(
                question,
                options
              );
            } catch (apiError) {
              console.warn(
                "Error using Gemini API, falling back to mock:",
                apiError
              );

              correctOptionText = await this.mockAnalyzeQuestion(
                question,
                options
              );
            }
          } else {
            correctOptionText = await this.mockAnalyzeQuestion(
              question,
              options
            );
          }

          if (correctOptionText) {
            this.selectCorrectOption(container, correctOptionText);
          }
        } catch (error) {
          console.error("Error answering question:", error);
        } finally {
          this.processingQuestion = false;
        }
      }
      console.log("Processing visible questions...");
      console.log("Found question containers:", questionContainers.length);
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

    async mockAnalyzeQuestion(question, options) {
      await new Promise((resolve) => setTimeout(resolve, 800));

      const normalizedQuestion = question.toLowerCase();

      const hasNegation =
        normalizedQuestion.includes(" not ") ||
        normalizedQuestion.includes("except") ||
        normalizedQuestion.includes("incorrect");

      const hasSuperlative =
        normalizedQuestion.includes("best") ||
        normalizedQuestion.includes("most") ||
        normalizedQuestion.includes("greatest");

      if (hasNegation) {
        const optionsText = options.join(" ").toLowerCase();

        let longestOption = options[0];
        let maxLength = options[0].length;

        for (const option of options) {
          if (option.length > maxLength) {
            maxLength = option.length;
            longestOption = option;
          }
        }

        return longestOption;
      } else if (hasSuperlative) {
        for (const option of options) {
          if (
            option.includes("all of the above") ||
            option.includes("both") ||
            option.includes("always")
          ) {
            return option;
          }
        }
      }

      const questionWords = normalizedQuestion.split(/\s+/);
      let bestOption = options[0];
      let highestMatches = 0;

      for (const option of options) {
        const optionLower = option.toLowerCase();
        let matches = 0;

        for (const word of questionWords) {
          if (word.length > 3 && optionLower.includes(word)) {
            matches++;
          }
        }

        if (matches > highestMatches) {
          highestMatches = matches;
          bestOption = option;
        }
      }

      if (highestMatches > 0) {
        return bestOption;
      }

      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
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
