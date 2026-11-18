import React from 'react';
import { PencilIcon } from './icons';

interface TextInputViewProps {
    onTextChange: (text: string) => void;
    text: string;
}

const TextInputView: React.FC<TextInputViewProps> = ({ onTextChange, text }) => {
    return (
        <div className="w-full h-96 relative group">
            <textarea 
                value={text} 
                onChange={(e) => onTextChange(e.target.value)} 
                placeholder="Type or paste your topic, question, or text here..." 
                className="w-full h-full bg-gray-900 border-2 border-gray-700 rounded-3xl p-6 text-lg text-gray-200 focus:border-indigo-500 outline-none resize-none transition-all duration-300 shadow-inner"
            />
            <div className="absolute top-4 right-4 bg-gray-800 p-2 rounded-lg text-gray-400 group-hover:text-indigo-400 transition-colors">
                <PencilIcon className="w-6 h-6" />
            </div>
            <div className="absolute bottom-4 right-4 text-xs text-gray-500">
                {text.length} characters
            </div>
        </div>
    );
};

export default TextInputView;
