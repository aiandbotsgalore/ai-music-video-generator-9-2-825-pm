
import React, { useState, useRef } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { MusicNoteIcon } from './icons/MusicNoteIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { describeMusic } from '../services/geminiService';
import { analyzeAudio } from '../services/audioAnalysisService';
import type { AudioAnalysis } from '../types';

interface AudioUploadProps {
  onSubmit: (file: File, description: string, analysis: AudioAnalysis) => void;
}

const AudioUpload: React.FC<AudioUploadProps> = ({ onSubmit }) => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [duration, setDuration] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis | null>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('audio/')) {
        setAudioFile(file);
        setAudioAnalysis(null); // Reset analysis for new file
        const url = URL.createObjectURL(file);
        if(audioRef.current) {
            audioRef.current.src = url;
        }
        setError(null);
      } else {
        setError('Please upload a valid audio file (e.g., MP3, WAV).');
        setAudioFile(null);
      }
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  };

    const handleAnalyzeVibe = async () => {
        if (!audioFile) return;
        setIsAnalyzing(true);
        setError(null);
        try {
            const generatedDescription = await describeMusic(audioFile);
            setDescription(generatedDescription);
        } catch (err) {
            setError(`AI Vibe Analysis Failed: ${err instanceof Error ? err.message : 'An unknown error occurred.'}`);
        } finally {
            setIsAnalyzing(false);
        }
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (audioFile && description.trim() && duration > 0) {
        setIsAnalyzingAudio(true);
        setError(null);
        try {
            const analysis = await analyzeAudio(audioFile);
            onSubmit(audioFile, description, analysis);
        } catch (err) {
            setError("Audio Analysis Failed: The file may be corrupted or in an unsupported format. Please try a different file.");
            setIsAnalyzingAudio(false);
        }
    } else if (!audioFile) {
        setError("Please upload an audio file.");
    } else if (!description.trim()) {
        setError("Please describe your music's vibe or use the AI to generate a description.");
    } else {
        setError("Could not read audio duration. Please try a different file.");
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
        setDuration(audioRef.current.duration);
    }
  };
  
  return (
    <div className="flex flex-col items-center animate-fade-in">
        <audio ref={audioRef} onLoadedMetadata={onLoadedMetadata} className="hidden"></audio>
        <div className="w-20 h-20 bg-brand-purple/20 rounded-full flex items-center justify-center mb-4">
            <MusicNoteIcon className="w-10 h-10 text-brand-purple" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Step 1: Upload Your Sound</h2>
        <p className="text-gray-400 mb-6 text-center">Let's start with the heart of your video - the music.</p>
        
        <form onSubmit={handleSubmit} className="w-full space-y-6">
            <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`relative w-full p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-300 ${isDragging ? 'border-brand-cyan bg-brand-cyan/10' : 'border-gray-600 hover:border-brand-purple'}`}
            >
                <input
                    type="file"
                    accept="audio/*"
                    onChange={(e) => handleFileChange(e.target.files)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    disabled={isAnalyzingAudio}
                />
                <div className="flex flex-col items-center text-gray-400">
                    <UploadIcon className="w-12 h-12 mb-4" />
                    {audioFile ? (
                        <>
                            <p className="font-semibold text-white">{audioFile.name}</p>
                            <p className="text-sm">{Math.round(duration)} seconds</p>
                        </>
                    ) : (
                        <p>Drag & drop your audio file here, or click to select</p>
                    )}
                </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            
            <div className="w-full">
                <div className="flex justify-between items-center mb-2">
                    <label htmlFor="description" className="block text-lg font-medium text-gray-300">Describe the Vibe</label>
                     <button
                        type="button"
                        onClick={handleAnalyzeVibe}
                        disabled={!audioFile || isAnalyzing || isAnalyzingAudio}
                        className="flex items-center gap-2 px-3 py-1 bg-brand-cyan/20 text-brand-cyan rounded-md text-sm font-semibold transition-colors hover:bg-brand-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isAnalyzing ? (
                            <>
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                Analyzing...
                            </>
                        ) : (
                            <>
                                <SparklesIcon className="w-4 h-4" />
                                Generate with AI
                            </>
                        )}
                    </button>
                </div>
                <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Energetic hyper-pop with a fast beat, perfect for quick cuts and flashy visuals."
                    rows={3}
                    className="w-full bg-gray-700/50 border border-gray-600 rounded-lg p-3 focus:ring-2 focus:ring-brand-pink focus:border-brand-pink outline-none transition-all disabled:bg-gray-800 disabled:cursor-wait"
                    disabled={isAnalyzing || isAnalyzingAudio}
                />
            </div>

            <button
                type="submit"
                disabled={!audioFile || !description.trim() || isAnalyzingAudio}
                className="w-full bg-brand-purple hover:bg-brand-pink text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:bg-gray-600 disabled:cursor-not-allowed transform hover:scale-105 disabled:transform-none flex items-center justify-center gap-2"
            >
                 {isAnalyzingAudio && <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>}
                {isAnalyzingAudio ? 'Analyzing Audio...' : 'Next: Add Visuals'}
            </button>
        </form>
    </div>
  );
};

export default AudioUpload;
