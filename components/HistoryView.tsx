import React, { useState, useMemo } from 'react';
import type { GeneratedVideo } from '../types';

interface HistoryViewProps {
    history: GeneratedVideo[];
    onSelectVideo: (video: GeneratedVideo) => void;
}

const sortOptions = [
    { value: 'createdAt-desc', label: 'Date Created (Newest)' },
    { value: 'createdAt-asc', label: 'Date Created (Oldest)' },
];

const HistoryView: React.FC<HistoryViewProps> = ({ history, onSelectVideo }) => {
    const [sortBy, setSortBy] = useState(sortOptions[0].value);

    const sortedHistory = useMemo(() => {
        const [key, direction] = sortBy.split('-');
        
        const sorted = [...history].sort((a, b) => {
            if (key === 'createdAt') {
                return a.createdAt.getTime() - b.createdAt.getTime();
            }
            return 0;
        });

        if (direction === 'desc') {
            return sorted.reverse();
        }
        return sorted;

    }, [history, sortBy]);

    if (history.length === 0) {
        return (
            <div className="text-center py-16 px-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700">
                <h2 className="text-2xl font-bold text-white mb-2">Your Creative History is Empty</h2>
                <p className="text-gray-400">Go ahead and create your first music video! It will appear here.</p>
            </div>
        );
    }
    return (
        <div className="animate-fade-in">
            <div className="flex justify-end mb-4">
                <div className="flex items-center gap-2">
                    <label htmlFor="sort-history" className="text-gray-400 font-medium">Sort by:</label>
                    <div className="relative">
                        <select 
                            id="sort-history"
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
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {sortedHistory.map(video => (
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
        </div>
    );
};

export default HistoryView;