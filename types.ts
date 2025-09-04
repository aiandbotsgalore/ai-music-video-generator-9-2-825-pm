/**
 * Represents a single video segment in the final edited timeline.
 */
export interface EditDecision {
  /** The index of the clip from the `videoFiles` array to be used for this segment. */
  clipIndex: number;
  /** The duration in seconds this clip segment should play for. */
  duration: number;
  /** A brief, AI-generated description of the clip's content for this segment. */
  description: string;
}

/**
 * Represents a detected beat in the audio track.
 */
export interface Beat {
  /** The timestamp of the beat in seconds from the start of the audio. */
  timestamp: number;
  /** The confidence level of the beat detection (0 to 1). */
  confidence: number;
}

/**
 * Represents a segment of the audio with a classified energy level.
 */
export interface EnergySegment {
    /** The start time of the energy segment in seconds. */
    startTime: number;
    /** The end time of the energy segment in seconds. */
    endTime: number;
    /** The classified intensity of the audio during this segment. */
    intensity: 'low' | 'medium' | 'high';
}

/**
 * Contains the results of the audio analysis process.
 */
export interface AudioAnalysis {
    /** The total duration of the audio in seconds. */
    duration: number;
    /** The estimated beats per minute (BPM) of the audio track. */
    bpm: number;
    /** An array of detected beats. */
    beats: Beat[];
    /** An array of classified energy segments. */
    energySegments: EnergySegment[];
}

/**
 * Represents a single object detected within a video frame.
 */
export interface DetectedObject {
    /** The class or type of the detected object (e.g., 'person', 'car'). */
    class: string;
    /** The confidence score of the detection (0 to 1). */
    score: number;
}

/**
 * Contains the results of the video content analysis process.
 */
export interface VideoAnalysis {
    /** Whether human faces were detected in the video. */
    hasFaces: boolean;
    /** An array of objects detected in a sample frame. */
    detectedObjects: DetectedObject[];
    /** A high-level classification of the video's primary content. */
    dominantCategory: 'people' | 'nature' | 'urban' | 'action' | 'other';
    /** The classified level of motion in the video. */
    motionLevel: 'static' | 'low' | 'medium' | 'high';
    /** The average brightness of the video frames (0 to 1). */
    avgBrightness: number; // 0 to 1
    /** A score representing the visual complexity or detail (0 to 1). */
    visualComplexity: number; // 0 to 1
}

/**
 * Represents the AI's rationale for a specific segment in the creative timeline.
 */
export interface TimelineDecision {
    /** The start time of this timeline segment in seconds. */
    startTime: number;
    /** The end time of this timeline segment in seconds. */
    endTime: number;
    /** The index of the clip used for this segment. */
    clipIndex: number;
    /** The AI's explanation for choosing this clip at this time. */
    rationale: string;
}

/**
 * Encapsulates the AI's high-level creative strategy for the music video.
 */
export interface CreativeRationale {
    /** The overall theme or story the AI is trying to convey. */
    overallTheme: string;
    /** The strategy for pacing the edits in relation to the music. */
    pacingStrategy: string;
    /** The intended color palette or visual style. */
    colorPalette: string;
    /** A detailed, timed breakdown of the creative choices. */
    timeline: TimelineDecision[];
}


/**
 * Represents a fully generated music video project, including all assets and metadata.
 */
export interface GeneratedVideo {
  /** A unique identifier for the generated video, typically an ISO date string. */
  id: string;
  /** The audio file used for the project. */
  audioFile: File;
  /** An array of video files used in the project. */
  videoFiles: File[];
  /** The sequence of clip segments that make up the final video. */
  editDecisionList: EditDecision[];
  /** The user-provided or AI-generated description of the music's vibe. */
  musicDescription: string;
  /** The date and time the video project was created. */
  createdAt: Date;
  /** A base64 encoded string of the video's thumbnail image. */
  thumbnail: string; // base64 string
  /** The analysis results for the audio file. */
  audioAnalysis: AudioAnalysis;
  /** The AI's high-level creative strategy and timeline breakdown. */
  creativeRationale: CreativeRationale;
}

/**
 * Contains all metadata for a single video clip in the user's library.
 */
export interface ClipMetadata {
  /** A unique identifier for the clip, derived from file properties. */
  id: string;
  /** The raw video file object. */
  file: File;
  /** The name of the video file. */
  name: string;
  /** The size of the file in bytes. */
  size: number; // in bytes
  /** The duration of the video in seconds. */
  duration: number; // in seconds
  /** The resolution of the video. */
  resolution: {
    width: number;
    height: number;
  };
  /** A base64 encoded string of the clip's thumbnail image. */
  thumbnail: string; // base64 string
  /** The date and time the clip was added to the library. */
  createdAt: Date;
  /** The analysis results for the video clip, if available. */
  analysis?: VideoAnalysis;
  /** The current status of the content analysis for this clip. */
  analysisStatus: 'pending' | 'analyzing' | 'ready' | 'error';
  /** An error message if the analysis failed. */
  analysisError?: string;
}