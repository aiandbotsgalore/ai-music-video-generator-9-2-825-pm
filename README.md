# AI Music Video Generator

This is a browser-based React application that uses AI to automatically create music videos. It synchronizes user-provided audio tracks with video clips, enabling seamless creative expression entirely on the client-side.

## Features

- **AI-Powered Vibe Analysis**: Upload an audio file and let the Gemini API generate a concise, evocative description of its mood, genre, and tempo.
- **Client-Side Video Analysis**: Video clips are analyzed in the browser for content, motion, brightness, and complexity using TensorFlow.js, without ever leaving your computer.
- **Intelligent Video Sequencing**: The AI Director uses the music's vibe and the analysis of your video clips to generate a unique Edit Decision List (EDL), creating a narrative flow and synchronizing cuts to the music.
- **Interactive Preview Player**: Watch the AI-generated music video, view the "Director's Commentary" to understand the AI's creative choices, and swap clips to fine-tune the final product.
- **In-Browser Exporting**: Render and download your final music video as an MP4 file, with options for a quick preview or a full-quality export, powered by FFmpeg.js (WASM).
- **Local-First Storage**: Your clip library and project history are saved locally in your browser's IndexedDB, so your work is always available.
- **Stable & Performant**: Heavy computations are offloaded to Web Workers and managed by a queue system to prevent the UI from freezing, even when analyzing multiple clips.

## Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **AI**: Google Gemini API (`@google/genai`)
- **Video/Image Processing**:
    - **Analysis**: TensorFlow.js (COCO-SSD, BlazeFace)
    - **Export**: FFmpeg.js (via WebAssembly)
- **Tooling**: Vite, Vitest for testing
- **Storage**: IndexedDB

## Project Setup

### Prerequisites

- Node.js (version 20 or higher recommended)
- An active Google Gemini API Key

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd ai-music-video-generator
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a file named `.env` in the root of the project directory and add your Gemini API key:
    ```
    GEMINI_API_KEY="YOUR_API_KEY_HERE"
    ```
    The application uses Vite to automatically load this environment variable.

## Available Scripts

### `npm run dev`

Runs the app in development mode. Open [http://localhost:5173](http://localhost:5173) (or the port shown in your terminal) to view it in your browser. The page will reload when you make changes.

### `npm run build`

Builds the app for production to the `dist` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

### `npm run test`

Launches the test runner in interactive watch mode using Vitest. This will run all the unit and integration tests for the project.
