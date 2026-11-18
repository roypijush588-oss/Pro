
import React, { useState } from 'react';
import { FlashcardItem as FlashcardType } from '../types';
import TextToSpeechButton from './TextToSpeechButton';

interface FlashcardProps {
  flashcard: FlashcardType;
}

const Flashcard: React.FC<FlashcardProps> = ({ flashcard }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  // Define a minimum height for the card to prevent layout shifts during flipping
  // when content lengths differ significantly.
  const cardStyle = {
    minHeight: '200px',
    perspective: '1000px',
  };

  const flipperStyle = {
    transition: 'transform 0.6s',
    transformStyle: 'preserve-3d' as const,
    transform: isFlipped ? 'rotateY(180deg)' : '',
  };

  const faceStyle = {
    backfaceVisibility: 'hidden' as const,
  };

  const backStyle = {
    ...faceStyle,
    transform: 'rotateY(180deg)',
  };

  return (
    <div
      style={cardStyle}
      className="cursor-pointer"
      onClick={() => setIsFlipped(!isFlipped)}
      role="button"
      aria-pressed={isFlipped}
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsFlipped(!isFlipped)}
    >
      <div style={flipperStyle} className="relative w-full h-full">
        {/* Front */}
        <div style={faceStyle} className="absolute w-full h-full bg-gray-700 rounded-lg p-4 flex flex-col justify-center items-center text-center shadow-lg">
          <p className="text-lg font-semibold text-gray-200">{flashcard.question}</p>
        </div>

        {/* Back */}
        <div style={backStyle} className="absolute w-full h-full bg-indigo-700 rounded-lg p-4 flex flex-col justify-center items-center text-center shadow-lg">
          <p className="text-gray-100">{flashcard.answer}</p>
          <div onClick={(e) => e.stopPropagation()}>
            <TextToSpeechButton textToSpeak={flashcard.answer} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Flashcard;
