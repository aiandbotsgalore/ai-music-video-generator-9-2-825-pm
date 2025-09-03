
import React, { useState, useMemo } from 'react';
import type { ClipMetadata } from '../types';
import { SparklesIcon } from './icons/SparklesIcon';

interface ClipSwapViewProps {
    isOpen: boolean;
    onClose: () => void;
    onClipSelect: (clip: ClipMetadata) => void;
    clipLibrary: ClipMetadata[];
    originalClipIndex: number;
}

const motionOrder: { [key: string]: number } = { 'static': 0, 'low': 1, 'medium': 2, 'high': 3 };

// Utility to calculate a similarity score between two clips' analyses
const getSimilarityScore = (clipA: ClipMetadata, clipB: ClipMetadata): number => {
    if (!clipA.analysis || !clipB.analysis) return 0;
    
    let score = 0;
    
    // Category match is most important
    if (clipA.analysis.dominantCategory === clipB.analysis.dominantCategory) {
        score += 5;
    }
    
    // Motion level similarity
    const motionDiff = Math.abs(motionOrder[clipA.analysis.motionLevel] - motionOrder[clipB.analysis.motionLevel]);
    score += (3 - motionDiff) * 1.5; // Max score 4.5
    
    // Brightness similarity
    const brightnessDiff = Math.abs(clipA.analysis.avgBrightness - clipB.analysis.avgBrightness);
    score += (1 - brightnessDiff) * 2; // Max score 2
    
    // Complexity similarity
    const complexityDiff = Math.abs(clipA.analysis.visualComplexity - clipB.analysis.visualComplexity);
    score += (1 - complexityDiff); // Max score 1
    
    return score;
};


const ClipSwapView: React.FC<ClipSwapViewProps> = ({ isOpen, onClose, onClipSelect, clipLibrary, originalClipIndex }) => {
    const [activeTab, setActiveTab] = useState<'suggestions' | 'all'>('suggestions');

    const originalClip = clipLibrary[originalClipIndex];

    const suggestions = useMemo(() => {
        if (!originalClip) return [];
        return clipLibrary
            .filter((_, index) => index !== originalClipIndex)
            .map(clip => ({
                clip,
                score: getSimilarityScore(originalClip, clip)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 12); // Limit to top 12 suggestions
    }, [clipLibrary, originalClip, originalClipIndex]);
    
    if (!isOpen || !originalClip) return null;

    const TabButton: React.FC<{ isActive: boolean; onClick: () => void; children: React.ReactNode; }> = ({ isActive, onClick, children }) => (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${isActive ? 'bg-brand-pink text-white' : 'text-gray-300 hover:bg-gray-700'}`}
        >
            {children}
        </button>
    );
    
    const clipsToShow = activeTab === 'suggestions' ? suggestions.map(s => s.clip) : clipLibrary.filter((_, index) => index !== originalClipIndex);

    return (
        <div 
            className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl shadow-brand-purple/20"
                onClick={e => e.stopPropagation()}
            >
                <header className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-white">Swap Clip</h2>
                        <p className="text-sm text-gray-400">Replacing: <span className="font-semibold text-gray-300">{originalClip.name}</span></p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">&times;</button>
                </header>
                
                <nav className="p-3 flex items-center gap-2 border-b border-gray-700">
                    <TabButton isActive={activeTab === 'suggestions'} onClick={() => setActiveTab('suggestions')}>
                        <span className="flex items-center gap-2"><SparklesIcon className="w-4 h-4 text-brand-cyan" /> For You</span>
                    </TabButton>
                    <TabButton isActive={activeTab === 'all'} onClick={() => setActiveTab('all')}>All Clips</TabButton>
                </nav>

                <div className="p-4 overflow-y-auto">
                     {clipsToShow.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            No other clips available to swap.
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {clipsToShow.map((clip) => (
                                <div 
                                    key={clip.id}
                                    onClick={() => onClipSelect(clip)}
                                    className="relative aspect-video group cursor-pointer rounded-md overflow-hidden ring-2 ring-transparent hover:ring-brand-cyan transition-all"
                                >
                                    <img src={`data:image/jpeg;base64,${clip.thumbnail}`} alt={clip.name} className="w-full h-full object-cover"/>
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                                        <p className="text-white text-xs font-semibold truncate">{clip.name}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ClipSwapView;
