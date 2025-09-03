
import React, { useState, useCallback, useEffect } from 'react';
import AudioUpload from './components/AudioUpload';
import VideoUpload from './components/VideoUpload';
import ProcessingScreen from './components/ProcessingScreen';
import PreviewPlayer from './components/PreviewPlayer';
import HistoryView from './components/HistoryView';
import ClipLibraryView from './components/ClipLibraryView';
import { getClipMetadata } from './utils/video';
import { createVideoSequence } from './services/geminiService';
import * as db from './services/dbService';
import { analyzeVideoContent } from './services/videoAnalysisService';
import type { GeneratedVideo, ClipMetadata, AudioAnalysis, VideoAnalysis, CreativeRationale } from './types';
import { LogoIcon } from './components/icons/LogoIcon';

enum AppView {
  CREATE,
  HISTORY,
  CLIP_LIBRARY,
}

enum CreateStep {
  AUDIO_UPLOAD,
  VIDEO_UPLOAD,
  PROCESSING,
  PREVIEW,
}

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.CREATE);
  const [step, setStep] = useState<CreateStep>(CreateStep.AUDIO_UPLOAD);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isProcessingClips, setIsProcessingClips] = useState(false);

  // Creation flow state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioAnalysis, setAudioAnalysis] = useState<AudioAnalysis | null>(null);
  const [musicDescription, setMusicDescription] = useState<string>('');
  const [videoFiles, setVideoFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  // App-wide state
  const [history, setHistory] = useState<GeneratedVideo[]>([]);
  const [clipLibrary, setClipLibrary] = useState<ClipMetadata[]>([]);
  const [currentPreview, setCurrentPreview] = useState<GeneratedVideo | null>(null);

  useEffect(() => {
    // On app start, load everything from the database
    const loadData = async () => {
      try {
        const [storedHistory, storedClips] = await Promise.all([
          db.getAllHistory(),
          db.getAllClips()
        ]);
        setHistory(storedHistory.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
        setClipLibrary(storedClips);
      } catch (err) {
        console.error("Failed to load data from the database:", err);
        setError("Could not load your saved data. Please ensure your browser supports IndexedDB and isn't in a private mode that blocks storage.");
      } finally {
        setIsInitialized(true);
      }
    };
    loadData();
  }, []);


  const handleAudioSubmit = (file: File, description: string, analysis: AudioAnalysis) => {
    setAudioFile(file);
    setMusicDescription(description);
    setAudioAnalysis(analysis);
    setStep(CreateStep.VIDEO_UPLOAD);
  };

  const handleClipsAdded = useCallback(async (newFiles: File[]) => {
    setIsProcessingClips(true);
    setError(null);
    const existingIds = new Set(clipLibrary.map(c => c.id));
    const trulyNewFiles = newFiles.filter(f => !existingIds.has(`${f.name}-${f.lastModified}`));
    
    if (trulyNewFiles.length > 0) {
        try {
            const newMetadatas = await Promise.all(trulyNewFiles.map(getClipMetadata));

            // Add clips to library immediately for UI responsiveness
            setClipLibrary(prevLibrary => [...prevLibrary, ...newMetadatas]);

            // Perform deep content analysis and update status along the way
            for (const metadata of newMetadatas) {
                 // Set status to 'analyzing'
                setClipLibrary(prev => prev.map(c => c.id === metadata.id ? { ...c, analysisStatus: 'analyzing' } : c));
                try {
                    const analysis: VideoAnalysis = await analyzeVideoContent(metadata.file);
                    const enrichedMetadata = { ...metadata, analysis, analysisStatus: 'ready' as const };
                    
                    // Update the clip in the state with analysis and 'ready' status
                    setClipLibrary(prev => prev.map(c => c.id === enrichedMetadata.id ? enrichedMetadata : c));
                    
                    // Add the fully analyzed clip to the DB
                    await db.addClip(enrichedMetadata);

                } catch (analysisError) {
                     console.error("Error analyzing clip:", metadata.name, analysisError);
                     const errorMessage = analysisError instanceof Error ? analysisError.message : "Unknown analysis error";
                     // Update clip with error status
                     setClipLibrary(prev => prev.map(c => c.id === metadata.id ? { ...c, analysisStatus: 'error', analysisError: errorMessage } : c));
                     await db.addClip({ ...metadata, analysisStatus: 'error', analysisError: errorMessage });
                }
            }

        } catch (err) {
            console.error("Error processing new clips:", err);
            setError(err instanceof Error ? `Clip Processing Error: ${err.message}` : "Could not process one or more of your video clips. Please ensure they are not corrupted and try again.");
        }
    }
    setIsProcessingClips(false);
  }, [clipLibrary]);

  const handleVideosSubmit = async (files: File[]) => {
    if (!audioAnalysis) {
        setError("Audio analysis data is missing. Please go back and re-upload the audio.");
        return;
    }

    const readyClipsMetadata = clipLibrary.filter(clip => 
      files.some(f => f.name === clip.file.name && f.lastModified === clip.file.lastModified) &&
      clip.analysisStatus === 'ready'
    );
    
    if (readyClipsMetadata.length === 0) {
        setError("No analyzed clips are selected. Please wait for clip analysis to complete before generating a video.");
        return;
    }

    const readyFiles = readyClipsMetadata.map(clip => clip.file);

    setVideoFiles(readyFiles);
    setStep(CreateStep.PROCESSING);
    setError(null);

    try {
      const { editDecisionList, creativeRationale } = await createVideoSequence(musicDescription, audioAnalysis, readyClipsMetadata);
      
      let thumbnail = '';
      if (readyClipsMetadata.length > 0) {
        if (editDecisionList.length > 0) {
            const firstClipIndex = editDecisionList[0].clipIndex;
            if (firstClipIndex >= 0 && firstClipIndex < readyClipsMetadata.length) {
                thumbnail = readyClipsMetadata[firstClipIndex].thumbnail;
            } else {
                thumbnail = readyClipsMetadata[0].thumbnail;
            }
        } else {
            thumbnail = readyClipsMetadata[0].thumbnail;
        }
      }

      const newVideo: GeneratedVideo = {
        id: new Date().toISOString(),
        audioFile: audioFile!,
        videoFiles: readyFiles,
        editDecisionList,
        creativeRationale,
        musicDescription,
        createdAt: new Date(),
        thumbnail: thumbnail,
        audioAnalysis: audioAnalysis,
      };
      
      await db.addHistory(newVideo);
      setHistory(prev => [newVideo, ...prev]);

      setCurrentPreview(newVideo);
      setStep(CreateStep.PREVIEW);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? `Video Generation Failed: ${err.message}` : 'An unknown error occurred during video generation. Please try again.');
      setStep(CreateStep.VIDEO_UPLOAD);
    }
  };
  
  const handleRestart = () => {
      setStep(CreateStep.AUDIO_UPLOAD);
      setCurrentPreview(null);
      setAudioFile(null);
      setMusicDescription('');
      setVideoFiles([]);
      setError(null);
      setAudioAnalysis(null);
      setView(AppView.CREATE);
  }

  const handleViewHistoryItem = (video: GeneratedVideo) => {
      setCurrentPreview(video);
      setView(AppView.CREATE);
      setStep(CreateStep.PREVIEW);
  }

  const renderCreateSteps = () => {
    switch (step) {
      case CreateStep.AUDIO_UPLOAD:
        return <AudioUpload onSubmit={handleAudioSubmit} />;
      case CreateStep.VIDEO_UPLOAD:
        return <VideoUpload onSubmit={handleVideosSubmit} onBack={() => setStep(CreateStep.AUDIO_UPLOAD)} onClipsAdded={handleClipsAdded} clipLibrary={clipLibrary} />;
      case CreateStep.PROCESSING:
        return <ProcessingScreen />;
      case CreateStep.PREVIEW:
        return currentPreview ? (
          <PreviewPlayer
            key={currentPreview.id}
            generatedVideo={currentPreview}
            onRestart={handleRestart}
            clipLibrary={clipLibrary}
          />
        ) : null;
      default:
        return <AudioUpload onSubmit={handleAudioSubmit} />;
    }
  };
  
  const renderView = () => {
      if (!isInitialized) {
        return (
             <div className="flex flex-col items-center justify-center p-8 text-center">
                <LogoIcon className="w-16 h-16 text-brand-cyan animate-pulse"/>
                <p className="mt-4 text-gray-400">Loading your creative workspace...</p>
             </div>
        )
      }
      switch(view) {
          case AppView.HISTORY:
              return <HistoryView history={history} onSelectVideo={handleViewHistoryItem} />;
          case AppView.CLIP_LIBRARY:
              return <ClipLibraryView clips={clipLibrary} onAddClips={handleClipsAdded} isProcessing={isProcessingClips}/>;
          case AppView.CREATE:
          default:
              return (
                <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl shadow-2xl shadow-brand-purple/10 border border-gray-700 p-6 md:p-10 transition-all duration-500">
                    {renderCreateSteps()}
                </div>
              );
      }
  }

  const NavButton = ({ active, onClick, children }: { active: boolean, onClick: () => void, children: React.ReactNode }) => (
    <button 
        onClick={onClick}
        className={`px-4 py-2 rounded-md font-semibold transition-colors ${active ? 'bg-brand-pink text-white' : 'bg-gray-700/50 hover:bg-gray-700 text-gray-300'}`}
    >
        {children}
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center p-4 font-sans relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900 to-brand-purple/20 z-0"></div>
      <div className="w-full max-w-4xl z-10">
        <header className="text-center mb-6">
            <div className="flex justify-center items-center gap-4 mb-4">
                <LogoIcon className="w-12 h-12 text-brand-cyan" />
                <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-pink to-brand-cyan">
                    AI Music Video Generator
                </h1>
            </div>
            <p className="text-gray-400 text-lg">Turn your sound into a visual masterpiece.</p>
        </header>

        <nav className="flex justify-center gap-2 md:gap-4 mb-6">
            <NavButton active={view === AppView.CREATE} onClick={() => { setView(AppView.CREATE); if(step === CreateStep.PREVIEW) handleRestart()}}>Create New</NavButton>
            <NavButton active={view === AppView.HISTORY} onClick={() => setView(AppView.HISTORY)}>History ({history.length})</NavButton>
            <NavButton active={view === AppView.CLIP_LIBRARY} onClick={() => setView(AppView.CLIP_LIBRARY)}>My Clips ({clipLibrary.length})</NavButton>
        </nav>

        {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg mb-6 text-center">
                <strong>Error:</strong> {error}
            </div>
        )}
        
        <main>
            {renderView()}
        </main>

        <footer className="text-center mt-8 text-gray-500">
            <p>Powered by Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;