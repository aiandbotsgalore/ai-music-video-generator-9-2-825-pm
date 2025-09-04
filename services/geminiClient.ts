import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

export const getGenAI = (): GoogleGenAI => {
  if (ai) return ai;
  // Fix: API key must be obtained exclusively from process.env.API_KEY.
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    throw new Error("Gemini API key not found. Please set the GEMINI_API_KEY environment variable.");
  }
  ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
};

/**
 * Overrides the default GoogleGenAI instance with a mock for testing.
 * @param mockAi The mock GoogleGenAI instance.
 */
export const __setMockAiForTesting = (mockAi: GoogleGenAI | null) => {
  ai = mockAi;
};
