import type { AudioAnalysis, Beat, EnergySegment } from '../types';

async function decodeAudioData(file: File): Promise<AudioBuffer> {
    const arrayBuffer = await file.arrayBuffer();
    // Use a new context for each decoding to avoid issues
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
    return buffer;
}


function analyzeEnergy(buffer: AudioBuffer): EnergySegment[] {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const segmentDuration = 1; // Analyze in 1-second chunks
    const samplesPerSegment = sampleRate * segmentDuration;
    const segments: EnergySegment[] = [];
    const energyLevels: number[] = [];

    for (let i = 0; i < data.length; i += samplesPerSegment) {
        const segmentEnd = Math.min(i + samplesPerSegment, data.length);
        const segment = data.slice(i, segmentEnd);
        let sumOfSquares = 0;
        for (let j = 0; j < segment.length; j++) {
            sumOfSquares += segment[j] * segment[j];
        }
        const rms = Math.sqrt(sumOfSquares / segment.length);
        const startTime = i / sampleRate;
        energyLevels.push(rms);
        segments.push({ startTime, endTime: segmentEnd / sampleRate, intensity: 'low' }); // placeholder
    }

    if (energyLevels.length === 0) return [];

    const sortedEnergy = [...energyLevels].sort((a, b) => a - b);
    const lowThreshold = sortedEnergy[Math.floor(sortedEnergy.length * 0.33)];
    const highThreshold = sortedEnergy[Math.floor(sortedEnergy.length * 0.66)];

    const classifiedSegments: EnergySegment[] = segments.map((segment, index) => {
        const energy = energyLevels[index];
        let intensity: 'low' | 'medium' | 'high';
        if (energy >= highThreshold) {
            intensity = 'high';
        } else if (energy >= lowThreshold) {
            intensity = 'medium';
        } else {
            intensity = 'low';
        }
        return { ...segment, intensity };
    });

    if (classifiedSegments.length === 0) {
        return [];
    }

    // Merge consecutive segments of the same intensity
    const mergedSegments: EnergySegment[] = [];
    let currentSegment = { ...classifiedSegments[0] };

    for (let i = 1; i < classifiedSegments.length; i++) {
        const nextSegment = classifiedSegments[i];
        if (nextSegment.intensity === currentSegment.intensity) {
            // Extend the current segment's end time
            currentSegment.endTime = nextSegment.endTime;
        } else {
            // Push the completed segment and start a new one
            mergedSegments.push(currentSegment);
            currentSegment = { ...nextSegment };
        }
    }
    // Don't forget to push the last segment
    mergedSegments.push(currentSegment);

    return mergedSegments;
}


// A simplified BPM and beat detection algorithm
function analyzeBeats(buffer: AudioBuffer): Promise<{ bpm: number; beats: Beat[] }> {
    // OfflineAudioContext must be created for each render. It cannot be reused.
    const offlineContext = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
        buffer.numberOfChannels,
        buffer.length,
        buffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = buffer;

    const lowpass = offlineContext.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(150, 0);
    lowpass.Q.setValueAtTime(1, 0);

    source.connect(lowpass);
    lowpass.connect(offlineContext.destination);

    source.start(0);

    return offlineContext.startRendering().then(renderedBuffer => {
        const data = renderedBuffer.getChannelData(0);
        const sampleRate = renderedBuffer.sampleRate;
        const peaks: number[] = [];
        const threshold = 0.6; 
        
        for (let i = 0; i < data.length; i++) {
            if (data[i] > threshold) {
                peaks.push(i);
                // Skip forward to avoid detecting the same peak multiple times
                i += Math.floor(sampleRate * 0.1); 
            }
        }

        if (peaks.length < 2) return { bpm: 120, beats: [] }; // Default BPM

        const intervals = [];
        for (let i = 1; i < peaks.length; i++) {
            intervals.push((peaks[i] - peaks[i - 1]) / sampleRate);
        }

        const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const bpm = Math.round(60 / averageInterval);

        const beats: Beat[] = peaks.map(peakIndex => ({
            timestamp: peakIndex / sampleRate,
            confidence: 1.0 // Simplified confidence
        }));

        return { bpm, beats };
    });
}

export async function analyzeAudio(file: File): Promise<AudioAnalysis> {
    try {
        const buffer = await decodeAudioData(file);
        const [beatAnalysis, energySegments] = await Promise.all([
            analyzeBeats(buffer),
            analyzeEnergy(buffer)
        ]);

        return {
            duration: buffer.duration,
            ...beatAnalysis,
            energySegments
        };
    } catch (error) {
        console.error("Failed to analyze audio:", error);
        throw new Error("Could not process the audio file. It may be corrupted or in an unsupported format.");
    }
}