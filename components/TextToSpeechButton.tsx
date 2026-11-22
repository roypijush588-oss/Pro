
import React, { useState, useRef } from 'react';
import {
  generateSpeech,
  getGeminiErrorMessage,
  isRetryableGeminiError,
} from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
import { SpeakerWaveIcon, SpeakerXMarkIcon, XCircleIcon } from './icons';

interface TextToSpeechButtonProps {
  textToSpeak: string;
}

const TextToSpeechButton: React.FC<TextToSpeechButtonProps> = ({ textToSpeak }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const inFlightRef = useRef(false);

  const handlePlayAudio = async () => {
    setAudioError(null);
    setCanRetry(false);

    if (isPlaying && sourceRef.current) {
        sourceRef.current.stop();
        setIsPlaying(false);
        return;
    }

    if (inFlightRef.current || isGenerating) return;

    inFlightRef.current = true;
    setIsGenerating(true);
    try {
        const audioBase64 = await generateSpeech(textToSpeak);
        
        if (!audioContextRef.current) {
            const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
            audioContextRef.current = new AudioContext({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;
        if(audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        const audioBuffer = await decodeAudioData(decode(audioBase64), audioContext, 24000, 1);
        
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
            setIsPlaying(false);
            sourceRef.current = null;
        };
        source.start();
        sourceRef.current = source;
        setIsPlaying(true);
    } catch (error) {
        console.error("Failed to play audio:", error);
        setAudioError(getGeminiErrorMessage(error, "An unknown error occurred while generating audio."));
        setCanRetry(isRetryableGeminiError(error));
    } finally {
        inFlightRef.current = false;
        setIsGenerating(false);
    }
  };

  return (
    <div className="mt-4">
        <button
        onClick={handlePlayAudio}
        disabled={isGenerating || !textToSpeak}
        className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 disabled:text-gray-500 disabled:cursor-wait"
        aria-label={isPlaying ? 'Stop reading' : 'Read aloud'}
        >
        {isGenerating ? (
            <>
            <div className="w-4 h-4 border-2 border-t-indigo-400 border-gray-600 rounded-full animate-spin"></div>
            Generating...
            </>
        ) : isPlaying ? (
            <>
            <SpeakerXMarkIcon className="w-5 h-5" />
            Stop
            </>
        ) : (
            <>
            <SpeakerWaveIcon className="w-5 h-5" />
            Read Aloud
            </>
        )}
        </button>
        {audioError && (
        <div className="mt-2 text-sm text-red-400 flex items-center gap-2 flex-wrap">
            <XCircleIcon className="w-5 h-5 shrink-0" />
            <span>{audioError}</span>
            {canRetry && (
              <button
                type="button"
                onClick={handlePlayAudio}
                disabled={isGenerating}
                className="px-2 py-0.5 bg-red-900/40 hover:bg-red-800/60 border border-red-400/40 text-red-200 rounded text-xs font-medium"
              >
                Retry
              </button>
            )}
        </div>
        )}
    </div>
  );
};

export default TextToSpeechButton;
