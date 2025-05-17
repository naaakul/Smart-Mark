class GeminiHelper {
  constructor(apiKey) {
    this.apiKey = apiKey || 'AIzaSyCTJhvQmQr42NLOwUkoBWvMyEmu6fhYrnQ';
    this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
  }
  
  // Set or update API key
  setApiKey(apiKey) {
    this.apiKey = apiKey;
    // Save API key to extension storage
    chrome.storage.local.set({geminiApiKey: apiKey});
  }
  
  // Get answer from Gemini for a multiple choice question
  async getAnswerForMCQ(question, options) {
    if (!this.apiKey) {
      const storedKey = await this.getStoredApiKey();
      if (!storedKey) {
        throw new Error('No API key configured');
      }
      this.apiKey = storedKey;
    }
    
    // Format the prompt
    const prompt = this.formatPrompt(question, options);
    
    try {
      // Make the API request
      const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${errorData.error?.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      
      // Extract the answer
      if (data.candidates && data.candidates.length > 0) {
        const answer = data.candidates[0].content.parts[0].text;
        return this.findBestOptionMatch(answer, options);
      } else {
        throw new Error('No response from Gemini API');
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      throw error;
    }
  }
  
  // Format prompt for best results
  formatPrompt(question, options) {
    return `You are an expert at answering multiple choice questions. 
    Please analyze this question and tell me which of the options is correct.
    
    Question: ${question}
    
    Options:
    ${options.map((opt, i) => `${i+1}. ${opt}`).join('\n')}
    
    Please respond with ONLY the exact text of the correct option, no explanations or additional text.`;
  }
  
  // Get stored API key
  async getStoredApiKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['geminiApiKey'], (result) => {
        resolve(result.geminiApiKey || '');
      });
    });
  }
  
  // Find the best match between API response and available options
  findBestOptionMatch(apiResponse, options) {
    const cleanResponse = apiResponse.trim();
    
    // Try direct match first
    for (const option of options) {
      if (cleanResponse.includes(option)) {
        return option;
      }
    }
    
    // Fall back to fuzzy matching
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
  
  // Calculate text similarity
  calculateSimilarity(text1, text2) {
    // Convert to lowercase and split into words
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    // Create sets
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    // Count intersection
    let intersection = 0;
    for (const word of set1) {
      if (set2.has(word)) {
        intersection++;
      }
    }
    
    // Calculate Jaccard similarity
    const union = set1.size + set2.size - intersection;
    return intersection / union;
  }
}

// Export for use in other scripts
window.GeminiHelper = GeminiHelper;