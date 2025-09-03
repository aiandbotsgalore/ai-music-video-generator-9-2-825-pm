import React from 'react';
import type { GeneratedVideo } from '../types';

interface HistoryViewProps {
    history: GeneratedVideo[];
    onSelectVideo: (video: GeneratedVideo) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ history, onSelectVideo }) => {
    if (history.length === 0) {
        return (
            <div className="text-center py-16 px-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-2">Your Creative History is Empty</h2>
                <p className="text-gray-400">Go ahead and create your first music video! It will appear here.</p>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in">
            {history.map(video => (
                <div 
                    key={video.id}
                    onClick={() => onSelectVideo(video)}
                    className="bg-gray-800 rounded-lg overflow-hidden group cursor-pointer transition-all transform hover:scale-105 hover:shadow-2xl hover:shadow-brand-pink/20"
                >
                    <div className="relative aspect-video">
                        <img src={`data:image/jpeg;base64,${video.thumbnail}`} alt="Video thumbnail" className="w-full h-full object-cover"/>
                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors"></div>
                    </div>
                    <div className="p-4">
                        <p className="text-sm text-gray-400">{video.createdAt.toLocaleDateString()}</p>
                        <h3 className="font-semibold text-white truncate mt-1" title={video.musicDescription}>
                            {video.musicDescription}
                        </h3>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default HistoryView;