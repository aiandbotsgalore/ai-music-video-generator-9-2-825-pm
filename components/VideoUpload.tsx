import React, { useState, useMemo, useEffect } from 'react';
import { UploadIcon } from './icons/UploadIcon';
import { VideoCameraIcon } from './icons/VideoCameraIcon';
import type { ClipMetadata } from '../types';
import { CheckIcon } from './icons/CheckIcon';

const AnalysisStatusBadge: React.FC<{ status: ClipMetadata['analysisStatus'] }> = ({ status }) => {
    switch (status) {
        case 'pending':
            return <div className="absolute top-1 right-1 text-xs bg-gray-500 text-white px-1.5 py-0.5 rounded-full">Queued</div>;
        case 'analyzing':
            return (
                <div className="absolute top-1 right-1 text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <div className="w-2 h-2 border border-current border-t-transparent rounded-full animate-spin"></div>
                    Analyzing
                </div>
            );
        case 'ready':
            return (
                <div className="absolute top-1 right-1 text-xs bg-green-600 text-white px-1.5 py-0.5 rounded-full flex items-center gap-1">
                    <CheckIcon className="w-3 h-3"/>
                    Ready
                </div>
            );
        case 'error':
            return <div className="absolute top-1 right-1 text-xs bg-red-600 text-white px-1.5 py-0.5 rounded-full">Error</div>;
        default:
            return null;
    }
}

interface VideoUploadProps {
  onSubmit: (files: File[]) => void;
  onBack: () => void;
  onClipsAdded: (files: File[]) => void;
  clipLibrary: ClipMetadata[];
}

const VideoUpload: React.FC<VideoUploadProps> = ({ onSubmit, onBack, onClipsAdded, clipLibrary }) => {
  const [newlyUploadedFiles, setNewlyUploadedFiles] = useState<File[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const allSelectedFiles = useMemo(() => {
    const libraryFiles = clipLibrary
        .filter(clip => selectedLibraryIds.has(clip.id))
        .map(clip => clip.file);
    const fileMap = new Map();
    [...newlyUploadedFiles, ...libraryFiles].forEach(file => {
      const uniqueId = `${file.name}-${file.lastModified}-${file.size}`;
      if(!fileMap.has(uniqueId)) {
        fileMap.set(uniqueId, file);
      }
    });
    return Array.from(fileMap.values());
  }, [newlyUploadedFiles, selectedLibraryIds, clipLibrary]);

  const atLeastOneClipReady = useMemo(() => {
    return allSelectedFiles.some(file => {
        const clipMeta = clipLibrary.find(c => c.id === `${file.name}-${file.lastModified}`);
        return clipMeta?.analysisStatus === 'ready';
    });
  }, [allSelectedFiles, clipLibrary]);

  const clipLibraryMap = useMemo(() => {
    const map = new Map<string, ClipMetadata>();
    clipLibrary.forEach(clip => map.set(clip.id, clip));
    return map;
  }, [clipLibrary]);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      const newFiles = Array.from(files).filter(file => file.type.startsWith('video/'));
      if (newFiles.length !== files.length) {
          setError('Some files were not valid video files and were ignored.');
      } else {
          setError(null);
      }
      setNewlyUploadedFiles(prev => [...prev, ...newFiles]);
      onClipsAdded(newFiles);
    }
  };

  const toggleLibrarySelection = (clipId: string) => {
    setSelectedLibraryIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(clipId)) {
            newSet.delete(clipId);
        } else {
            newSet.add(clipId);
        }
        return newSet;
    });
  };

  const removeVideo = (fileToRemove: File) => {
    const newUploadIndex = newlyUploadedFiles.findIndex(f => f === fileToRemove);
    if (newUploadIndex > -1) {
        setNewlyUploadedFiles(prev => prev.filter((_, i) => i !== newUploadIndex));
        return;
    }
    
    const clipMeta = clipLibrary.find(clip => clip.file === fileToRemove);
    if (clipMeta) {
        setSelectedLibraryIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(clipMeta.id);
            return newSet;
        });
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (allSelectedFiles.length === 0) {
        setError("Please upload or select at least one video clip.");
        return;
    }
    if (!atLeastOneClipReady) {
        setError("Please wait for at least one clip to finish analyzing before generating the video.");
        return;
    }
    onSubmit(allSelectedFiles);
  };

  return (
    <div className="flex flex-col items-center animate-fade-in">
        <div className="w-20 h-20 bg-brand-cyan/20 rounded-full flex items-center justify-center mb-4">
            <VideoCameraIcon className="w-10 h-10 text-brand-cyan" />
        </div>
        <h2 className="text-2xl font-semibold mb-2">Step 2: Add Your Visuals</h2>
        <p className="text-gray-400 mb-6 text-center">Upload new clips, or select from your library. Analysis will begin automatically.</p>
        
        <form onSubmit={handleSubmit} className="w-full space-y-6">
            <div
                onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}
                className={`relative w-full p-8 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors duration-300 ${isDragging ? 'border-brand-pink bg-brand-pink/10' : 'border-gray-600 hover:border-brand-cyan'}`}
            >
                <input type="file" accept="video/*" multiple onChange={(e) => handleFileChange(e.target.files)} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"/>
                <div className="flex flex-col items-center text-gray-400">
                    <UploadIcon className="w-12 h-12 mb-4" />
                    <p>Drag & drop new clips here, or click to select</p>
                </div>
            </div>

            {clipLibrary.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">Or Select From Your Library</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-48 overflow-y-auto p-2 bg-gray-900/50 rounded-lg">
                        {clipLibrary.map((clip) => (
                            <div 
                                key={clip.id}
                                onClick={() => toggleLibrarySelection(clip.id)}
                                className={`relative aspect-video group cursor-pointer rounded-md overflow-hidden ring-2 transition-all ${selectedLibraryIds.has(clip.id) ? 'ring-brand-cyan' : 'ring-transparent hover:ring-brand-cyan/50'}`}
                            >
                                <img src={`data:image/jpeg;base64,${clip.thumbnail}`} alt={clip.name} className="w-full h-full object-cover"/>
                                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors"></div>
                                <AnalysisStatusBadge status={clip.analysisStatus} />
                                {selectedLibraryIds.has(clip.id) && (
                                    <div className="absolute top-1 left-1 w-6 h-6 bg-brand-cyan rounded-full flex items-center justify-center text-gray-900">
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.052-.143z" clipRule="evenodd" /></svg>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {allSelectedFiles.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-300 mb-2">Selected Clips ({allSelectedFiles.length})</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-64 overflow-y-auto p-2 bg-gray-900/50 rounded-lg">
                        {allSelectedFiles.map((file, index) => {
                            const clipMeta = clipLibraryMap.get(`${file.name}-${file.lastModified}`);
                            const url = useMemo(() => URL.createObjectURL(file), [file]);
                            useEffect(() => () => URL.revokeObjectURL(url), [url]);

                            return (
                            <div 
                                key={`${file.name}-${index}`} 
                                className="relative aspect-video group rounded-md overflow-hidden"
                            >
                                <video src={url} className="w-full h-full object-cover" muted playsInline />
                                {clipMeta && <AnalysisStatusBadge status={clipMeta.analysisStatus} />}
                                <div className="absolute inset-0 bg-black/50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto flex items-center justify-center transition-opacity">
                                    <button type="button" onClick={() => removeVideo(file)} className="text-white bg-red-600 rounded-full w-8 h-8 flex items-center justify-center font-bold text-xl">&times;</button>
                                </div>
                            </div>
                        )})}
                    </div>
                </div>
            )}
            
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            
            <div className="flex flex-col sm:flex-row gap-4">
                <button type="button" onClick={onBack} className="w-full sm:w-1/3 bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300">Back</button>
                <button
                    type="submit"
                    disabled={allSelectedFiles.length === 0 || !atLeastOneClipReady}
                    title={!atLeastOneClipReady ? 'Waiting for clips to be analyzed...' : 'Generate your music video'}
                    className="w-full sm:w-2/3 bg-gradient-to-r from-brand-purple to-brand-pink hover:opacity-90 text-white font-bold py-3 px-4 rounded-lg transition-all duration-300 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transform hover:scale-105 disabled:transform-none"
                >
                    Generate My Video
                </button>
            </div>
        </form>
    </div>
  );
};

export default VideoUpload;
