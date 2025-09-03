import type { ClipMetadata } from '../types';

/**
 * Extracts a frame from a video file at a specific time.
 * @param file The video file.
 * @param time The time in seconds to capture the frame.
 * @returns A Promise that resolves with the frame as a base64 JPEG string.
 */
export const extractFrame = (file: File, time: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      return reject(new Error('Could not get canvas context.'));
    }

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(Math.max(0, time), video.duration);
    };

    video.onseeked = () => {
      // Set canvas dimensions
      const aspectRatio = video.videoWidth / video.videoHeight;
      const maxWidth = 512;
      canvas.width = maxWidth;
      canvas.height = maxWidth / aspectRatio;
      
      // Draw the video frame to the canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Get base64 representation
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      
      // Clean up
      URL.revokeObjectURL(video.src);
      
      resolve(base64);
    };
    
    video.onerror = (e) => {
      reject(new Error(`Failed to load video: ${e}`));
    };
    
    video.src = URL.createObjectURL(file);
    video.load();
  });
};


/**
 * Extracts comprehensive metadata from a video file.
 * @param file The video file.
 * @returns A Promise that resolves with a ClipMetadata object.
 */
export const getClipMetadata = (file: File): Promise<ClipMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = async () => {
      const videoSrc = video.src; // Keep a reference to the src
      try {
        const thumbnail = await extractFrame(file, 0.1); // Get thumbnail from near the start
        
        const metadata: ClipMetadata = {
          id: `${file.name}-${file.lastModified}-${file.size}`, // A robust unique ID
          file: file,
          name: file.name,
          size: file.size,
          duration: video.duration,
          resolution: {
            width: video.videoWidth,
            height: video.videoHeight,
          },
          thumbnail,
          createdAt: new Date(),
          analysisStatus: 'pending',
        };
        resolve(metadata);
      } catch (err) {
        reject(err);
      } finally {
        URL.revokeObjectURL(videoSrc); // Clean up the object URL in all cases
      }
    };
    
    video.onerror = (e) => {
      URL.revokeObjectURL(video.src);
      reject(new Error(`Failed to load video metadata for ${file.name}. It might be a corrupted file.`));
    };
    
    video.src = URL.createObjectURL(file);
  });
};
