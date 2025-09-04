/* services/videoAnalysisService.ts
   Revised: main-thread frame extraction + worker does ML inference on ImageBitmaps.
   - Extract frames on main thread (HTMLVideoElement + canvas -> ImageBitmap)
   - Send transferable ImageBitmaps to worker
   - Worker uses OffscreenCanvas and tfjs to perform detections/metrics
   - runningTasks stores the full promise so duplicate requests return the same promise
   - timeouts and worker error handling added
*/

import type { VideoAnalysis } from '../types';

const WORKER_TIMEOUT_MS = 30000; // 30s timeout per analysis task

// Worker code (runs in dedicated Worker)
const workerCode = `
self.importScripts(
  'https://unpkg.com/@tensorflow/tfjs@4.20.0/dist/tf.min.js',
  'https://unpkg.com/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js',
  'https://unpkg.com/@tensorflow-models/blazeface@0.1.0/dist/blazeface.min.js'
);

let objectModel = null;
let faceModel = null;
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
    // eslint-disable-next-line no-console
    console.log('Video analysis models loaded in worker.');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to load models in worker:', e);
    throw e;
  }
}

function analyzeBrightnessFromImageData(imageData) {
  const data = imageData.data;
  let totalBrightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    totalBrightness += (r + g + b) / 3;
  }
  return (totalBrightness / (data.length / 4)) / 255;
}

// Sobel-like visual complexity estimate
function analyzeSobel(imageData) {
  const width = imageData.width;
  const height = imageData.height;
  const grayscale = new Uint8ClampedArray(width * height);
  const data = imageData.data;
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    grayscale[j] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

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
      if (magnitude > 128) edgePixels++;
    }
  }
  return edgePixels / (width * height);
}

function classifyObjects(objects) {
    const classes = new Set(objects.map(o => o.class));
    if (classes.has('person')) return 'people';
    if (classes.has('car') || classes.has('bus') || classes.has('traffic light')) return 'urban';
    if (classes.has('sports ball') || classes.has('skateboard') || classes.has('surfboard')) return 'action';
    if (classes.has('bird') || classes.has('cat') || classes.has('dog') || classes.has('tree')) return 'nature';
    return 'other';
}

function calculateMotionFromImageData(frame1, frame2) {
  const data1 = frame1.data;
  const data2 = frame2.data;
  let diff = 0;
  for (let i = 0; i < data1.length; i += 4) {
    const r1 = data1[i], g1 = data1[i + 1], b1 = data1[i + 2];
    const r2 = data2[i], g2 = data2[i + 1], b2 = data2[i + 2];
    diff += Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
  }
  const numPixels = data1.length / 4;
  const maxDiff = numPixels * 3 * 255;
  const motionScore = diff / maxDiff;

  if (motionScore > 0.1) return 'high';
  if (motionScore > 0.03) return 'medium';
  if (motionScore > 0.005) return 'low';
  return 'static';
}

self.onmessage = async (event) => {
  const { bitmaps, fileId } = event.data;
  try {
    await loadModels();

    if (!bitmaps || bitmaps.length === 0) {
      throw new Error('No frames provided to worker.');
    }

    // Use OffscreenCanvas to get ImageData and to feed tf.fromPixels when needed
    const centralIndex = Math.floor(bitmaps.length / 2);
    const centralBitmap = bitmaps[centralIndex];
    const width = centralBitmap.width;
    const height = centralBitmap.height;

    const off = new OffscreenCanvas(width, height);
    const ctx = off.getContext('2d');
    ctx.drawImage(centralBitmap, 0, 0, width, height);
    const centralImageData = ctx.getImageData(0, 0, width, height);

    // Run models on central frame
    const tensor = self.tf.browser.fromPixels(centralBitmap);
    const [objectPredictions, facePredictions] = await Promise.all([
      objectModel.detect(tensor),
      faceModel.estimateFaces(tensor, false)
    ]);
    tensor.dispose();

    const detectedObjects = objectPredictions.map(p => ({ class: p.class, score: p.score }));

    // Calculate metrics across frames
    const brightnessSum = bitmaps.reduce((sum, bmp) => {
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const ct = c.getContext('2d');
      ct.drawImage(bmp, 0, 0, bmp.width, bmp.height);
      const id = ct.getImageData(0, 0, bmp.width, bmp.height);
      return sum + analyzeBrightnessFromImageData(id);
    }, 0);

    const avgBrightness = brightnessSum / bitmaps.length;
    const visualComplexity = analyzeSobel(centralImageData);

    // Motion: compare first and last frames if available
    let motionLevel = 'static';
    if (bitmaps.length > 1) {
      const first = bitmaps[0];
      const last = bitmaps[bitmaps.length - 1];

      // get imageData for first & last
      const c1 = new OffscreenCanvas(first.width, first.height);
      const ct1 = c1.getContext('2d');
      ct1.drawImage(first, 0, 0, first.width, first.height);
      const id1 = ct1.getImageData(0, 0, first.width, first.height);

      const c2 = new OffscreenCanvas(last.width, last.height);
      const ct2 = c2.getContext('2d');
      ct2.drawImage(last, 0, 0, last.width, last.height);
      const id2 = ct2.getImageData(0, 0, last.width, last.height);

      motionLevel = calculateMotionFromImageData(id1, id2);
    }

    // cleanup transferable ImageBitmaps
    try {
      bitmaps.forEach(b => {
        if (b && typeof b.close === 'function') {
          b.close();
        }
      });
    } catch (e) {
      // ignore if close fails
    }

    const analysisResult = {
      hasFaces: (facePredictions && facePredictions.length > 0),
      detectedObjects,
      dominantCategory: classifyObjects(detectedObjects),
      motionLevel,
      avgBrightness,
      visualComplexity,
    };

    self.postMessage({ fileId, success: true, analysis: analysisResult });

  } catch (error) {
    const message = (error && error.message) ? error.message : String(error);
    self.postMessage({ fileId, success: false, error: message });
  }
};
`;

// runtime state
let worker: Worker | null = null;
let workerBlobUrl: string | null = null;
type RunningTask = {
  promise: Promise<VideoAnalysis>;
  resolve: (value: VideoAnalysis) => void;
  reject: (reason?: any) => void;
  timeoutId: number | null;
};
const runningTasks = new Map<string, RunningTask>();

function createWorkerInstance() {
  if (worker) return worker;
  try {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
    worker = new Worker(workerBlobUrl);

    // safe to revoke the blob url after worker is created (worker keeps reference)
    if (workerBlobUrl) {
      URL.revokeObjectURL(workerBlobUrl);
      workerBlobUrl = null;
    }

    worker.onmessage = (event) => {
      const { fileId, success, analysis, error } = event.data;
      const task = runningTasks.get(fileId);
      if (!task) return;

      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }

      if (success) {
        task.resolve(analysis);
      } else {
        task.reject(new Error(error || 'Unknown worker error'));
      }
      runningTasks.delete(fileId);
    };

    worker.onerror = (ev) => {
      // reject all outstanding tasks
      runningTasks.forEach((task, id) => {
        if (task.timeoutId) clearTimeout(task.timeoutId);
        task.reject(new Error('Video analysis worker crashed.'));
      });
      runningTasks.clear();
      // terminate worker
      try { worker?.terminate(); } catch (e) {}
      worker = null;
    };

    worker.onmessageerror = (ev) => {
      // handle structured clone / transfer errors similarly
      runningTasks.forEach((task) => {
        if (task.timeoutId) clearTimeout(task.timeoutId);
        task.reject(new Error('Video analysis worker message error.'));
      });
      runningTasks.clear();
      try { worker?.terminate(); } catch (e) {}
      worker = null;
    };

    return worker;
  } catch (e) {
    console.error('Failed to create video analysis worker:', e);
    worker = null;
    throw e;
  }
}

export function terminateWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch (e) {
      // ignore
    }
    worker = null;
  }
  runningTasks.forEach((t) => {
    if (t.timeoutId) clearTimeout(t.timeoutId);
    t.reject(new Error('Worker terminated.'));
  });
  runningTasks.clear();
}

// Helper: extract frames on main thread and create transferable ImageBitmap(s)
async function extractFramesAsImageBitmaps(file: File, frameTimes: number[]): Promise<ImageBitmap[]> {
  return new Promise(async (resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video for frame extraction.'));
    };

    try {
      await new Promise<void>((res) => {
        video.onloadedmetadata = () => res();
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(640, video.videoWidth || 640);
      canvas.height = Math.min(360, video.videoHeight || 360);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        cleanup();
        reject(new Error('Could not get 2D context for frame extraction.'));
        return;
      }

      const bitmaps: ImageBitmap[] = [];
      for (const t of frameTimes) {
        await new Promise<void>((res, rej) => {
          let timedOut = false;
          const to = window.setTimeout(() => { timedOut = true; rej(new Error('Frame seek timeout')); }, 5000);
          video.currentTime = Math.max(0, Math.min(t, video.duration - 0.05));
          video.onseeked = async () => {
            if (timedOut) return;
            clearTimeout(to);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            try {
              const bitmap = await createImageBitmap(canvas);
              bitmaps.push(bitmap);
              res();
            } catch (e) {
              rej(e);
            }
          };
        });
      }

      cleanup();
      resolve(bitmaps);
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

export async function analyzeVideoContent(file: File): Promise<VideoAnalysis> {
  const fileId = `${file.name}-${file.lastModified}-${file.size}`;

  // return existing promise if analysis already in progress
  const existing = runningTasks.get(fileId);
  if (existing) {
    return existing.promise;
  }

  const workerInstance = createWorkerInstance();
  if (!workerInstance) {
    throw new Error('Video analysis worker is not available.');
  }

  // Create promise and store it so concurrent callers reuse it
  let resolveFn: (value: VideoAnalysis) => void;
  let rejectFn: (reason?: any) => void;
  const promise = new Promise<VideoAnalysis>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  const task: RunningTask = {
    promise,
    resolve: (v) => {},
    reject: (r) => {},
    timeoutId: null
  };
  task.resolve = (v) => resolveFn(v);
  task.reject = (r) => rejectFn(r);

  // attach timeout to prevent hanging promises
  const timeoutId = window.setTimeout(() => {
    task.reject(new Error('Video analysis timed out.'));
    runningTasks.delete(fileId);
  }, WORKER_TIMEOUT_MS);
  task.timeoutId = timeoutId;

  runningTasks.set(fileId, task);

  (async () => {
    let bitmaps: ImageBitmap[] = [];
    try {
      const videoForMeta = document.createElement('video');
      videoForMeta.preload = 'metadata';
      videoForMeta.src = URL.createObjectURL(file);
      await new Promise<void>((res, rej) => {
        videoForMeta.onloadedmetadata = () => res();
        videoForMeta.onerror = () => rej(new Error('Failed to load video metadata for analysis.'));
      });
      const duration = videoForMeta.duration;
      URL.revokeObjectURL(videoForMeta.src);

      let frameTimes = [0.2 * duration, 0.5 * duration, 0.8 * duration].filter(t => t > 0.05 && t < duration - 0.05);
      if (frameTimes.length === 0) {
        frameTimes = [Math.min(0.2, duration / 2)];
      }

      bitmaps = await extractFramesAsImageBitmaps(file, frameTimes);
      
      try {
        // Send ImageBitmaps to worker (transferable)
        workerInstance.postMessage({ bitmaps, fileId }, bitmaps);
      } catch(e) {
        // If postMessage fails (e.g., transfer error), close bitmaps on main thread.
        bitmaps.forEach(b => b.close && b.close());
        throw e; // re-throw the error to be caught by the outer catch block
      }

      // The worker will resolve the promise via the onmessage handler.
    } catch (err) {
      if (task.timeoutId) clearTimeout(task.timeoutId);
      runningTasks.delete(fileId);
      task.reject(err);
    }
  })();

  return promise;
}

// Attempt to clean up on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    terminateWorker();
  });
}