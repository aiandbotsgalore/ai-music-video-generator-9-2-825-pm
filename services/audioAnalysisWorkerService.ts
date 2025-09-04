import type { AudioAnalysis, Beat, EnergySegment } from '../types';

// The entire worker logic as a string.
// This includes the functions from the old audioAnalysisService.ts
const workerCode = `
self.onmessage = async (event) => {
    const { file, id } = event.data;
    try {
        const analysisResult = await performAnalysis(file);
        self.postMessage({ id, success: true, analysis: analysisResult });
    } catch (error) {
        self.postMessage({ id, success: false, error: error.message });
    }
};

async function performAnalysis(file) {
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
        console.error("Failed to analyze audio in worker:", error);
        throw new Error("Could not process the audio file. It may be corrupted or in an unsupported format.");
    }
}

async function decodeAudioData(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new (self.AudioContext || self.webkitAudioContext)();
    const buffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();
    return buffer;
}

function analyzeEnergy(buffer) {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const segmentDuration = 1;
    const samplesPerSegment = sampleRate * segmentDuration;
    const segments = [];
    const energyLevels = [];

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
        segments.push({ startTime, endTime: segmentEnd / sampleRate, intensity: 'low' });
    }

    if (energyLevels.length === 0) return [];

    const sortedEnergy = [...energyLevels].sort((a, b) => a - b);
    const lowThreshold = sortedEnergy[Math.floor(sortedEnergy.length * 0.33)];
    const highThreshold = sortedEnergy[Math.floor(sortedEnergy.length * 0.66)];

    const classifiedSegments = segments.map((segment, index) => {
        const energy = energyLevels[index];
        let intensity;
        if (energy >= highThreshold) intensity = 'high';
        else if (energy >= lowThreshold) intensity = 'medium';
        else intensity = 'low';
        return { ...segment, intensity };
    });

    if (classifiedSegments.length === 0) return [];

    const mergedSegments = [];
    let currentSegment = { ...classifiedSegments[0] };

    for (let i = 1; i < classifiedSegments.length; i++) {
        const nextSegment = classifiedSegments[i];
        if (nextSegment.intensity === currentSegment.intensity) {
            currentSegment.endTime = nextSegment.endTime;
        } else {
            mergedSegments.push(currentSegment);
            currentSegment = { ...nextSegment };
        }
    }
    mergedSegments.push(currentSegment);
    return mergedSegments;
}

function analyzeBeats(buffer) {
    // This is an advanced beat detection algorithm based on onset detection functions (ODF)
    // across multiple frequency bands. It's more robust than simple peak picking.
    return new Promise(async (resolve, reject) => {
        const sampleRate = buffer.sampleRate;

        // 1. ODF Calculation Parameters
        const frameSize = 1024; // Samples per frame for energy calculation
        const hopLength = 256;  // Samples to slide the frame forward

        // 2. Separate into frequency bands using OfflineAudioContext
        const createFilteredBuffer = async (type, frequency) => {
            const offlineContext = new (self.OfflineAudioContext || self.webkitOfflineAudioContext)(1, buffer.length, sampleRate);
            const source = offlineContext.createBufferSource();
            source.buffer = buffer;

            const filter = offlineContext.createBiquadFilter();
            filter.type = type;
            if (type === 'bandpass') {
                filter.frequency.setValueAtTime(frequency, 0);
                filter.Q.setValueAtTime(1, 0);
            } else {
                 filter.frequency.setValueAtTime(frequency, 0);
            }

            source.connect(filter);
            filter.connect(offlineContext.destination);
            source.start(0);
            return await offlineContext.startRendering();
        };

        const [lowBuffer, midBuffer, highBuffer] = await Promise.all([
            createFilteredBuffer('lowpass', 200),
            createFilteredBuffer('bandpass', 1500),
            createFilteredBuffer('highpass', 5000)
        ]);
        
        // 3. Calculate Energy Envelope & ODF for each band
        const getOdf = (bandBuffer) => {
            const bandData = bandBuffer.getChannelData(0);
            const energyEnvelope = [];
            for (let i = 0; i < bandData.length - frameSize; i += hopLength) {
                let sumOfSquares = 0;
                for (let j = 0; j < frameSize; j++) {
                    sumOfSquares += bandData[i + j] * bandData[i + j];
                }
                energyEnvelope.push(Math.sqrt(sumOfSquares / frameSize));
            }
            
            const odf = [0];
            for (let i = 1; i < energyEnvelope.length; i++) {
                const diff = energyEnvelope[i] - energyEnvelope[i - 1];
                odf.push(Math.max(0, diff)); // Rectify (only count increases in energy)
            }
            return odf;
        };

        const odfLow = getOdf(lowBuffer);
        const odfMid = getOdf(midBuffer);
        const odfHigh = getOdf(highBuffer);

        // 4. Combine ODFs with weighting (bass is usually most important for rhythm)
        const combinedOdf = [];
        for (let i = 0; i < odfLow.length; i++) {
            combinedOdf.push(odfLow[i] + odfMid[i] * 0.5 + odfHigh[i] * 0.8);
        }

        // 5. Peak Picking on Combined ODF using an adaptive threshold
        const peaks = [];
        const peakThresholdWindow = Math.floor(sampleRate / hopLength / 2); // ~0.5s window for local average
        
        for (let i = 1; i < combinedOdf.length - 1; i++) {
            // Check if it's a local maximum
            if (combinedOdf[i] > combinedOdf[i - 1] && combinedOdf[i] > combinedOdf[i + 1]) {
                // Calculate local average threshold
                const windowStart = Math.max(0, i - peakThresholdWindow);
                const windowEnd = Math.min(combinedOdf.length, i + peakThresholdWindow);
                let localSum = 0;
                for (let j = windowStart; j < windowEnd; j++) {
                    localSum += combinedOdf[j];
                }
                const localAverage = localSum / (windowEnd - windowStart);
                const threshold = localAverage * 1.2 + 0.01; // Adaptive threshold = 120% of local average + a constant

                if (combinedOdf[i] > threshold) {
                    peaks.push({
                        index: i,
                        timestamp: (i * hopLength) / sampleRate,
                    });
                }
            }
        }

        if (peaks.length < 4) { // Need a few beats for a reliable tempo
            resolve({ bpm: 120, beats: [] });
            return;
        }

        // 6. Calculate BPM from Inter-Onset Intervals (IOIs) using a histogram method
        const iois = [];
        for (let i = 1; i < peaks.length; i++) {
            iois.push(peaks[i].timestamp - peaks[i-1].timestamp);
        }

        const tempoBins = {};
        iois.forEach(ioi => {
            if (ioi > 0.1) { // Ignore very short intervals which are likely noise
                const tempo = 60 / ioi;
                // Group tempos into nearby bins to find the dominant tempo
                const bin = Object.keys(tempoBins).find(key => {
                    const binTempo = parseFloat(key);
                    return tempo > binTempo * 0.95 && tempo < binTempo * 1.05;
                });

                if (bin) {
                    tempoBins[bin].count++;
                    tempoBins[bin].tempos.push(tempo);
                } else {
                    tempoBins[tempo] = { count: 1, tempos: [tempo] };
                }
            }
        });
        
        if (Object.keys(tempoBins).length === 0) {
             resolve({ bpm: 120, beats: [] }); // Default if no valid tempos found
             return;
        }
        
        const dominantBin = Object.values(tempoBins).reduce((a, b) => a.count > b.count ? a : b);
        let bpm = dominantBin.tempos.reduce((sum, t) => sum + t, 0) / dominantBin.tempos.length;
        
        // Normalize BPM to a reasonable range (e.g., 70-180)
        while (bpm < 70) bpm *= 2;
        while (bpm > 180) bpm /= 2;

        const beats = peaks.map(p => ({
            timestamp: p.timestamp,
            confidence: 1.0 // Confidence could be derived from peak height vs threshold in future
        }));

        resolve({ bpm: Math.round(bpm), beats });
    });
}
`;

// Main thread interface
let worker: Worker | null = null;
const runningTasks = new Map<string, { resolve: (value: AudioAnalysis) => void; reject: (reason?: any) => void }>();
let nextTaskId = 0;

function createWorker(): Worker {
    if (worker) {
        return worker;
    }
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);

    worker.onmessage = (event) => {
        const { id, success, analysis, error } = event.data;
        const task = runningTasks.get(id);
        if (task) {
            if (success) {
                task.resolve(analysis);
            } else {
                task.reject(new Error(error));
            }
            runningTasks.delete(id);
        }
    };

    worker.onerror = (error) => {
        console.error("Audio analysis worker error:", error);
        runningTasks.forEach((task, id) => {
            task.reject(new Error("Audio analysis worker encountered an unrecoverable error."));
            runningTasks.delete(id);
        });
        terminateWorker();
    };

    return worker;
}

export function terminateWorker(): void {
    if (worker) {
        worker.terminate();
        worker = null;
        runningTasks.forEach((task, id) => {
            task.reject(new Error("Audio analysis was cancelled because the worker was terminated."));
            runningTasks.delete(id);
        });
    }
}

export function analyzeAudio(file: File): Promise<AudioAnalysis> {
    const workerInstance = createWorker();
    const id = `task-${nextTaskId++}`;

    return new Promise((resolve, reject) => {
        runningTasks.set(id, { resolve, reject });
        workerInstance.postMessage({ file, id });
    });
}
