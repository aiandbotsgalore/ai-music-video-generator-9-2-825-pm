
import type { GeneratedVideo } from "../types";

// These declarations inform TypeScript that FFmpeg and FFmpegUtil will be available as global variables at runtime.
declare const FFmpeg: any;
declare const FFmpegUtil: any;

let ffmpeg: any;

const loadFfmpeg = async (onProgress: (message: string) => void): Promise<void> => {
    if (ffmpeg && ffmpeg.loaded) {
        return;
    }
    
    const { FFmpeg } = window as any;
    if (!FFmpeg) {
        throw new Error("FFmpeg library not loaded. Please check your internet connection and ensure ad-blockers are not interfering.");
    }

    ffmpeg = new FFmpeg();
    ffmpeg.on('log', ({ message }: { message: string }) => {
        // You can uncomment the line below for detailed ffmpeg logs in the console
        // console.log(message);
    });

    onProgress('Loading core video engine...');
    await ffmpeg.load({
        coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js'
    });
    onProgress('Video engine loaded!');
}

export const exportVideo = async (
    generatedVideo: GeneratedVideo,
    onProgress: (progress: number, message: string) => void
): Promise<void> => {
    
    await loadFfmpeg((message) => onProgress(0, message));
    
    const { FFmpegUtil } = window as any;
    if (!FFmpegUtil) {
        throw new Error("FFmpeg utility library not loaded. Please check your internet connection.");
    }

    const { audioFile, videoFiles, editDecisionList } = generatedVideo;
    const totalDuration = editDecisionList.reduce((acc, d) => acc + d.duration, 0);

    ffmpeg.on('progress', ({ progress, time }: { progress: number, time: number }) => {
        // Ensure progress doesn't exceed 100% due to ffmpeg's time reporting
        const calculatedProgress = Math.min(1, time / totalDuration);
        onProgress(calculatedProgress, `Rendering video...`);
    });

    onProgress(0, 'Preparing media files...');
    // Write audio to ffmpeg's virtual file system
    await ffmpeg.writeFile(audioFile.name, await FFmpegUtil.fetchFile(audioFile));
    
    // De-duplicate video files to only write and process each unique file once.
    const uniqueVideoFiles = [...new Map(videoFiles.map(item => [item.name, item])).values()];
    for (const file of uniqueVideoFiles) {
        onProgress(0, `Loading clip: ${file.name}`);
        await ffmpeg.writeFile(file.name, await FFmpegUtil.fetchFile(file));
    }

    const inputs: string[] = [];
    const filterComplex: string[] = [];
    let concatInputs = '';

    // Create a mapping from file name to its index in the unique list
    const fileNameToIndexMap = new Map(uniqueVideoFiles.map((file, index) => [file.name, index]));

    // Audio is the first input
    inputs.push('-i', audioFile.name);

    // Add each unique video file as an input
    uniqueVideoFiles.forEach(file => {
        inputs.push('-i', file.name);
    });

    editDecisionList.forEach((decision, index) => {
        const originalFile = videoFiles[decision.clipIndex];
        // The video stream index is its position in the unique list + 1 (because audio is at index 0)
        const videoStreamIndex = fileNameToIndexMap.get(originalFile.name)! + 1;
        
        filterComplex.push(`[${videoStreamIndex}:v]trim=duration=${decision.duration},setpts=PTS-STARTPTS[v${index}]`);
        concatInputs += `[v${index}]`;
    });
    
    // Concatenate all trimmed video parts and set a compatible pixel format
    filterComplex.push(`${concatInputs}concat=n=${editDecisionList.length}:v=1:a=0,format=yuv420p[outv]`);
    
    const command = [
        ...inputs,
        '-filter_complex', filterComplex.join(';'),
        '-map', '[outv]',    // Map the final video stream
        '-map', '0:a',    // Map the audio from the first input file
        '-c:v', 'libx264',
        '-c:a', 'aac',
        '-shortest',      // Finish encoding when the shortest input stream ends (the audio)
        'output.mp4'
    ];

    onProgress(0, 'Starting final render...');
    await ffmpeg.exec(...command);
    onProgress(1, 'Render complete! Preparing download...');

    const data = await ffmpeg.readFile('output.mp4');
    
    const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' }));

    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-music-video.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    onProgress(1, 'Download started!');
};
