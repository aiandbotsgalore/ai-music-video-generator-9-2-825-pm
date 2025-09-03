export interface EditDecision {
  clipIndex: number;
  duration: number;
  description: string;
}

export interface Beat {
  timestamp: number;
  confidence: number;
}

export interface EnergySegment {
    startTime: number;
    endTime: number;
    intensity: 'low' | 'medium' | 'high';
}

export interface AudioAnalysis {
    duration: number;
    bpm: number;
    beats: Beat[];
    energySegments: EnergySegment[];
}

export interface DetectedObject {
    class: string;
    score: number;
}

export interface VideoAnalysis {
    hasFaces: boolean;
    detectedObjects: DetectedObject[];
    dominantCategory: 'people' | 'nature' | 'urban' | 'action' | 'other';
    motionLevel: 'static' | 'low' | 'medium' | 'high';
    avgBrightness: number; // 0 to 1
    visualComplexity: number; // 0 to 1
}

export interface TimelineDecision {
    startTime: number;
    endTime: number;
    clipIndex: number;
    rationale: string;
}

export interface CreativeRationale {
    overallTheme: string;
    pacingStrategy: string;
    colorPalette: string;
    timeline: TimelineDecision[];
}


export interface GeneratedVideo {
  id: string;
  audioFile: File;
  videoFiles: File[];
  editDecisionList: EditDecision[];
  musicDescription: string;
  createdAt: Date;
  thumbnail: string; // base64 string
  audioAnalysis: AudioAnalysis;
  creativeRationale?: CreativeRationale;
}

export interface ClipMetadata {
  id: string;
  file: File;
  name: string;
  size: number; // in bytes
  duration: number; // in seconds
  resolution: {
    width: number;
    height: number;
  };
  thumbnail: string; // base64 string
  createdAt: Date;
  analysis?: VideoAnalysis;
  analysisStatus: 'pending' | 'analyzing' | 'ready' | 'error';
  analysisError?: string;
}