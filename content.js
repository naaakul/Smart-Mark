if (typeof window.mcqAutoAnswererRunning === 'undefined') {
  window.mcqAutoAnswererRunning = true;
  
  // Main controller
  class MCQAutoAnswerer {
    constructor() {
      this.enabled = true;
      this.processingQuestion = false;
      this.observerConfig = { childList: true, subtree: true };
      this.observer = null;
      this.processedQuestions = new Set();
      this.geminiHelper = null;
      
      // Initialize
      this.initGeminiHelper()
        .then(() => {
          this.setupListeners();
          this.startObserver();
          
          // Process any questions that are already on the page
          this.processVisibleQuestions();
          
          console.log('MCQ Auto-Answerer initialized');
        })
        .catch(err => {
          console.error('Failed to initialize MCQ Auto-Answerer:', err);
        });
    }
    
    // Initialize Gemini Helper
    async initGeminiHelper() {
      // Get API key from storage
      return new Promise((resolve, reject) => {
        chrome.storage.local.get(['geminiApiKey'], (result) => {
          if (!result.geminiApiKey) {
            reject(new Error('No Gemini API key configured'));
            return;
          }
          
          // Create helper if window.GeminiHelper exists (from gemini-helper.js)
          if (typeof window.GeminiHelper !== 'undefined') {
            this.geminiHelper = new window.GeminiHelper(result.geminiApiKey);
            resolve();
          } else {
            reject(new Error('GeminiHelper not loaded'));
          }
        });
      });
    }
    
    // Set up message listeners
    setupListeners() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'disable') {
          this.disable();
          sendResponse({status: 'disabled'});
        }
        return true;
      });
    }
    
    // Start mutation observer to detect new questions loading
    startObserver() {
      this.observer = new MutationObserver(() => {
        if (this.enabled && !this.processingQuestion) {
          this.processVisibleQuestions();
        }
      });
      
      // Start observing the form container
      const formContent = document.querySelector('form');
      if (formContent) {
        this.observer.observe(formContent, this.observerConfig);
      }
    }
    
    // Process all visible multiple choice questions
    async processVisibleQuestions() {
      if (!this.enabled) return;
      
      // Find all question containers
      const questionContainers = this.getQuestionContainers();
      
      for (const container of questionContainers) {
        // Get unique ID for this question (using the question text to identify)
        const questionElement = container.querySelector('[data-params]');
        if (!questionElement) continue;
        
        const questionId = this.getQuestionId(questionElement);
        if (!questionId || this.processedQuestions.has(questionId)) continue;
        
        // Extract question data
        const { question, options } = this.extractQuestionData(container);
        if (!question || options.length === 0) continue;
        
        // Mark as being processed to prevent concurrent processing
        this.processingQuestion = true;
        this.processedQuestions.add(questionId);
        
        try {
          // Get the answer from Gemini API or fallback to mock
          let correctOptionText;
          
          if (this.geminiHelper) {
            try {
              // Try to use the real Gemini API
              correctOptionText = await this.geminiHelper.getAnswerForMCQ(question, options);
            } catch (apiError) {
              console.warn('Error using Gemini API, falling back to mock:', apiError);
              // Fall back to mock implementation if API fails
              correctOptionText = await this.mockAnalyzeQuestion(question, options);
            }
          } else {
            // Use mock implementation if Gemini helper isn't available
            correctOptionText = await this.mockAnalyzeQuestion(question, options);
          }
          
          // Find and click the correct option
          if (correctOptionText) {
            this.selectCorrectOption(container, correctOptionText);
          }
        } catch (error) {
          console.error('Error answering question:', error);
        } finally {
          this.processingQuestion = false;
        }
      }
    }
    
    // Get all question containers on the page
    getQuestionContainers() {
      // These are the containers for each question in a Google Form
      return Array.from(document.querySelectorAll('div[role="listitem"]'));
    }
    
    // Generate a unique ID for a question
    getQuestionId(element) {
      // Use data attribute or text content as ID
      return element.textContent.trim().substring(0, 50);
    }
    
    // Extract question and option data from a container
    extractQuestionData(container) {
      // Find the question text
      const questionElement = container.querySelector('[data-params]');
      const question = questionElement ? questionElement.textContent.trim() : '';
      
      // Find all multiple choice options
      const optionElements = Array.from(container.querySelectorAll('label'));
      const options = optionElements.map(option => {
        const optionText = option.textContent.trim();
        return optionText;
      }).filter(text => text); // Filter out empty options
      
      return { question, options };
    }
    
    // Mock function that simulates AI analysis for demonstration
    async mockAnalyzeQuestion(question, options) {
      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Normalize question and options for analysis
      const normalizedQuestion = question.toLowerCase();
      
      // Simple heuristics to find correct answer - this simulates AI reasoning
      // These patterns are just for demonstration - real AI would be much more sophisticated
      
      // Look for negation patterns like "all EXCEPT" or "NOT"
      const hasNegation = normalizedQuestion.includes(" not ") || 
                          normalizedQuestion.includes("except") ||
                          normalizedQuestion.includes("incorrect");
      
      // Look for superlative patterns like "best" or "most"
      const hasSuperlative = normalizedQuestion.includes("best") || 
                            normalizedQuestion.includes("most") ||
                            normalizedQuestion.includes("greatest");
      
      // Look for specific answer patterns
      if (hasNegation) {
        // If question has negation, look for unusual option
        // Real AI would do much more sophisticated analysis
        const optionsText = options.join(' ').toLowerCase();
        
        // Find the longest option (often the correct answer in negation questions)
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
        // If question asks for "best" or "most", often the most specific option is correct
        // This is a simplistic heuristic
        for (const option of options) {
          if (option.includes("all of the above") || 
              option.includes("both") || 
              option.includes("always")) {
            return option;
          }
        }
      }
      
      // Look for keyword matches
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
      
      // If we have a good keyword match, use it
      if (highestMatches > 0) {
        return bestOption;
      }
      
      // If all else fails, pick a random option to simulate "educated guessing"
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    }
    
    // Select the correct option by clicking on it
    selectCorrectOption(container, correctOptionText) {
      const optionLabels = Array.from(container.querySelectorAll('label'));
      
      // Find the option that matches the correct answer
      for (const label of optionLabels) {
        const labelText = label.textContent.trim();
        
        // Find the closest match (in case of slight text differences)
        if (this.isTextSimilar(labelText, correctOptionText)) {
          // Find the actual input element and click it
          const input = label.querySelector('input[type="radio"]');
          if (input) {
            // Simulate a click on the option
            input.click();
            console.log('Selected answer:', labelText);
            break;
          }
        }
      }
    }
    
    // Simple text similarity check
    isTextSimilar(text1, text2) {
      return text1.toLowerCase().includes(text2.toLowerCase()) || 
             text2.toLowerCase().includes(text1.toLowerCase());
    }
    
    // Disable the auto-answerer
    disable() {
      this.enabled = false;
      if (this.observer) {
        this.observer.disconnect();
      }
      console.log('MCQ Auto-Answerer disabled');
    }
  }
  
  // Start the auto-answerer
  const autoAnswerer = new MCQAutoAnswerer();
}