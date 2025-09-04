
import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { GeneratedVideo, ClipMetadata, EditDecision } from '../types';
import { exportVideo } from '../services/videoExportService';
import { PlayIcon } from './icons/PlayIcon';
import { PauseIcon } from './icons/PauseIcon';
import { ReplayIcon } from './icons/ReplayIcon';
import { VolumeUpIcon } from './icons/VolumeUpIcon';
import { VolumeOffIcon } from './icons/VolumeOffIcon';
import { CommentaryIcon } from './icons/CommentaryIcon';
import DirectorsCommentary from './DirectorsCommentary';
import ClipSwapView from './ClipSwapView';


interface PreviewPlayerProps {
  generatedVideo: GeneratedVideo;
  onRestart: () => void;
  clipLibrary: ClipMetadata[];
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PreviewPlayer: React.FC<PreviewPlayerProps> = ({ generatedVideo, onRestart, clipLibrary }) => {
  const { audioFile, videoFiles, creativeRationale } = generatedVideo;
  
  // Local state for the editable video sequence
  const [localEditList, setLocalEditList] = useState<EditDecision[]>(generatedVideo.editDecisionList);
  const [swapState, setSwapState] = useState<{ open: boolean, segmentIndex: number | null }>({ open: false, segmentIndex: null });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderMessage, setRenderMessage] = useState('');
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [activeClipDescription, setActiveClipDescription] = useState('Video Preview');
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(-1);
  const [showCommentary, setShowCommentary] = useState(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentClipIndexRef = useRef<number | null>(null);
  const pendingSwitchRef = useRef<number>(0); // generation id to cancel stale switches

  const audioUrl = useMemo(() => URL.createObjectURL(audioFile), [audioFile]);
  const videoUrls = useMemo(() => videoFiles.map(file => URL.createObjectURL(file)), [videoFiles]);

  const clipSegments = useMemo(() => {
    let accumulatedTime = 0;
    return localEditList.map(decision => {
        const startTime = accumulatedTime;
        accumulatedTime += decision.duration;
        return { ...decision, startTime, endTime: accumulatedTime };
    });
  }, [localEditList]);

  const videoClipMetadata = useMemo(() => {
      const fileToMetaMap = new Map<string, ClipMetadata>();
      clipLibrary.forEach(clip => fileToMetaMap.set(`${clip.file.name}-${clip.file.lastModified}-${clip.file.size}`, clip));
      
      return generatedVideo.videoFiles.map(file => 
          fileToMetaMap.get(`${file.name}-${file.lastModified}-${file.size}`)
      ).filter((c): c is ClipMetadata => c !== undefined);
  }, [generatedVideo, clipLibrary]);
  
  useEffect(() => {
    return () => {
        URL.revokeObjectURL(audioUrl);
        videoUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [audioUrl, videoUrls]);

  useEffect(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio || !video) return;

    const handleLoadedMetadata = () => {
        if (!isNaN(audio.duration)) {
           setDuration(audio.duration);
        }
    };
    
    const onPlay = () => { video.play().catch(e => console.error("Video play failed:", e)); setIsPlaying(true); };
    const onPause = () => { video.pause(); setIsPlaying(false); };
    const onEnded = () => { video.pause(); setIsPlaying(false); setIsFinished(true); };
    
    const syncVideo = (time: number) => {
        const currentSegment = clipSegments.find(
            (segment) => time >= segment.startTime && time < segment.endTime
        );

        const segmentIndex = currentSegment ? clipSegments.indexOf(currentSegment) : -1;
        setActiveSegmentIndex(segmentIndex);

        if (currentSegment) {
            setActiveClipDescription(`Clip ${currentSegment.clipIndex + 1}: "${currentSegment.description}"`);
            const clipFileIndex = currentSegment.clipIndex;

            // Safe seek function to prevent errors by clamping the time
            const safeSeek = (targetTime: number) => {
                if (!isNaN(video.duration)) {
                    try {
                        video.currentTime = Math.max(0, Math.min(targetTime, video.duration - 0.05));
                    } catch (e) {
                        // Ignore seek errors, they might happen during rapid source changes
                    }
                }
            };

            // If the clip index hasn't changed, just ensure time sync
            if (clipFileIndex === currentClipIndexRef.current) {
                const timeInClip = time - currentSegment.startTime;
                if (!isNaN(video.duration) && Math.abs(video.currentTime - timeInClip) > 0.25) {
                    safeSeek(timeInClip);
                }
                return;
            }

            // If we need to switch the video source:
            if (clipFileIndex >= 0 && clipFileIndex < videoUrls.length) {
                const newSrc = videoUrls[clipFileIndex];
                // Avoid re-assigning the same src
                if (video.src !== newSrc) {
                    const switchGeneration = ++pendingSwitchRef.current;

                    // Set the new source, then wait for loadedmetadata to set time
                    video.pause();
                    video.src = newSrc;
                    currentClipIndexRef.current = clipFileIndex;

                    const onLoadedMeta = () => {
                        // If another switch happened since we initiated this one, abort
                        if (switchGeneration !== pendingSwitchRef.current) {
                            return;
                        }
                        const timeInClip = time - currentSegment.startTime;
                        safeSeek(timeInClip);
                        
                        // If audio is playing, try to resume video playback
                        if (!audio.paused) {
                            video.play().catch(() => { /* swallow play errors */ });
                        }
                    };

                    video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
                } else {
                    // same src but currentClipIndexRef mismatch — ensure seek
                    const timeInClip = time - currentSegment.startTime;
                    if (Math.abs(video.currentTime - timeInClip) > 0.25) {
                        safeSeek(timeInClip);
                    }
                    currentClipIndexRef.current = clipFileIndex;
                }
            }
        } else {
            // no current segment — we could pause the video
            currentClipIndexRef.current = null;
        }
    };
    
    const handleTimeUpdate = () => {
        const now = audio.currentTime;
        setCurrentTime(now);
        syncVideo(now);
    };

    const onSeeking = () => syncVideo(audio.currentTime);

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("seeking", onSeeking);

    if (audio.readyState >= 1) handleLoadedMetadata();
    syncVideo(audio.currentTime);
    
    return () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("pause", onPause);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("seeking", onSeeking);
        // remove any pending load listeners on the video
        try {
          if (video) {
              video.removeAttribute('src');
              video.load();
          }
        } catch (e) {}
    };
  }, [clipSegments, videoUrls]);
  
  useEffect(() => {
      if (audioRef.current) {
          audioRef.current.volume = isMuted ? 0 : volume;
      }
  }, [volume, isMuted]);

  const handlePlayPause = () => {
    if (isFinished) {
      if(audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play();
          setIsFinished(false);
      }
    } else {
        if (isPlaying) {
            audioRef.current?.pause();
        } else {
            audioRef.current?.play();
        }
    }
  };

  const handleDownload = async (quality: 'full' | 'preview') => {
      setIsRendering(true);
      setRenderProgress(0);
      setRenderMessage(quality === 'preview' ? "Starting preview export..." : "Starting full quality export...");
      try {
          const finalVideo: GeneratedVideo = {
              ...generatedVideo,
              editDecisionList: localEditList,
          };
          await exportVideo(finalVideo, (progress, message) => {
              setRenderProgress(progress);
              setRenderMessage(message);
          }, quality);
      } catch (err) {
          console.error("Failed to export video:", err);
          const friendlyMessage = err instanceof Error && err.message.toLowerCase().includes("memory")
            ? "Export failed due to high memory usage. Please try the 'Download Preview' option."
            : `Export Failed: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`;
          setRenderMessage(friendlyMessage);
          setTimeout(() => setIsRendering(false), 5000);
          return;
      }
      // Keep render message on screen briefly after completion
      setRenderMessage("Export complete! Download starting...");
      setTimeout(() => setIsRendering(false), 3000);
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration === 0) return;
    const timeline = e.currentTarget;
    const rect = timeline.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    audioRef.current.currentTime = percentage * duration;
  };
  
  const handleOpenSwapView = (segmentIndex: number) => {
      setSwapState({ open: true, segmentIndex: segmentIndex });
  };
  
  const handleClipSwap = (newClip: ClipMetadata) => {
      if (swapState.segmentIndex === null) return;
      
      const newClipFileIndex = generatedVideo.videoFiles.findIndex(f => 
          f.name === newClip.file.name && f.lastModified === newClip.file.lastModified && f.size === newClip.file.size
      );
      
      if (newClipFileIndex === -1) {
          console.error("Swapped clip file not found in original video files array.");
          return;
      }
      
      setLocalEditList(prevList => {
          const newList = [...prevList];
          const segmentToUpdate = newList[swapState.segmentIndex!];
          newList[swapState.segmentIndex!] = {
              ...segmentToUpdate,
              clipIndex: newClipFileIndex,
          };
          return newList;
      });
      
      setSwapState({ open: false, segmentIndex: null });
  };

  return (
    <div className="w-full flex flex-col items-center animate-fade-in">
        <h2 className="text-3xl font-bold mb-4">Your Vision, Realized</h2>
        <p className="text-gray-400 mb-6 text-center">Press play to watch, or act as the director and swap clips in the commentary below.</p>
        
        {swapState.open && swapState.segmentIndex !== null && (
            <ClipSwapView 
                isOpen={swapState.open}
                onClose={() => setSwapState({ open: false, segmentIndex: null })}
                onClipSelect={handleClipSwap}
                clipLibrary={videoClipMetadata}
                originalClipIndex={localEditList[swapState.segmentIndex].clipIndex}
            />
        )}

        <div className="w-full aspect-video bg-black rounded-lg overflow-hidden relative shadow-lg shadow-brand-cyan/20 group">
            <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
            />
             <audio ref={audioRef} src={audioUrl}></audio>
             {isRendering && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 transition-opacity">
                    <h3 className="text-2xl font-bold text-white mb-4">{renderMessage}</h3>
                    <div className="w-3/4 bg-gray-600 rounded-full h-4">
                        <div className="bg-brand-cyan h-4 rounded-full transition-all duration-500" style={{width: `${renderProgress * 100}%`}}></div>
                    </div>
                    <p className="mt-2 text-brand-cyan">{Math.round(renderProgress * 100)}% complete</p>
                </div>
             )}
             <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
                <p className="font-semibold text-white truncate" title={activeClipDescription}>
                    {activeClipDescription}
                </p>
             </div>
             <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-100 group-hover:opacity-100 transition-opacity z-10">
                <button
                    onClick={handlePlayPause}
                    className="w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white transform transition-transform hover:scale-110"
                    aria-label={isPlaying ? "Pause" : "Play"}
                >
                    {isFinished ? <ReplayIcon className="w-10 h-10" /> : (isPlaying ? <PauseIcon className="w-10 h-10" /> : <PlayIcon className="w-10 h-10 ml-1" />)}
                </button>
             </div>
        </div>
        <div className="w-full mt-4 flex items-center gap-4 px-1">
            <div className="text-sm text-gray-400">{formatTime(currentTime)}</div>
            <div onClick={handleSeek} className="relative flex-grow h-2 bg-gray-700 rounded-full group cursor-pointer">
                <div className="absolute h-full bg-brand-pink rounded-full" style={{width: `${(currentTime / duration) * 100}%`}}></div>
                <div className="absolute h-full w-full flex">
                    {clipSegments.map((clip, index) => (
                         <div key={index} className={`h-full border-r-2 border-gray-900/50 ${activeSegmentIndex === index ? 'bg-brand-cyan/50' : 'bg-transparent'}`} style={{width: `${(clip.duration / duration) * 100}%`}}></div>
                    ))}
                </div>
            </div>
            <div className="text-sm text-gray-400">{formatTime(duration)}</div>
            <div className="flex items-center gap-2">
                <button onClick={() => setIsMuted(!isMuted)} aria-label={isMuted ? "Unmute" : "Mute"}>
                    {isMuted || volume === 0 ? <VolumeOffIcon className="w-6 h-6 text-gray-400" /> : <VolumeUpIcon className="w-6 h-6 text-gray-400" />}
                </button>
                <input 
                    type="range" 
                    min="0" max="1" step="0.05" 
                    value={isMuted ? 0 : volume}
                    onChange={(e) => {
                        setVolume(parseFloat(e.target.value));
                        if(isMuted) setIsMuted(false);
                    }}
                    className="w-20 h-1 accent-brand-cyan"
                />
            </div>
        </div>

        <div className="mt-6 w-full">
            <button
                onClick={() => setShowCommentary(!showCommentary)}
                className="w-full flex items-center justify-center gap-2 bg-gray-700/50 hover:bg-gray-700 text-gray-200 font-semibold py-2 px-4 rounded-lg transition-colors"
            >
                <CommentaryIcon className="w-5 h-5" />
                {showCommentary ? "Hide" : "Show"} Director's Commentary
            </button>
        </div>

        {showCommentary && (
            <DirectorsCommentary
                rationale={creativeRationale}
                clipMetadata={videoClipMetadata}
                currentTime={currentTime}
                onOpenSwapView={handleOpenSwapView}
            />
        )}
        
        <div className="mt-8 w-full max-w-lg space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
                 <button
                    onClick={() => handleDownload('preview')}
                    disabled={isRendering}
                    className="w-full sm:w-1/2 bg-brand-cyan/20 hover:bg-brand-cyan/30 text-brand-cyan font-bold py-3 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isRendering ? 'Rendering...' : 'Download Preview (Faster)'}
                </button>
                 <button
                    onClick={() => handleDownload('full')}
                    disabled={isRendering}
                    className="w-full sm:w-1/2 bg-brand-cyan text-gray-900 font-bold py-3 px-4 rounded-lg transition-all disabled:bg-brand-cyan/50 disabled:cursor-not-allowed"
                >
                    {isRendering ? 'Rendering...' : 'Download Full Quality'}
                </button>
            </div>
            <button
                onClick={onRestart}
                className="w-full bg-gray-600 hover:bg-gray-500 text-white font-bold py-3 px-4 rounded-lg transition-all"
            >
                Create New Video
            </button>
        </div>
    </div>
  );
};

export default PreviewPlayer;
