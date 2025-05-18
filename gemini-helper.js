class GeminiHelper {
  constructor() {
    // Hard-coded API key as requested
    this.apiKey = "AIzaSyB8JaIwQwiBjc-W5V0MtGJAZcO7dOkbfGA";
    this.apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  }

  async getAnswerForMCQ(question, options) {
    const prompt = this.formatPrompt(question, options);

    try {
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 100,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = "An error occurred with the AI service";
        
        if (errorData.error) {
          if (errorData.error.code === 403) {
            errorMessage = "API key is invalid or has exceeded its quota";
          } else if (errorData.error.message) {
            errorMessage = `Error: ${errorData.error.message}`;
          }
        }
        
        // Send error to popup
        chrome.runtime.sendMessage({
          action: "showError",
          error: errorMessage
        });
        
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.candidates && data.candidates.length > 0) {
        const answer = data.candidates[0].content.parts[0].text;
        return this.findBestOptionMatch(answer, options);
      } else {
        const errorMessage = "No response from AI service";
        chrome.runtime.sendMessage({
          action: "showError",
          error: errorMessage
        });
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error calling Gemini API:", error);
      
      // If we haven't already sent an error message, send a generic one
      if (!error.message.includes("API key") && !error.message.includes("No response")) {
        chrome.runtime.sendMessage({
          action: "showError",
          error: "Connection error or service unavailable. Please try again."
        });
      }
      
      throw error;
    }
  }

  formatPrompt(question, options) {
    return `You are an expert at answering multiple choice questions. 
    Please analyze this question and tell me which of the options is correct.
    
    Question: ${question}
    
    Options:
    ${options.map((opt, i) => `${i + 1}. ${opt}`).join("\n")}
    
    Please respond with ONLY the exact text of the correct option, no explanations or additional text.`;
  }

  findBestOptionMatch(apiResponse, options) {
    const cleanResponse = apiResponse.trim();

    for (const option of options) {
      if (cleanResponse.includes(option)) {
        return option;
      }
    }

    let bestMatch = options[0];
    let highestSimilarity = 0;

    for (const option of options) {
      const similarity = this.calculateSimilarity(cleanResponse, option);
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = option;
      }
    }

    return bestMatch;
  }

  calculateSimilarity(text1, text2) {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let intersection = 0;
    for (const word of set1) {
      if (set2.has(word)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return intersection / union;
  }
}

window.GeminiHelper = GeminiHelper;