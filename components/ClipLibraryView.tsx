
import React, { useState, useMemo } from 'react';
import type { ClipMetadata } from '../types';
import { UploadIcon } from './icons/UploadIcon';
import { SparklesIcon } from './icons/SparklesIcon';

interface ClipLibraryViewProps {
    clips: ClipMetadata[];
    onAddClips: (files: File[]) => void;
    isProcessing: boolean;
    onCancelAnalysis: (clipId: string) => void;
    onRetryAnalysis: (clipId: string) => void;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const sortOptions = [
    { value: 'createdAt-desc', label: 'Date Added (Newest)' },
    { value: 'createdAt-asc', label: 'Date Added (Oldest)' },
    { value: 'duration-desc', label: 'Duration (Longest)' },
    { value: 'duration-asc', label: 'Duration (Shortest)' },
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'resolution-desc', label: 'Resolution (Highest)' },
    { value: 'resolution-asc', label: 'Resolution (Lowest)' },
    { value: 'motionLevel-desc', label: 'Motion (High to Low)' },
    { value: 'motionLevel-asc', label: 'Motion (Low to High)' },
    { value: 'visualComplexity-desc', label: 'Complexity (Highest)' },
    { value: 'visualComplexity-asc', label: 'Complexity (Lowest)' },
    { value: 'avgBrightness-desc', label: 'Brightness (Brightest)' },
    { value: 'avgBrightness-asc', label: 'Brightness (Darkest)' },
    { value: 'size-desc', label: 'File Size (Largest)' },
    { value: 'size-asc', label: 'File Size (Smallest)' },
];


const ClipCard: React.FC<{clip: ClipMetadata; onCancel: (id: string) => void; onRetry: (id: string) => void;}> = ({ clip, onCancel, onRetry }) => (
    <div className="bg-gray-800 rounded-lg overflow-hidden group">
        <div className="relative aspect-video bg-gray-900">
            <img src={`data:image/jpeg;base64,${clip.thumbnail}`} alt={clip.name} className="w-full h-full object-cover"/>
            <div 
                className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-2 text-center transition-opacity opacity-0 group-hover:opacity-100"
                title={clip.analysisStatus === 'error' ? clip.analysisError : ""}
            >
                {(clip.analysisStatus === 'analyzing' || clip.analysisStatus === 'pending') && (
                    <button onClick={() => onCancel(clip.id)} className="px-3 py-1.5 bg-red-600/80 text-white rounded-md text-sm font-semibold hover:bg-red-500">
                        Cancel
                    </button>
                )}
                 {clip.analysisStatus === 'error' && (
                    <button onClick={() => onRetry(clip.id)} className="px-3 py-1.5 bg-blue-600/80 text-white rounded-md text-sm font-semibold hover:bg-blue-500">
                        Retry
                    </button>
                )}
            </div>
             {clip.analysisStatus !== 'ready' && (
                <div 
                    className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center p-2 text-center pointer-events-none group-hover:opacity-0"
                    title={clip.analysisStatus === 'error' ? clip.analysisError : "Analysis in progress..."}
                >
                    {clip.analysisStatus === 'analyzing' && (
                        <>
                            <div className="w-6 h-6 border-2 border-brand-cyan/50 border-t-brand-cyan rounded-full animate-spin"></div>
                            <p className="text-xs text-brand-cyan mt-2">Analyzing...</p>
                        </>
                    )}
                     {clip.analysisStatus === 'pending' && (
                        <p className="text-xs text-gray-300">Queued for analysis...</p>
                    )}
                    {clip.analysisStatus === 'error' && (
                        <>
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                           </svg>
                           <p className="text-xs text-red-300 mt-2">Analysis Failed</p>
                        </>
                    )}
                </div>
            )}
        </div>
        <div className="p-3">
            <p className="text-white text-sm font-medium truncate" title={clip.name}>{clip.name}</p>
            <div className="text-xs text-gray-400 mt-2 flex justify-between items-center flex-wrap gap-x-2 gap-y-1">
                <span>{formatDuration(clip.duration)}</span>
                <span>{clip.resolution.width}x{clip.resolution.height}</span>
                <span>{formatBytes(clip.size)}</span>
            </div>
             {clip.analysis && (
                <div className="mt-2 pt-2 border-t border-gray-700/50">
                    <div className="text-xs text-gray-300 grid grid-cols-3 gap-1 text-center">
                        <div>
                            <p className="font-semibold capitalize">{clip.analysis.motionLevel}</p>
                            <p className="text-gray-500">Motion</p>
                        </div>
                         <div>
                            <p className="font-semibold">{Math.round(clip.analysis.visualComplexity * 100)}%</p>
                            <p className="text-gray-500">Complexity</p>
                        </div>
                         <div>
                            <p className="font-semibold">{Math.round(clip.analysis.avgBrightness * 100)}%</p>
                            <p className="text-gray-500">Brightness</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    </div>
)

const ClipLibraryView: React.FC<ClipLibraryViewProps> = ({ clips, onAddClips, isProcessing, onCancelAnalysis, onRetryAnalysis }) => {
    const [isDragging, setIsDragging] = useState(false);
    const [sortBy, setSortBy] = useState(sortOptions[0].value);

    const sortedClips = useMemo(() => {
        const [key, direction] = sortBy.split('-');
        
        const motionOrder: { [key: string]: number } = { 'static': 0, 'low': 1, 'medium': 2, 'high': 3 };

        const sorted = [...clips].sort((a, b) => {
            const analysisA = a.analysis;
            const analysisB = b.analysis;

            switch(key) {
                case 'createdAt':
                    return a.createdAt.getTime() - b.createdAt.getTime();
                case 'duration':
                    return a.duration - b.duration;
                case 'resolution':
                    const resA = a.resolution.width * a.resolution.height;
                    const resB = b.resolution.width * b.resolution.height;
                    return resA - resB;
                case 'name':
                    return a.name.localeCompare(b.name);
                case 'size':
                    return a.size - b.size;
                case 'motionLevel':
                    const motionA = motionOrder[analysisA?.motionLevel || 'static'];
                    const motionB = motionOrder[analysisB?.motionLevel || 'static'];
                    return motionA - motionB;
                case 'visualComplexity':
                    return (analysisA?.visualComplexity || 0) - (analysisB?.visualComplexity || 0);
                case 'avgBrightness':
                    return (analysisA?.avgBrightness || 0) - (analysisB?.avgBrightness || 0);
                default:
                    return 0;
            }
        });

        if (direction === 'desc') {
            return sorted.reverse();
        }
        return sorted;

    }, [clips, sortBy]);

    const handleFileChange = (files: FileList | null) => {
        if (files && files.length > 0) {
            onAddClips(Array.from(files));
        }
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault(); e.stopPropagation(); setIsDragging(false);
      handleFileChange(e.dataTransfer.files);
    };

    if (clips.length === 0 && !isProcessing) {
        return (
            <div className="text-center py-16 px-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-2">Your Clip Library is Empty</h2>
                <p className="text-gray-400 mb-6">Upload some video files to get started!</p>
                 <div
                    onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
                    className={`relative max-w-lg mx-auto p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-300 ${isDragging ? 'border-brand-pink bg-brand-pink/10' : 'border-gray-600 hover:border-brand-cyan'}`}
                 >
                    <input type="file" accept="video/*" multiple onChange={(e) => handleFileChange(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                    <div className="flex flex-col items-center text-gray-400">
                        <UploadIcon className="w-12 h-12 mb-4" />
                        <p>Drag & drop videos here, or click to upload</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
                <h2 className="text-2xl font-bold text-white">My Clips ({clips.length})</h2>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="sort-clips" className="text-gray-400 font-medium">Sort by:</label>
                        <div className="relative">
                            <select 
                                id="sort-clips"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="appearance-none bg-gray-700/50 border border-gray-600 rounded-md py-2 pl-3 pr-8 text-white focus:ring-2 focus:ring-brand-pink focus:border-brand-pink outline-none"
                            >
                               {sortOptions.map(option => (
                                   <option key={option.value} value={option.value}>{option.label}</option>
                               ))}
                            </select>
                             <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                            </div>
                        </div>
                    </div>
                    <div className="relative">
                        <button className="w-full sm:w-auto bg-brand-cyan text-gray-900 font-bold py-2 px-4 rounded-lg transition-all hover:opacity-90">
                            Add More Clips
                        </button>
                        <input type="file" accept="video/*" multiple onChange={(e) => handleFileChange(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                    </div>
                </div>
            </div>

            {(isProcessing) && (
                 <div className="flex items-center justify-center gap-2 text-brand-cyan p-4 border border-brand-cyan/20 bg-brand-cyan/10 rounded-lg mb-4">
                    <SparklesIcon className="w-5 h-5 animate-pulse" />
                    <span>Processing new clips...</span>
                 </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-h-[60vh] overflow-y-auto p-1">
                {sortedClips.map(clip => <ClipCard key={clip.id} clip={clip} onCancel={onCancelAnalysis} onRetry={onRetryAnalysis} />)}
            </div>
        </div>
    );
};

export default ClipLibraryView;
