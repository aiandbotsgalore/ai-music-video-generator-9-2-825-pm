
import React from 'react';
import type { CreativeRationale, ClipMetadata } from '../types';
import { SwapIcon } from './icons/SwapIcon';

interface DirectorsCommentaryProps {
    rationale: CreativeRationale;
    clipMetadata: ClipMetadata[];
    currentTime: number;
    onOpenSwapView: (segmentIndex: number) => void;
}

const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const DirectorsCommentary: React.FC<DirectorsCommentaryProps> = ({ rationale, clipMetadata, currentTime, onOpenSwapView }) => {

    const RationaleCard: React.FC<{title: string; content: string}> = ({ title, content}) => (
        <div className="bg-gray-800/70 p-4 rounded-lg">
            <h4 className="font-semibold text-brand-cyan mb-1">{title}</h4>
            <p className="text-gray-300 text-sm">{content}</p>
        </div>
    );

    return (
        <div className="w-full mt-4 p-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 animate-fade-in">
            <h3 className="text-2xl font-bold text-white mb-4 text-center">Director's Commentary</h3>
            
            <div className="grid md:grid-cols-3 gap-4 mb-6">
                <RationaleCard title="Overall Theme" content={rationale.overallTheme} />
                <RationaleCard title="Pacing Strategy" content={rationale.pacingStrategy} />
                <RationaleCard title="Color & Style" content={rationale.colorPalette} />
            </div>

            <h4 className="text-lg font-semibold text-white mb-3">Creative Timeline</h4>
            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                {rationale.timeline.map((decision, index) => {
                    const clip = clipMetadata[decision.clipIndex];
                    const isActive = currentTime >= decision.startTime && currentTime < decision.endTime;

                    return (
                        <div 
                            key={index} 
                            className={`flex flex-col sm:flex-row gap-4 p-3 rounded-lg border-l-4 transition-all duration-300 ${isActive ? 'bg-brand-cyan/10 border-brand-cyan' : 'bg-gray-900/50 border-gray-700'}`}
                        >
                            <div className="flex-shrink-0 sm:w-1/4">
                                <div className="flex sm:flex-col justify-between text-sm">
                                    <div className="font-bold text-white">
                                        {formatTime(decision.startTime)} - {formatTime(decision.endTime)}
                                    </div>
                                    {clip && (
                                        <div className="relative aspect-video rounded-md overflow-hidden mt-0 sm:mt-2">
                                            <img src={`data:image/jpeg;base64,${clip.thumbnail}`} alt={clip.name} className="w-full h-full object-cover"/>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex-grow">
                                {clip && <p className="font-semibold text-gray-200 truncate" title={clip.name}>Using: {clip.name}</p>}
                                <p className="text-gray-300 mt-1 text-sm">{decision.rationale}</p>
                            </div>
                             <div className="flex-shrink-0 self-center">
                                <button
                                    onClick={() => onOpenSwapView(index)}
                                    title="Swap this clip"
                                    className="flex items-center gap-2 bg-gray-700/60 hover:bg-gray-600 text-gray-300 hover:text-white px-3 py-2 rounded-md transition-colors"
                                >
                                    <SwapIcon className="w-5 h-5" />
                                    <span className="text-sm font-semibold hidden sm:inline">Swap</span>
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default DirectorsCommentary;
