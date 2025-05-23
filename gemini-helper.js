class GeminiHelper {
  constructor() {
    this.apiKey = "AIzaSyB8JaIwQwiBjc-W5V0MtGJAZcO7dOkbfGA";
    this.apiUrl =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

    this.maxRequestsPerMinute = 15;
    this.maxRequestsPerHour = 100;
    this.requestQueue = [];
    this.hourlyRequestCount = 0;
    this.lastHourReset = Date.now();

    this.initializeRateLimiting();
  }

  async initializeRateLimiting() {
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(
          ["apiRequestHistory", "lastHourReset"],
          resolve
        );
      });

      if (result.apiRequestHistory) {
        this.requestQueue = result.apiRequestHistory.filter(
          (timestamp) => Date.now() - timestamp < 60000
        );
      }

      if (result.lastHourReset) {
        this.lastHourReset = result.lastHourReset;

        if (Date.now() - this.lastHourReset > 3600000) {
          this.hourlyRequestCount = 0;
          this.lastHourReset = Date.now();
        }
      }
    } catch (error) {
      console.log("Could not initialize rate limiting data:", error);
    }
  }

  async checkRateLimit() {
    const now = Date.now();

    this.requestQueue = this.requestQueue.filter(
      (timestamp) => now - timestamp < 60000
    );

    if (now - this.lastHourReset > 3600000) {
      this.hourlyRequestCount = 0;
      this.lastHourReset = now;
    }

    if (this.requestQueue.length >= this.maxRequestsPerMinute) {
      throw new Error(
        `Rate limit exceeded: Maximum ${this.maxRequestsPerMinute} requests per minute`
      );
    }

    if (this.hourlyRequestCount >= this.maxRequestsPerHour) {
      throw new Error(
        `Rate limit exceeded: Maximum ${this.maxRequestsPerHour} requests per hour`
      );
    }

    this.requestQueue.push(now);
    this.hourlyRequestCount++;

    try {
      chrome.storage.local.set({
        apiRequestHistory: this.requestQueue,
        lastHourReset: this.lastHourReset,
        hourlyRequestCount: this.hourlyRequestCount,
      });
    } catch (error) {
      console.log("Could not save rate limiting data:", error);
    }
  }

  async getAnswerForMCQ(question, options) {
    try {
      await this.checkRateLimit();

      const prompt = this.formatPrompt(question, options);

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
            temperature: 0.1,
            maxOutputTokens: 50,
            topP: 0.8,
            topK: 10,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = "AI service error occurred";

        if (errorData.error) {
          if (errorData.error.code === 403) {
            errorMessage = "API quota exceeded or invalid key";
          } else if (errorData.error.code === 429) {
            errorMessage =
              "Too many requests. Please wait before trying again.";
          } else if (errorData.error.message) {
            errorMessage = `API Error: ${errorData.error.message}`;
          }
        }

        chrome.runtime.sendMessage({
          action: "showError",
          error: errorMessage,
        });

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.candidates && data.candidates.length > 0) {
        const answer = data.candidates[0].content.parts[0].text;
        return this.findBestOptionMatch(answer, options);
      } else {
        const errorMessage = "No valid response from AI service";
        chrome.runtime.sendMessage({
          action: "showError",
          error: errorMessage,
        });
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error calling Gemini API:", error);

      if (error.message.includes("Rate limit exceeded")) {
        chrome.runtime.sendMessage({
          action: "showError",
          error: error.message,
        });
      } else if (
        !error.message.includes("API") &&
        !error.message.includes("quota")
      ) {
        chrome.runtime.sendMessage({
          action: "showError",
          error: "Connection error. Please check your internet and try again.",
        });
      }

      throw error;
    }
  }

  formatPrompt(question, options) {
    return `Answer this multiple choice question with ONLY the exact text of the correct option:

Question: ${question}

Options:
${options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join("\n")}

Answer with only the option text:`;
  }

  findBestOptionMatch(apiResponse, options) {
    const cleanResponse = apiResponse.trim().toLowerCase();

    for (const option of options) {
      if (cleanResponse.includes(option.toLowerCase())) {
        return option;
      }
    }

    let bestMatch = options[0];
    let highestSimilarity = 0;

    for (const option of options) {
      const similarity = this.calculateSimilarity(
        cleanResponse,
        option.toLowerCase()
      );
      if (similarity > highestSimilarity) {
        highestSimilarity = similarity;
        bestMatch = option;
      }
    }

    return bestMatch;
  }

  calculateSimilarity(text1, text2) {
    const words1 = text1.split(/\s+/).filter((word) => word.length > 2);
    const words2 = text2.split(/\s+/).filter((word) => word.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    let intersection = 0;
    for (const word of set1) {
      if (set2.has(word)) {
        intersection++;
      }
    }

    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  async getUsageStats() {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(
        ["apiRequestHistory", "hourlyRequestCount"],
        resolve
      );
    });

    return {
      requestsInLastMinute: this.requestQueue.length,
      requestsInLastHour: result.hourlyRequestCount || 0,
      maxPerMinute: this.maxRequestsPerMinute,
      maxPerHour: this.maxRequestsPerHour,
    };
  }
}

window.GeminiHelper = GeminiHelper;
