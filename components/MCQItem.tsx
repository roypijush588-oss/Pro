
import React, { useState } from 'react';
import { MCQ } from '../types';
import { CheckCircleIcon, XCircleIcon, LightBulbIcon } from './icons';

interface MCQItemProps {
  mcq: MCQ;
}

const MCQItem: React.FC<MCQItemProps> = ({ mcq }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const optionLabels = ['A', 'B', 'C', 'D'];

  const handleOptionClick = (option: string) => {
    if (selectedOption !== null) return; // Prevent changing answer
    setSelectedOption(option);
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4 transition-all duration-300 relative">
      {mcq.marks && (
        <span className="absolute top-4 right-4 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full">
          {mcq.marks} Mark{mcq.marks > 1 ? 's' : ''}
        </span>
      )}
      <p className="font-semibold text-gray-200 mb-3 pr-16">{mcq.question}</p>
      <div className="space-y-2">
        {mcq.options.map((option, index) => {
          const isSelected = option === selectedOption;
          const isCorrect = option === mcq.correctAnswer;
          const showAsCorrect = selectedOption !== null && isCorrect;
          const showAsIncorrect = isSelected && !isCorrect;

          let optionClass = "flex items-center gap-3 p-3 rounded-md transition-colors duration-200 cursor-pointer border-2 ";
          
          if (selectedOption === null) {
            optionClass += "border-transparent bg-gray-800 hover:bg-gray-600";
          } else {
            optionClass += "cursor-default ";
            if (showAsCorrect) {
              optionClass += "bg-green-500/20 border-green-500/50 text-green-300";
            } else if (showAsIncorrect) {
              optionClass += "bg-red-500/20 border-red-500/50 text-red-300";
            } else {
              optionClass += "border-transparent bg-gray-800/50 text-gray-500";
            }
          }

          return (
            <div 
              key={index} 
              className={optionClass}
              onClick={() => handleOptionClick(option)}
            >
              <span className={`font-bold ${showAsCorrect ? 'text-green-300' : showAsIncorrect ? 'text-red-300' : selectedOption === null ? 'text-gray-400' : 'text-gray-600'}`}>
                {optionLabels[index]})
              </span>
              <span>{option}</span>
              {showAsCorrect && <CheckCircleIcon className="w-5 h-5 ml-auto text-green-400" />}
              {showAsIncorrect && <XCircleIcon className="w-5 h-5 ml-auto text-red-400" />}
            </div>
          );
        })}
      </div>
      
      {selectedOption !== null && mcq.explanation && (
        <div className="mt-4 p-3 bg-indigo-900/30 border border-indigo-500/30 rounded-md animate-fade-in">
          <div className="flex items-start gap-2">
            <LightBulbIcon className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-indigo-300 block mb-1">Explanation:</span>
              <p className="text-sm text-gray-300">{mcq.explanation}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MCQItem;
