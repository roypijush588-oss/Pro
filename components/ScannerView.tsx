import React, { useRef, useState } from 'react';
import { CameraIcon, XCircleIcon } from './icons';

interface ScannerViewProps {
    onImageSelected: (file: File, url: string) => void;
    onClear: () => void;
    imageFile: File | null;
    imageUrl: string | null;
}

const ScannerView: React.FC<ScannerViewProps> = ({ onImageSelected, onClear, imageUrl }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            if (ev.target?.result) {
                onImageSelected(file, ev.target.result as string);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            processFile(file);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    if (imageUrl) {
        return (
            <div className="relative w-full h-96 bg-gray-900 rounded-2xl overflow-hidden border-2 border-indigo-500 shadow-2xl group">
                <img src={imageUrl} alt="Scanned Content" className="w-full h-full object-contain" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <button 
                        onClick={onClear}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transform hover:scale-105 transition-all"
                    >
                        <XCircleIcon className="w-6 h-6" />
                        Retake
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div 
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
                w-full h-96 border-4 border-dashed rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300
                ${isDragging ? 'border-indigo-400 bg-indigo-500/10 scale-[1.02]' : 'border-gray-700 hover:border-indigo-500 hover:bg-gray-800/50'}
            `}
        >
            <div className="bg-gray-800 p-6 rounded-full mb-6 shadow-xl group-hover:scale-110 transition-transform duration-300">
                <CameraIcon className="w-16 h-16 text-indigo-400" />
            </div>
            <h3 className="text-2xl font-bold text-gray-200 mb-2">Scan Textbook Page</h3>
            <p className="text-gray-400 text-center max-w-md">
                Click to capture or drag and drop an image here.
                <br />
                <span className="text-sm text-gray-500 mt-2 block">Supports JPG, PNG, WEBP</span>
            </p>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="image/*" 
                className="hidden" 
            />
        </div>
    );
};

export default ScannerView;
