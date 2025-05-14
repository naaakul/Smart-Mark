if (typeof window.mcqAutoAnswererRunning === "undefined") {
  window.mcqAutoAnswererRunning = true;

  class MCQAutoAnswerer {
    constructor() {
      this.enabled = true;
      this.processingQuestion = false;
      this.observerConfig = { childList: true, subtree: true };
      this.observer = null;
      this.processedQuestions = new Set();

      this.setupListeners();
      this.startObserver();

      this.processVisibleQuestions();

      console.log("MCQ Auto-Answerer initialized");
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
          const correctOptionText = await this.fetchGeminiAnswer(
            question,
            options
          );

          if (correctOptionText) {
            this.selectCorrectOption(container, correctOptionText);
          }
        } catch (error) {
          console.error("Error answering question:", error);
        } finally {
          this.processingQuestion = false;
        }
      }
    }

    getQuestionContainers() {
      return Array.from(document.querySelectorAll('div[role="listitem"]'));
    }

    getQuestionId(element) {
      return element.textContent.trim().substring(0, 50);
    }

    extractQuestionData(container) {
      const questionElement = container.querySelector("[data-params]");
      const question = questionElement
        ? questionElement.textContent.trim()
        : "";

      const optionElements = Array.from(container.querySelectorAll("label"));
      const options = optionElements
        .map((option) => {
          const optionText = option.textContent.trim();
          return optionText;
        })
        .filter((text) => text);

      return { question, options };
    }

    async fetchGeminiAnswer(question, options) {
      console.log("Analyzing question:", question);
      console.log("Options:", options);

      await new Promise((resolve) => setTimeout(resolve, 500));

      return options[0];
    }

    selectCorrectOption(container, correctOptionText) {
      const optionLabels = Array.from(container.querySelectorAll("label"));

      for (const label of optionLabels) {
        const labelText = label.textContent.trim();

        if (this.isTextSimilar(labelText, correctOptionText)) {
          const input = label.querySelector('input[type="radio"]');
          if (input) {
            input.click();
            console.log("Selected answer:", labelText);
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
