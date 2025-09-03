import { describe, it, expect, vi } from 'vitest';
import { createVideoSequence } from './geminiService';
import type { AudioAnalysis, ClipMetadata } from '../types';

// Mock the geminiClient module
vi.mock('./geminiClient', () => ({
  getGenAI: vi.fn(),
}));

describe('createVideoSequence', () => {
  it('should return an empty editDecisionList when no clips are provided', async () => {
    // Arrange
    const musicDescription = 'A test description';
    const audioAnalysis: AudioAnalysis = {
      duration: 10,
      bpm: 120,
      beats: [],
      energySegments: [],
    };
    const clips: ClipMetadata[] = []; // Empty clips array

    // Mock the AI response
    const mockAiResponse = {
      editDecisions: [
        { clipIndex: 0, duration: 5, description: 'a clip' },
        { clipIndex: 1, duration: 5, description: 'another clip' },
      ],
      creativeRationale: {
        overallTheme: 'theme',
        pacingStrategy: 'strategy',
        colorPalette: 'palette',
        timeline: [],
      },
    };

    // Set up the mock for getGenAI
    const { getGenAI } = await import('./geminiClient');
    const mockGenAIInstance = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          // The response should have a `text` property that is a string of JSON.
          text: JSON.stringify(mockAiResponse),
        }),
      },
    };
    (getGenAI as vi.Mock).mockReturnValue(mockGenAIInstance);

    // Act & Assert
    // The current implementation will throw an error because it tries to access clips[0]
    // A better test would be to assert that it throws, but for now, let's see if it fails
    // by returning a non-empty list.
    const result = await createVideoSequence(musicDescription, audioAnalysis, clips);
    expect(result.editDecisionList.length).toBe(0);
  });
});
