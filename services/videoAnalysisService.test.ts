import { describe, it, expect } from 'vitest';
import { calculateMotionFromImageData } from './videoAnalysisService';

describe('calculateMotionFromImageData', () => {
  it('should return "high" for significant motion', () => {
    // Create two ImageData objects, one black, one white
    const width = 10;
    const height = 10;
    const size = width * height * 4;
    const buffer1 = new Uint8ClampedArray(size).fill(0); // Black frame
    const buffer2 = new Uint8ClampedArray(size); // White frame
    for (let i = 0; i < size; i += 4) {
        buffer2[i] = 255;
        buffer2[i+1] = 255;
        buffer2[i+2] = 255;
        buffer2[i+3] = 255;
    }

    const frame1 = new ImageData(buffer1, width, height);
    const frame2 = new ImageData(buffer2, width, height);

    // With the bug, the score will be 0.25, which is > 0.1, so it should be "high".
    // Wait, my initial analysis of the max score was wrong.
    // max_diff = (width * height) * (255+255+255) = 100 * 765 = 76500
    // data1.length = 10 * 10 * 4 = 400
    // denominator = 400 * 3 * 255 = 306000
    // motionScore = 76500 / 306000 = 0.25
    // This is > 0.1, so it will be "high".
    // My analysis of the bug was that the score is 4 times smaller than it should be.
    // If the score was correct, it would be 1.0.
    // Let's create a case that fails.
    // Let's say motionScore should be 0.12 to be 'high'.
    // With the bug, it would be 0.03. This would be 'medium'.
    // Let's craft the data to produce this.
    // We want diff / ( (data1.length/4) * 3 * 255) = 0.12
    // diff = 0.12 * (100 * 3 * 255) = 9180
    // We need to set pixel values to get this diff.
    // Let frame1 be black (0,0,0).
    // Let frame2 have R,G,B values of x.
    // diff = 100 * (x + x + x) = 300x
    // 9180 = 300x => x = 30.6
    // Let's set the difference to be around 31 per channel.
    const buffer3 = new Uint8ClampedArray(size); // "Gray" frame
    for (let i = 0; i < size; i += 4) {
        buffer3[i] = 31;
        buffer3[i+1] = 31;
        buffer3[i+2] = 31;
        buffer3[i+3] = 255;
    }
    const frame3 = new ImageData(buffer3, width, height);
    // Expected motionScore (correct) = (100 * (31*3)) / (100 * 3 * 255) = 93/255 = ~0.36. This is 'high'.
    // Actual motionScore (buggy) = (100 * (31*3)) / (400 * 3 * 255) = 93 / (1020) = ~0.09. This is 'medium'.
    // Ah, my math is wrong again. (100 * 3 * 31) / (400 * 3 * 255) = 9300 / 306000 = 0.0303. This is 'medium'.
    // The correct score would be 0.0303 * 4 = 0.1212, which is 'high'.
    // So this test case should work. It will expect 'high' but get 'medium'.

    expect(calculateMotionFromImageData(frame1, frame3)).toBe('high');
  });
});
