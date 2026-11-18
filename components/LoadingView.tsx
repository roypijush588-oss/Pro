
import React, { useState, useEffect } from 'react';
import { CheckCircleIcon, LightBulbIcon } from './icons';

interface LoadingViewProps {
  progress: number;
  stage: string;
}

const tips = [
  "The 'Ebbinghaus Forgetting Curve' shows we forget information over time unless we review it. Use flashcards to combat this!",
  "Teaching a concept to someone else is a powerful way to solidify your own understanding. Try explaining a topic to a friend.",
  "The 'Pomodoro Technique' can boost focus: work for 25 minutes, then take a 5-minute break.",
  "Connecting new information to what you already know creates stronger neural pathways, making it easier to remember.",
  "A good night's sleep is crucial for memory consolidation. Your brain processes and stores information while you rest.",
  "The human brain has about 86 billion neurons, each connected to thousands of others.",
];

const LoadingView: React.FC<LoadingViewProps> = ({ progress, stage }) => {
  const [currentTip, setCurrentTip] = useState(tips[0]);

  useEffect(() => {
    const tipInterval = setInterval(() => {
      setCurrentTip(prevTip => {
        const currentIndex = tips.indexOf(prevTip);
        const nextIndex = (currentIndex + 1) % tips.length;
        return tips[nextIndex];
      });
    }, 4000); // Change tip every 4 seconds

    return () => clearInterval(tipInterval);
  }, []);

  const loadingStages = ['Analyzing Content', 'Generating Summary', 'Building Questions', 'Finalizing'];
  const currentStageIndex = loadingStages.indexOf(stage) >= 0 ? loadingStages.indexOf(stage) : (progress === 100 ? loadingStages.length : -1);

  return (
    <div className="p-8 text-center space-y-8 animate-in fade-in duration-500">
      <h2 className="text-2xl font-bold text-gray-200">EduScan AI is thinking...</h2>
      
      {/* Progress Bar */}
      <div className="w-full bg-gray-700 rounded-full h-4">
        <div 
          className="bg-gradient-to-r from-purple-500 to-indigo-500 h-4 rounded-full transition-all duration-500 ease-out" 
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      <p className="font-mono text-indigo-300 text-lg">{stage}</p>

      {/* Stage List */}
      <div className="flex justify-between items-center text-xs text-gray-400 max-w-md mx-auto">
        {loadingStages.map((s, index) => (
          <div key={s} className="flex flex-col items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                index < currentStageIndex ? 'bg-green-500/20 border-green-500' : 
                index === currentStageIndex ? 'border-indigo-500' : 
                'border-gray-600'
            }`}>
              {index < currentStageIndex ? (
                <CheckCircleIcon className="w-5 h-5 text-green-400"/>
              ) : index === currentStageIndex ? (
                <div className="w-4 h-4 rounded-full bg-indigo-500 animate-pulse"></div>
              ) : (
                <div className="w-2 h-2 rounded-full bg-gray-600"></div>
              )}
            </div>
            <span className={index <= currentStageIndex ? 'text-gray-200 font-semibold' : 'text-gray-500'}>{s}</span>
          </div>
        ))}
      </div>
      
      {/* Did you know? */}
      <div className="pt-6 border-t border-gray-700/50">
        <div className="bg-gray-900/30 p-4 rounded-2xl max-w-md mx-auto border border-gray-700">
          <div className="flex items-center gap-3 mb-2">
            <LightBulbIcon className="w-5 h-5 text-yellow-400"/>
            <h4 className="font-bold text-sm text-yellow-300">Did you know?</h4>
          </div>
          <p className="text-xs text-gray-400 transition-opacity duration-500">{currentTip}</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingView;
