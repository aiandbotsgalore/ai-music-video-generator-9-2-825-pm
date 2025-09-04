# AGENTS.md

This document provides an overview of the key agents, services, and tools in the AI Music Video Generator codebase. It describes their purposes, key functions, input/output formats, conventions, and interaction guidelines. This helps AI agents like Jules understand the project's architecture, enabling more accurate code generation, debugging, and feature implementation.

The app is a browser-based React application that transforms audio tracks into synchronized music videos. It handles audio/video uploads, performs client-side analysis (beats, energy, objects, motion), uses Google's Gemini API for creative sequencing, previews the result, and exports MP4 videos using FFmpeg. All processing is client-side to ensure privacy and offline capability, with heavy computations offloaded to Web Workers and queues for stability.

## Core Services

### geminiService
- **Description**: Integrates with Google's Gemini API for AI-driven music description and video sequencing. It analyzes audio to generate vibe descriptions and combines audio/video metadata to create edit decision lists and creative rationales for video assembly.
- **Key Functions**:
  - `describeMusic`:
    - Input: `audioFile` (File - audio file like MP3/WAV).
    - Output: string (descriptive text of the music's vibe, e.g., "Energetic hyper-pop with fast beats").
    - Conventions: Asynchronous call; handles file upload to Gemini; may throw errors for invalid audio or API failures.
    - How to Interact: Import from './services/geminiService'. Called in AudioUpload.tsx during vibe analysis. Ensure API key is configured via environment variables or SDK init.
  - `createVideoSequence`:
    - Input: `musicDescription` (string - vibe text), `audioAnalysis` (AudioAnalysis - object with duration, bpm, beats[], energySegments[]), `clipsMetadata` (ClipMetadata[] - array with file details and VideoAnalysis), `progressCallback` (function - for streaming updates).
    - Output: { editDecisionList: EditDecision[] (array of {clipIndex, duration, description}), creativeRationale: CreativeRationale (object with overallTheme, pacingStrategy, colorPalette, timeline: TimelineDecision[]) }.
    - Conventions: Streams progress messages via callback; API calls are rate-limited; errors on missing analysis data. Uses generative AI, so outputs may vary—seed for reproducibility if needed.
    - How to Interact: Import from './services/geminiService'. Called in App.tsx during generation. Wrap in try-catch for API errors.

### videoAnalysisService
- **Description**: Performs client-side computer vision on video clips using TensorFlow.js models (COCO-SSD for object detection, BlazeFace for faces). Analyzes frames for faces, objects, category, motion, brightness, and complexity. Runs in a Web Worker to avoid blocking the UI, with main-thread frame extraction for compatibility.
- **Key Functions**:
  - `analyzeVideoContent`:
    - Input: `file` (File - video file like MP4).
    - Output: VideoAnalysis (object with hasFaces: boolean, detectedObjects: DetectedObject[] ({class, score}), dominantCategory: 'people'|'nature'|'urban'|'action'|'other', motionLevel: 'static'|'low'|'medium'|'high', avgBrightness: number (0-1), visualComplexity: number (0-1)).
    - Conventions: Uses transferable ImageBitmaps for efficiency; timeouts at 30s; models loaded lazily (COCO-SSD, BlazeFace via CDNs). Deduplicates running tasks by file ID. Extracts 3 frames by default (20%, 50%, 80% timestamps).
    - How to Interact: Import from './services/videoAnalysisService'. Enqueue via analysisQueue.push() in App.tsx for concurrency control (max 2). Terminate worker with `terminateWorker()` on app unmount. Handle errors like timeouts or model load failures.
- **Additional Notes**: Worker code is inline as a string; supports WebGL backend. For optimization, adjust frameTimes based on duration.

### audioAnalysisWorkerService
- **Description**: Analyzes audio files in a Web Worker for timing and energy metrics, detecting BPM, beat timestamps, and energy segments. Essential for syncing video edits to music.
- **Key Functions**:
  - `analyzeAudio`:
    - Input: `file` (File - audio file).
    - Output: AudioAnalysis (object with duration: number, bpm: number, beats: Beat[] ({timestamp, confidence}), energySegments: EnergySegment[] ({startTime, endTime, intensity: 'low'|'medium'|'high'})).
    - Conventions: Worker-based to handle compute-intensive tasks; assumes standard audio formats. Errors on corrupted files.
    - How to Interact: Import from './services/audioAnalysisWorkerService'. Called asynchronously in AudioUpload.tsx handleSubmit. Terminate with `terminateWorker()` on unmount.
- **Additional Notes**: Integrates with AudioUpload for real-time progress; no external deps beyond browser APIs.

### videoExportService
- **Description**: Exports the generated video sequence as MP4 using FFmpeg.js in the browser. Compiles clips based on editDecisionList, overlays audio, and handles quality presets (full/preview).
- **Key Functions**:
  - `exportVideo`:
    - Input: `generatedVideo` (GeneratedVideo - full object with audioFile, videoFiles, editDecisionList), `onProgress` (function - callback for progress/message), `quality` ('full'|'preview' - optional, defaults to 'full').
    - Output: Triggers browser download of MP4 file; no direct return (async void).
    - Conventions: Loads FFmpeg lazily via CDN; deduplicates files; applies FFmpeg filters for trim/concat/scale. Preview uses faster preset and lower bitrate (2M). Handles memory cleanup post-export.
    - How to Interact: Import from './services/videoExportService'. Called in PreviewPlayer.tsx on download buttons. Wrap in try-catch for memory/FFmpeg errors; use onProgress for UI updates.
- **Additional Notes**: Relies on window.FFmpeg global; may fail on large files due to browser memory limits—suggest preview for testing.

### dbService
- **Description**: Manages local storage using IndexedDB for video history and clip metadata. Persists GeneratedVideo and ClipMetadata objects across sessions.
- **Key Functions**:
  - `addHistory`, `getAllHistory`: Add/retrieve GeneratedVideo[] (sorted by createdAt descending).
  - `addClip`, `getAllClips`, `getClip`: Add/retrieve ClipMetadata[] or single by ID.
  - Input/Output: GeneratedVideo or ClipMetadata objects; async promises.
  - Conventions: Handles DB init/errors (e.g., private mode blocking); uses file IDs for uniqueness.
  - How to Interact: Import * as db from './services/dbService'. Called in App.tsx for load/save. Fallback to console errors if IndexedDB unsupported.

## Utility Modules

### analysisQueue (in App.tsx)
- **Description**: Custom queue limiting concurrent analysis tasks (e.g., video/audio) to prevent browser crashes. Supports cancellation.
- **Key Features**: `AnalysisQueue` class with `push` (returns {promise, cancel}), `clearPending`.
- **Conventions**: Max concurrency 2; used for videoAnalysisService calls.
- **How to Interact**: Instantiated in App.tsx; enqueue tasks like analysisQueue.push(async () => { ... }).

### utils/video (getClipMetadata)
- **Description**: Extracts metadata/thumbnail from video files (duration, resolution, base64 thumbnail).
- **Key Function**: `getClipMetadata` - Input: File; Output: Partial<ClipMetadata> with id, name, size, duration, resolution, thumbnail, createdAt.
- **How to Interact**: Import from './utils/video'. Called in App.tsx handleClipsAdded.

## UI Components as Agents

While primarily UI, these integrate with services and can be treated as entry points for interactions.

### AudioUpload.tsx
- **Description**: Handles audio upload, vibe description via Gemini, and audio analysis initiation.
- **Key Interactions**: Triggers describeMusic and analyzeAudio; passes to onSubmit.
- **How to Interact**: Props: onSubmit (file, description, analysis). Renders drag-drop, textarea, buttons.

### VideoUpload.tsx
- **Description**: Manages video clip uploads, selection from library, analysis status display, and submission of ready clips.
- **Key Interactions**: Calls onClipsAdded for new files; displays AnalysisStatusBadge; enforces ready clips for submit.
- **How to Interact**: Props: onSubmit(files), onBack, onClipsAdded, clipLibrary, onCancelAnalysis, onRetryAnalysis.

### PreviewPlayer.tsx
- **Description**: Previews synced video with audio, allows clip swaps, shows director's commentary, and handles exports.
- **Key Interactions**: Syncs video clips to audio timeline; calls exportVideo; integrates ClipSwapView and DirectorsCommentary.
- **How to Interact**: Props: generatedVideo, onRestart, clipLibrary. Manages local edit list for overrides.

## General Guidelines
- **Dependencies**: See package.json - React 19+, @google/generative-ai, TensorFlow.js (tfjs, coco-ssd, blazeface), no server-side.
- **Best Practices**: All heavy ops in workers/queues; error handling with user-friendly messages; revoke URLs for memory. Update this file for new features to aid AI agents.