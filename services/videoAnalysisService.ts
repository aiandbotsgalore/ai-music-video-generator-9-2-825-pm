import type { VideoAnalysis } from '../types';

// The entire worker code is defined here as a string.
// This avoids needing a separate file and complex build configurations.
const workerCode = `
self.importScripts(
    'https://unpkg.com/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
    'https://unpkg.com/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
    'https://unpkg.com/@tensorflow-models/blazeface@0.1.0/dist/blazeface.min.js'
);

let objectModel;
let faceModel;
let modelsLoaded = false;

async function loadModels() {
    if (modelsLoaded) return;
    try {
        await self.tf.setBackend('webgl');
        [objectModel, faceModel] = await Promise.all([
            self.cocoSsd.load(),
            self.blazeface.load()
        ]);
        modelsLoaded = true;
        console.log('Video analysis models loaded in worker.');
    } catch (error) {
        console.error("Error loading TF.js models in worker:", error);
        throw new Error("Failed to load AI models for video analysis.");
    }
}

// UTILITY FUNCTIONS FOR THE WORKER

function extractFrameData(file, time) {
    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('Could not get canvas context.'));

        video.onloadedmetadata = () => { video.currentTime = time; };
        video.onseeked = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(video.src);
            resolve(imageData);
        };
        video.onerror = (e) => reject(new Error('Video file error in worker.'));
        video.src = URL.createObjectURL(file);
    });
}

function analyzeBrightness(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalBrightness += (r + g + b) / 3;
    }
    return (totalBrightness / (data.length / 4)) / 255;
}

function applySobel(imageData) {
    const width = imageData.width;
    const height = imageData.height;
    const grayscale = new Uint8ClampedArray(width * height);
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j++) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        grayscale[j] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const sobelData = new Float32Array(width * height);
    let edgePixels = 0;

    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = y * width + x;
            const gx = (grayscale[i - width - 1] - grayscale[i - width + 1]) +
                       (2 * (grayscale[i - 1] - grayscale[i + 1])) +
                       (grayscale[i + width - 1] - grayscale[i + width + 1]);
            const gy = (grayscale[i - width - 1] - grayscale[i + width - 1]) +
                       (2 * (grayscale[i - width] - grayscale[i + width])) +
                       (grayscale[i - width + 1] - grayscale[i + width + 1]);
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            sobelData[i] = magnitude;
            if (magnitude > 128) edgePixels++;
        }
    }
    return edgePixels / (width * height);
}

function calculateMotion(frame1, frame2) {
    const data1 = frame1.data;
    const data2 = frame2.data;
    let diff = 0;
    for (let i = 0; i < data1.length; i += 4) {
        const r1 = data1[i]; const g1 = data1[i+1]; const b1 = data1[i+2];
        const r2 = data2[i]; const g2 = data2[i+1]; const b2 = data2[i+2];
        diff += Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
    }
    const motionScore = (diff / (data1.length * 3 * 255)); // Normalized score
    if (motionScore > 0.1) return 'high';
    if (motionScore > 0.03) return 'medium';
    if (motionScore > 0.005) return 'low';
    return 'static';
}

function classifyObjects(objects) {
    const classes = new Set(objects.map(o => o.class));
    if (classes.has('person')) return 'people';
    if (classes.has('car') || classes.has('bus') || classes.has('traffic light')) return 'urban';
    if (classes.has('sports ball') || classes.has('skateboard') || classes.has('surfboard')) return 'action';
    if (classes.has('bird') || classes.has('cat') || classes.has('dog') || classes.has('tree')) return 'nature';
    return 'other';
}

// MAIN WORKER LOGIC
self.onmessage = async (event) => {
    // FIX: Receive fileId from the main thread to track this specific task.
    const { file, fileId } = event.data;
    try {
        await loadModels();

        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        await new Promise(r => video.onloadedmetadata = r);
        const duration = video.duration;
        URL.revokeObjectURL(video.src);

        // Analyze multiple frames
        const frameTimes = [0.2 * duration, 0.5 * duration, 0.8 * duration].filter(t => t > 0.1 && t < duration - 0.1);
        if (frameTimes.length === 0) frameTimes.push(Math.min(0.2, duration / 2));
        
        const frameDatas = await Promise.all(frameTimes.map(time => extractFrameData(file, time)));

        const centralFrame = frameDatas[Math.floor(frameDatas.length / 2)];

        // Run ML models on the central frame
        const tensor = self.tf.browser.fromPixels(centralFrame);
        const [objectPredictions, facePredictions] = await Promise.all([
            objectModel.detect(tensor),
            faceModel.estimateFaces(tensor, false)
        ]);
        tensor.dispose();

        const detectedObjects = objectPredictions.map(p => ({ class: p.class, score: p.score }));

        // Calculate advanced metrics
        const avgBrightness = frameDatas.reduce((sum, fd) => sum + analyzeBrightness(fd), 0) / frameDatas.length;
        const visualComplexity = analyzeSobel(centralFrame);
        const motionLevel = frameDatas.length > 1 ? calculateMotion(frameDatas[0], frameDatas[frameDatas.length - 1]) : 'static';

        const analysisResult = {
            hasFaces: facePredictions.length > 0,
            detectedObjects,
            dominantCategory: classifyObjects(detectedObjects),
            motionLevel: motionLevel,
            avgBrightness: avgBrightness,
            visualComplexity: visualComplexity,
        };

        // FIX: Send fileId back with the result.
        self.postMessage({ fileId, success: true, analysis: analysisResult });
    } catch (error) {
        console.error('Error in video analysis worker:', error);
        // FIX: Send fileId back with the error message.
        self.postMessage({ fileId, success: false, error: error.message });
    }
};
`;

let worker: Worker | null = null;
const runningTasks = new Map<string, { resolve: (value: VideoAnalysis) => void; reject: (reason?: any) => void; }>();

function getWorker() {
    if (!worker) {
        try {
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            worker = new Worker(URL.createObjectURL(blob));

            // FIX: This handler now correctly routes results to the right promise using fileId.
            worker.onmessage = (event) => {
                const { fileId, success, analysis, error } = event.data;
                const task = runningTasks.get(fileId);
                if (task) {
                    if (success) {
                        task.resolve(analysis);
                    } else {
                        task.reject(new Error(error));
                    }
                    runningTasks.delete(fileId);
                }
            };
            
        } catch (e) {
            console.error("Failed to create video analysis worker:", e);
            // Fallback for environments where workers are not supported
            worker = null;
        }
    }
    return worker;
}

export async function analyzeVideoContent(file: File): Promise<VideoAnalysis> {
    const workerInstance = getWorker();
    if (!workerInstance) {
        throw new Error("Video analysis worker is not available.");
    }
    
    const fileId = `${file.name}-${file.lastModified}-${file.size}`;
    
    // Avoid re-analyzing if a task for the exact same file is already in progress
    if (runningTasks.has(fileId)) {
        return new Promise((resolve, reject) => {
            // This is a simplification. In a real app you might want to hook into the existing promise.
            // For now, we prevent a duplicate job from being sent.
            console.log(`Analysis for ${fileId} is already in progress.`);
            // This might need a more robust solution if the user can cancel/re-add quickly.
            // For now, we can reject to prevent a hang.
            reject(new Error("This clip is already being analyzed."));
        });
    }
    
    return new Promise((resolve, reject) => {
        runningTasks.set(fileId, { resolve, reject });
        // FIX: Pass the fileId to the worker so it can be returned with the result.
        workerInstance.postMessage({ file, fileId });
    });
}