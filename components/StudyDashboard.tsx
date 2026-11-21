import React, { useState } from 'react';
import { EducationalContent, DeepDiveContent, StudyMode } from '../types';
import { BookOpenIcon, BoltIcon, RectangleStackIcon, ChatBubbleLeftRightIcon, DownloadIcon, ArrowPathIcon, CalculatorIcon, PhotoIcon, BeakerIcon, GlobeAmericasIcon } from './icons';
import Latex from './Latex';
import QuestionAccordion from './QuestionAccordion';
import Flashcard from './Flashcard';
import MermaidDiagram from './MermaidDiagram';
import TextToSpeechButton from './TextToSpeechButton';

interface StudyDashboardProps {
    content: EducationalContent | DeepDiveContent;
    mode: StudyMode;
    onDownload: () => void;
    onReset: () => void;
}

type Tab = 'summary' | 'notes' | 'formulas' | 'flashcards' | 'questions' | 'quiz' | 'diagrams' | 'examples' | 'history' | 'applications';

const TabButton: React.FC<{ id: Tab, label: string, icon: React.ReactNode, count?: number, isActive: boolean, onClick: () => void }> = ({ label, icon, count, isActive, onClick }) => {
    if (count === 0) return null;
    
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                isActive 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
            }`}
        >
            <span className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300'}>{icon}</span>
            <span className="font-medium flex-1 text-left">{label}</span>
            {count && <span className={`text-xs px-2 py-0.5 rounded-full ${isActive ? 'bg-indigo-500 text-white' : 'bg-gray-700 text-gray-400'}`}>{count}</span>}
        </button>
    );
};

const StudyDashboard: React.FC<StudyDashboardProps> = ({ content, mode, onDownload, onReset }) => {
    const [activeTab, setActiveTab] = useState<Tab>('summary');

    const isDeepDive = mode === 'DeepDive';
    const eduContent = !isDeepDive ? (content as EducationalContent) : null;
    const deepContent = isDeepDive ? (content as DeepDiveContent) : null;

    const renderContent = () => {
        if (isDeepDive && deepContent) {
            switch (activeTab) {
                case 'summary':
                    return (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h2 className="text-3xl font-bold text-indigo-300 mb-4"><Latex>{deepContent.topic || 'Topic'}</Latex></h2>
                            <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed">
                                <Latex>{deepContent.theory || 'No theory available.'}</Latex>
                            </div>
                            <TextToSpeechButton textToSpeak={`${deepContent.topic || ''}. ${deepContent.theory || ''}`} />
                        </div>
                    );
                case 'formulas':
                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {deepContent.formulas?.map((f, i) => (
                                <div key={i} className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                    <div className="font-bold text-indigo-300 font-mono text-lg mb-3 bg-gray-900/50 p-3 rounded-lg inline-block">
                                        <Latex>{f.formula || ''}</Latex>
                                    </div>
                                    <div className="text-gray-300"><Latex>{f.explanation || ''}</Latex></div>
                                </div>
                            ))}
                        </div>
                    );
                case 'diagrams':
                    return (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {deepContent.diagrams?.map((d, i) => (
                                <div key={i} className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                    <h3 className="text-lg font-bold text-gray-200 mb-4"><Latex>{d.description || ''}</Latex></h3>
                                    <div className="bg-white p-4 rounded-xl overflow-x-auto">
                                        <MermaidDiagram chart={d.mermaidCode || ''} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                case 'examples':
                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {deepContent.examples?.map((ex, i) => (
                                <QuestionAccordion key={i} qaPair={{ question: ex.title, answer: ex.explanation }} />
                            ))}
                        </div>
                    );
                case 'history':
                    return (
                        <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Latex>{deepContent.history || ''}</Latex>
                        </div>
                    );
                case 'applications':
                    return (
                        <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <Latex>{deepContent.currentApplications || ''}</Latex>
                        </div>
                    );
                default:
                    return null;
            }
        } else if (eduContent) {
            switch (activeTab) {
                case 'summary':
                    return (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="prose prose-invert max-w-none text-gray-300 leading-relaxed">
                                <Latex>{eduContent.topicSummary || 'No summary available.'}</Latex>
                            </div>
                            <TextToSpeechButton textToSpeak={eduContent.topicSummary || ''} />
                        </div>
                    );
                case 'notes':
                    return (
                        <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <pre className="whitespace-pre-wrap font-sans text-gray-300 leading-relaxed"><Latex>{eduContent.revisionNotes || ''}</Latex></pre>
                        </div>
                    );
                case 'formulas':
                    return (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {eduContent.formulaExplanations?.map((item, i) => (
                                <div key={i} className="bg-gray-800 p-6 rounded-2xl border border-gray-700">
                                    <div className="font-bold text-indigo-300 font-mono text-lg mb-3 bg-gray-900/50 p-3 rounded-lg inline-block">
                                        <Latex>{item.formula || ''}</Latex>
                                    </div>
                                    <div className="text-gray-300"><Latex>{item.explanation || ''}</Latex></div>
                                </div>
                            ))}
                        </div>
                    );
                case 'flashcards':
                    return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {eduContent.flashcards?.map((c, i) => (
                                <Flashcard key={i} flashcard={c} />
                            ))}
                        </div>
                    );
                case 'questions':
                    return (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {eduContent.veryShortAnswerQuestions?.length ? (
                                <div>
                                    <h3 className="text-xl font-bold text-indigo-300 mb-4">Very Short Answer</h3>
                                    <div className="space-y-3">
                                        {eduContent.veryShortAnswerQuestions.map((qa, i) => <QuestionAccordion key={`vsa-${i}`} qaPair={qa} />)}
                                    </div>
                                </div>
                            ) : null}
                            {eduContent.shortAnswerQuestions?.length ? (
                                <div>
                                    <h3 className="text-xl font-bold text-indigo-300 mb-4">Short Answer</h3>
                                    <div className="space-y-3">
                                        {eduContent.shortAnswerQuestions.map((qa, i) => <QuestionAccordion key={`sa-${i}`} qaPair={qa} />)}
                                    </div>
                                </div>
                            ) : null}
                            {eduContent.longAnswerQuestions?.length ? (
                                <div>
                                    <h3 className="text-xl font-bold text-indigo-300 mb-4">Long Answer</h3>
                                    <div className="space-y-3">
                                        {eduContent.longAnswerQuestions.map((qa, i) => <QuestionAccordion key={`la-${i}`} qaPair={qa} />)}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    );
                default:
                    return null;
            }
        }
        return null;
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
            {/* Sidebar */}
            <div className="w-full lg:w-72 flex-shrink-0 bg-gray-900 rounded-3xl p-4 border border-gray-800 overflow-y-auto custom-scrollbar">
                <div className="space-y-2">
                    <TabButton id="summary" label="Summary" icon={<BookOpenIcon className="w-5 h-5"/>} isActive={activeTab === 'summary'} onClick={() => setActiveTab('summary')} />
                    
                    {isDeepDive ? (
                        <>
                            <TabButton id="formulas" label="Key Formulas" icon={<CalculatorIcon className="w-5 h-5"/>} count={deepContent?.formulas?.length} isActive={activeTab === 'formulas'} onClick={() => setActiveTab('formulas')} />
                            <TabButton id="diagrams" label="Diagrams" icon={<PhotoIcon className="w-5 h-5"/>} count={deepContent?.diagrams?.length} isActive={activeTab === 'diagrams'} onClick={() => setActiveTab('diagrams')} />
                            <TabButton id="examples" label="Examples" icon={<BeakerIcon className="w-5 h-5"/>} count={deepContent?.examples?.length} isActive={activeTab === 'examples'} onClick={() => setActiveTab('examples')} />
                            <TabButton id="history" label="History" icon={<GlobeAmericasIcon className="w-5 h-5"/>} count={deepContent?.history ? 1 : 0} isActive={activeTab === 'history'} onClick={() => setActiveTab('history')} />
                            <TabButton id="applications" label="Applications" icon={<BoltIcon className="w-5 h-5"/>} count={deepContent?.currentApplications ? 1 : 0} isActive={activeTab === 'applications'} onClick={() => setActiveTab('applications')} />
                        </>
                    ) : (
                        <>
                            <TabButton id="notes" label="Revision Notes" icon={<BoltIcon className="w-5 h-5"/>} count={eduContent?.revisionNotes ? 1 : 0} isActive={activeTab === 'notes'} onClick={() => setActiveTab('notes')} />
                            <TabButton id="formulas" label="Formulas" icon={<CalculatorIcon className="w-5 h-5"/>} count={eduContent?.formulaExplanations?.length} isActive={activeTab === 'formulas'} onClick={() => setActiveTab('formulas')} />
                            <TabButton id="flashcards" label="Flashcards" icon={<RectangleStackIcon className="w-5 h-5"/>} count={eduContent?.flashcards?.length} isActive={activeTab === 'flashcards'} onClick={() => setActiveTab('flashcards')} />
                            <TabButton id="questions" label="Q&A" icon={<ChatBubbleLeftRightIcon className="w-5 h-5"/>} count={(eduContent?.veryShortAnswerQuestions?.length || 0) + (eduContent?.shortAnswerQuestions?.length || 0) + (eduContent?.longAnswerQuestions?.length || 0)} isActive={activeTab === 'questions'} onClick={() => setActiveTab('questions')} />
                        </>
                    )}
                </div>

                <div className="mt-8 pt-8 border-t border-gray-800 space-y-3">
                    <button onClick={onDownload} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-all">
                        <DownloadIcon className="w-5 h-5" />
                        <span className="font-medium">Download PDF</span>
                    </button>
                    <button onClick={onReset} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all">
                        <ArrowPathIcon className="w-5 h-5" />
                        <span className="font-medium">Scan New Page</span>
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 bg-gray-900 rounded-3xl p-6 lg:p-10 border border-gray-800 overflow-y-auto custom-scrollbar shadow-2xl">
                {renderContent()}
            </div>
        </div>
    );
};

export default StudyDashboard;
