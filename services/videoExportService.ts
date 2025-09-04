
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
    onProgress: (progress: number, message: string) => void,
    quality: 'full' | 'preview' = 'full'
): Promise<void> => {
    
    await loadFfmpeg((message) => onProgress(0, message));
    
    const { FFmpegUtil } = window as any;
    if (!FFmpegUtil) {
        throw new Error("FFmpeg utility library not loaded. Please check your internet connection.");
    }

    const { audioFile, videoFiles, editDecisionList } = generatedVideo;
    const totalDuration = editDecisionList.reduce((acc, d) => acc + d.duration, 0);

    ffmpeg.on('progress', ({ progress, time }: { progress: number, time: number }) => {
        const calculatedProgress = Math.min(1, time / totalDuration);
        onProgress(calculatedProgress, quality === 'preview' ? `Rendering preview...` : `Rendering video...`);
    });

    onProgress(0, 'Preparing media files...');

    const uniqueFiles = new Map<string, File>();
    videoFiles.forEach(file => {
        const id = `${file.name}-${file.lastModified}-${file.size}`;
        if (!uniqueFiles.has(id)) {
            uniqueFiles.set(id, file);
        }
    });
    const uniqueVideoFilesArray = Array.from(uniqueFiles.values());

    const audioVirtualName = 'audio.mp3';
    await ffmpeg.writeFile(audioVirtualName, await FFmpegUtil.fetchFile(audioFile));
    
    const uniqueIdToVirtualNameMap = new Map<string, string>();
    for (let i = 0; i < uniqueVideoFilesArray.length; i++) {
        const file = uniqueVideoFilesArray[i];
        const id = `${file.name}-${file.lastModified}-${file.size}`;
        const virtualName = `input${i}.mp4`;
        uniqueIdToVirtualNameMap.set(id, virtualName);
        onProgress(0, `Loading clip: ${file.name}`);
        await ffmpeg.writeFile(virtualName, await FFmpegUtil.fetchFile(file));
    }

    const inputs: string[] = [];
    let filterComplex: string[] = [];
    let concatInputs = '';

    inputs.push('-i', audioVirtualName);
    uniqueVideoFilesArray.forEach((_, i) => inputs.push('-i', `input${i}.mp4`));
    
    const uniqueIdToStreamIndexMap = new Map<string, number>();
    uniqueVideoFilesArray.forEach((file, index) => {
        const id = `${file.name}-${file.lastModified}-${file.size}`;
        uniqueIdToStreamIndexMap.set(id, index + 1); // +1 because audio is stream 0
    });

    editDecisionList.forEach((decision, index) => {
        const originalFile = videoFiles[decision.clipIndex];
        const id = `${originalFile.name}-${originalFile.lastModified}-${originalFile.size}`;
        const videoStreamIndex = uniqueIdToStreamIndexMap.get(id)!;
        
        let streamName = `[${videoStreamIndex}:v]`;
        let trimmedStreamName = `[v${index}]`;

        if (quality === 'preview') {
            const scaledStreamName = `[scaled_v${index}]`;
            filterComplex.push(`${streamName}scale=1280:-2,trim=duration=${decision.duration},setpts=PTS-STARTPTS${scaledStreamName}`);
            trimmedStreamName = scaledStreamName;
        } else {
            filterComplex.push(`${streamName}trim=duration=${decision.duration},setpts=PTS-STARTPTS${trimmedStreamName}`);
        }
        concatInputs += trimmedStreamName;
    });
    
    filterComplex.push(`${concatInputs}concat=n=${editDecisionList.length}:v=1:a=0,format=yuv420p[outv]`);
    
    const baseCommand = [
        ...inputs,
        '-filter_complex', filterComplex.join(';'),
        '-map', '[outv]',
        '-map', '0:a',
        '-c:a', 'aac',
        '-shortest',
    ];

    const qualitySettings = quality === 'preview'
        ? ['-c:v', 'libx264', '-preset', 'fast', '-b:v', '2M']
        : ['-c:v', 'libx264', '-preset', 'medium'];

    const command = [...baseCommand, ...qualitySettings, 'output.mp4'];

    onProgress(0, `Starting ${quality} render...`);
    try {
        await ffmpeg.exec(...command);
    } catch (e) {
        console.error("FFMPEG exec error:", e);
        throw new Error(`FFMPEG failed. This can happen due to high memory usage with many or large clips. Error: ${e instanceof Error ? e.message : 'Unknown FFMPEG error'}`);
    }
    onProgress(1, 'Render complete! Preparing download...');

    const data = await ffmpeg.readFile('output.mp4');
    
    // Cleanup virtual files to free up memory
    await ffmpeg.deleteFile(audioVirtualName);
    for (const virtualName of uniqueIdToVirtualNameMap.values()) {
        await ffmpeg.deleteFile(virtualName);
    }
    await ffmpeg.deleteFile('output.mp4');

    const url = URL.createObjectURL(new Blob([(data as Uint8Array).buffer], { type: 'video/mp4' }));

    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-music-video-${quality}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    onProgress(1, 'Download started!');
};
