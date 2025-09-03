
import React, { useState, useEffect } from 'react';
import { SparklesIcon } from './icons/SparklesIcon';
import { CheckIcon } from './icons/CheckIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { PendingIcon } from './icons/PendingIcon';

const processingSteps = [
    { name: "Analyzing Music & Clips", duration: 3 }, // in seconds
    { name: "Writing Creative Brief for AI", duration: 4 },
    { name: "Directing the Edit...", duration: 6 },
    { name: "Finalizing Sequence", duration: 2 },
];

const totalDuration = processingSteps.reduce((acc, step) => acc + step.duration, 0);

const ProcessingScreen: React.FC = () => {
    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
        const intervalId = setInterval(() => {
            setElapsedTime(prevTime => {
                // Stop the timer just before the total duration to avoid flicker
                // when the parent component unmounts this one.
                if (prevTime >= totalDuration - 1) {
                    clearInterval(intervalId);
                    return prevTime;
                }
                return prevTime + 0.1;
            });
        }, 100);

        return () => clearInterval(intervalId);
    }, []);

    // Cap progress at 99% until the parent component signals completion by unmounting.
    const progress = Math.min(elapsedTime / totalDuration, 0.99); 
    const eta = Math.max(0, Math.ceil(totalDuration - elapsedTime));

    let accumulatedTime = 0;

    return (
        <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="relative">
                <SparklesIcon className="w-24 h-24 text-brand-cyan animate-pulse-slow" />
            </div>
            <h2 className="text-3xl font-bold mt-8 mb-4">Crafting Your Masterpiece</h2>
            <p className="text-gray-400 text-lg mb-6">
                Estimated time remaining: <span className="text-white font-semibold">{eta} seconds</span>
            </p>

            <div className="w-full max-w-md bg-gray-800 rounded-full h-3 mb-8">
                <div 
                    className="bg-gradient-to-r from-brand-purple to-brand-pink h-3 rounded-full transition-all duration-500 ease-out" 
                    style={{ width: `${progress * 100}%` }}
                ></div>
            </div>

            <div className="w-full max-w-md text-left space-y-4">
                {processingSteps.map((step, index) => {
                    const stepStartTime = accumulatedTime;
                    accumulatedTime += step.duration;
                    const stepEndTime = accumulatedTime;
                    
                    let status: 'completed' | 'in_progress' | 'pending' = 'pending';
                    if (elapsedTime >= stepEndTime) {
                        status = 'completed';
                    } else if (elapsedTime >= stepStartTime) {
                        status = 'in_progress';
                    }

                    return (
                        <div key={index} className="flex items-center gap-4 transition-opacity duration-300">
                            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                                {status === 'completed' && <CheckIcon className="w-6 h-6 text-green-400" />}
                                {status === 'in_progress' && <SpinnerIcon className="w-6 h-6 text-brand-cyan" />}
                                {status === 'pending' && <PendingIcon className="w-6 h-6 text-gray-500" />}
                            </div>
                            <span className={`text-lg ${
                                status === 'completed' ? 'text-gray-400 line-through' : 
                                status === 'in_progress' ? 'text-white font-semibold' : 'text-gray-500'
                            }`}>
                                {step.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ProcessingScreen;
