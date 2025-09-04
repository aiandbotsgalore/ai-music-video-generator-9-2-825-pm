
import React, { useMemo } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';

interface ProcessingScreenProps {
    message: string;
}

const ProcessingScreen: React.FC<ProcessingScreenProps> = ({ message }) => {
    // Use useMemo for a direct and efficient calculation of display messages from the streaming prop.
    const displayedMessages = useMemo(() => 
        message.split('\n').filter(line => line.trim() !== ''), 
        [message]
    );

    return (
        <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="relative">
                <SparklesIcon className="w-24 h-24 text-brand-cyan animate-pulse-slow" />
            </div>
            <h2 className="text-3xl font-bold mt-8 mb-4">AI Director at Work</h2>
            <p className="text-gray-400 text-lg mb-6">
                Your vision is being crafted...
            </p>

            <div className="w-full max-w-md text-left space-y-2 bg-gray-800/50 p-4 rounded-lg min-h-[100px]">
                {displayedMessages.length > 0 ? (
                    displayedMessages.map((msg, index) => (
                        <p key={index} className="text-gray-300 animate-fade-in">{msg}</p>
                    ))
                ) : (
                    <p className="text-gray-500">Awaiting instructions from the creative AI...</p>
                )}
                 <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block ml-2"></div>
            </div>
        </div>
    );
};

export default ProcessingScreen;
