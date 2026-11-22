
import React, { useState, useEffect, useMemo } from 'react';
import { Question } from '../types';
import { translateText } from '../services/geminiService';
import { ChevronDownIcon, GlobeAltIcon } from './icons';
import TextToSpeechButton from './TextToSpeechButton';

interface QuestionAccordionProps {
  qaPair: Question;
}

type Language = 'English' | 'Hindi' | 'Bengali' | 'Tamil' | 'Telugu';

const QuestionAccordion: React.FC<QuestionAccordionProps> = ({ qaPair }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('English');
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationCache, setTranslationCache] = useState<Partial<Record<Language, Question>>>({});
  const [translationError, setTranslationError] = useState<string | null>(null);

  const originalContent = useMemo(() => qaPair, [qaPair]);

  useEffect(() => {
    // Reset state if the underlying qaPair changes
    setSelectedLanguage('English');
    setTranslationCache({});
    setTranslationError(null);
    setIsTranslating(false);
  }, [qaPair]);

  const handleLanguageChange = async (lang: Language) => {
    setSelectedLanguage(lang);
    setTranslationError(null);
    if (lang === 'English') {
      return;
    }

    if (translationCache[lang]) {
      return;
    }

    setIsTranslating(true);
    try {
      const [translatedQuestion, translatedAnswer] = await Promise.all([
        translateText(originalContent.question, lang),
        originalContent.answer ? translateText(originalContent.answer, lang) : Promise.resolve('')
      ]);
      setTranslationCache((prev) => ({
        ...prev,
        [lang]: { question: translatedQuestion, answer: translatedAnswer },
      }));
    } catch (error) {
      console.error("Translation failed:", error);
      setTranslationError(error instanceof Error ? error.message : 'Translation failed. Please try again.');
      setSelectedLanguage('English'); // Revert on failure
    } finally {
      setIsTranslating(false);
    }
  };

  const displayContent = selectedLanguage === 'English' ? originalContent : (translationCache[selectedLanguage] || originalContent);
  
  return (
    <details className="group bg-gray-700 rounded-lg overflow-hidden transition-all duration-300 relative" onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}>
      {qaPair.marks && (
        <span className="absolute top-4 right-12 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full z-10">
          {qaPair.marks} Mark{qaPair.marks > 1 ? 's' : ''}
        </span>
      )}
      <summary className="p-4 flex justify-between items-center cursor-pointer list-none hover:bg-gray-600 pr-24">
        <span className="font-semibold text-gray-200">{displayContent.question.replace(/\[(Hindi|Bengali|Tamil|Telugu)\]/g, '')}</span>
        <ChevronDownIcon className="w-5 h-5 text-gray-400 transition-transform duration-300 group-open:rotate-180 absolute right-4" />
      </summary>
      <div className="p-4 border-t border-gray-600 bg-gray-800">
        <p className="text-gray-300 whitespace-pre-wrap">{isTranslating ? 'Translating...' : (displayContent.answer || 'No answer available.')}</p>
        {translationError && (
          <p className="mt-2 text-xs text-red-400">{translationError}</p>
        )}
        
        <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <TextToSpeechButton textToSpeak={displayContent.answer || ''} />

            {isOpen && (
                <div className="flex items-center gap-2">
                    <GlobeAltIcon className="w-5 h-5 text-gray-400"/>
                    <select
                        value={selectedLanguage}
                        onChange={(e) => handleLanguageChange(e.target.value as Language)}
                        disabled={isTranslating}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-1.5"
                    >
                        <option>English</option>
                        <option>Hindi</option>
                        <option>Bengali</option>
                        <option>Tamil</option>
                        <option>Telugu</option>
                    </select>
                </div>
            )}
        </div>
      </div>
    </details>
  );
};

export default QuestionAccordion;
