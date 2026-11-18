
import React, { useState, useRef } from 'react';
import { generateSpeech } from '../services/geminiService';
import { decode, decodeAudioData } from '../utils/audioUtils';
import { SpeakerWaveIcon, SpeakerXMarkIcon, XCircleIcon } from './icons';

interface TextToSpeechButtonProps {
  textToSpeak: string;
}

const TextToSpeechButton: React.FC<TextToSpeechButtonProps> = ({ textToSpeak }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handlePlayAudio = async () => {
    setAudioError(null);

    if (isPlaying && sourceRef.current) {
        sourceRef.current.stop();
        setIsPlaying(false);
        return;
    }

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
        if (error instanceof Error) {
            setAudioError(error.message);
        } else {
            setAudioError("An unknown error occurred while generating audio.");
        }
        setTimeout(() => setAudioError(null), 5000);
    } finally {
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
        <p className="mt-2 text-sm text-red-400 flex items-center gap-2">
            <XCircleIcon className="w-5 h-5" />
            <span>{audioError}</span>
        </p>
        )}
    </div>
  );
};

export default TextToSpeechButton;
