import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

export class LlmService {
  constructor() {
    this.provider = config.llmProvider;
    this.model = config.geminiModel;
    this.client = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null;
  }

  get configured() {
    return Boolean(this.client);
  }

  fallbackAnswer() {
    return 'I found relevant Justo Global context for this question, but GEMINI_API_KEY is not configured yet. Add the key to enable live Gemini 2.5 Flash-Lite answers.';
  }

  async generate(prompt) {
    if (!this.client) return this.fallbackAnswer();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 700,
      },
    });

    return response.text || '';
  }

  async *stream(prompt) {
    if (!this.client) {
      yield this.fallbackAnswer();
      return;
    }

    const response = await this.client.models.generateContentStream({
      model: this.model,
      contents: prompt,
      config: {
        temperature: 0.35,
        topP: 0.9,
        maxOutputTokens: 700,
      },
    });

    for await (const chunk of response) {
      if (chunk.text) yield chunk.text;
    }
  }
}
