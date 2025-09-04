import type { ClipMetadata } from '../types';

/**
 * Extracts comprehensive metadata from a video file efficiently.
 * This function loads the video metadata once, then seeks to capture a thumbnail.
 * @param file The video file.
 * @returns A Promise that resolves with a ClipMetadata object.
 */
export const getClipMetadata = (file: File): Promise<ClipMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const videoUrl = URL.createObjectURL(file);
    video.src = videoUrl;

    const cleanup = () => {
        URL.revokeObjectURL(videoUrl);
    };

    video.onloadedmetadata = () => {
        // First, grab the metadata that's available now
        const duration = video.duration;
        const width = video.videoWidth;
        const height = video.videoHeight;
        
        // Now, seek to a point to grab the thumbnail
        video.currentTime = 0.1; // Seek to a very early frame

        video.onseeked = () => {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            if (!context) {
                cleanup();
                return reject(new Error('Could not get canvas context.'));
            }

            const aspectRatio = width / height;
            const maxWidth = 512;
            canvas.width = maxWidth;
            canvas.height = maxWidth / aspectRatio;

            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const thumbnail = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            
            if (!thumbnail) {
                cleanup();
                return reject(new Error(`Failed to generate thumbnail for ${file.name}.`));
            }

            const metadata: ClipMetadata = {
                id: `${file.name}-${file.lastModified}-${file.size}`,
                file: file,
                name: file.name,
                size: file.size,
                duration,
                resolution: { width, height },
                thumbnail,
                createdAt: new Date(),
                analysisStatus: 'pending',
            };
            
            cleanup();
            resolve(metadata);
        };
        
        video.onerror = (e) => {
            cleanup();
            reject(new Error(`Failed during seek for ${file.name}: ${e}`));
        };
    };
    
    video.onerror = (e) => {
      cleanup();
      reject(new Error(`Failed to load video metadata for ${file.name}. It might be a corrupted file.`));
    };
  });
};