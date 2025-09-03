import { GoogleGenAI } from "@google/genai";

let ai: GoogleGenAI | null = null;

export const getGenAI = (): GoogleGenAI => {
  if (ai) return ai;
  // Lazy init; caller is expected to configure environment/build to make this work.
  const API_KEY = (process.env as any).API_KEY;
  if (!API_KEY) {
    throw new Error("API_KEY environment variable not set. Please configure your API key.");
  }
  ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
};
