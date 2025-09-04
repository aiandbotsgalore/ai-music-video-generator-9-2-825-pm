import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { getGenAI, __setMockAiForTesting } from './geminiClient';

// Mock the GoogleGenAI class constructor
vi.mock('@google/genai', () => {
    const GoogleGenAI = vi.fn(() => ({
        // mock any methods you need to use
    }));
    return { GoogleGenAI };
});

describe('services/geminiClient', () => {
    const originalApiKey = process.env.API_KEY;

    beforeEach(() => {
        // Reset the singleton instance before each test
        __setMockAiForTesting(null); 
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Restore original environment variable
        process.env.API_KEY = originalApiKey;
    });

    it('should throw an error if API_KEY is not set', () => {
        delete process.env.API_KEY;
        expect(() => getGenAI()).toThrow('Gemini API key not found. Please set the GEMINI_API_KEY environment variable.');
    });

    it('should create a new GoogleGenAI instance if one does not exist', () => {
        process.env.API_KEY = 'test-api-key';
        const ai = getGenAI();
        expect(GoogleGenAI).toHaveBeenCalledTimes(1);
        expect(GoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
        expect(ai).toBeInstanceOf(GoogleGenAI);
    });

    it('should return the existing instance on subsequent calls', () => {
        process.env.API_KEY = 'test-api-key';
        const ai1 = getGenAI();
        const ai2 = getGenAI();
        expect(GoogleGenAI).toHaveBeenCalledTimes(1);
        expect(ai1).toBe(ai2);
    });

    it('__setMockAiForTesting should override the singleton instance', () => {
        const mockAi = { isMock: true } as any as GoogleGenAI;
        __setMockAiForTesting(mockAi);
        
        const ai = getGenAI();
        expect(ai).toBe(mockAi);
        expect(GoogleGenAI).not.toHaveBeenCalled();

        // Subsequent call should still return the mock
        const ai2 = getGenAI();
        expect(ai2).toBe(mockAi);
    });
});
