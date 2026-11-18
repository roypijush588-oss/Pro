
import React, { useEffect, useRef, useId } from 'react';
import mermaid from 'mermaid';

interface MermaidDiagramProps {
  chart: string;
}

// Initialize Mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  themeVariables: {
    background: '#1F2937', // bg-gray-800
    primaryColor: '#374151', // bg-gray-700
    primaryTextColor: '#F9FAFB', // text-gray-50
    primaryBorderColor: '#818CF8', // indigo-400
    lineColor: '#A5B4FC', // indigo-300
    textColor: '#D1D5DB', // text-gray-300
    fontSize: '16px',
    // Colors for node styling
    secondaryColor: '#22C55E', // green-500
    tertiaryColor: '#F97316', // orange-500
  }
});

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, ''); // Create a unique, CSS-safe ID

  useEffect(() => {
    const renderChart = async () => {
      if (ref.current && chart) {
        // Clear previous render to avoid duplicates
        ref.current.innerHTML = '';
        try {
          // Use the modern async/await syntax for mermaid.render
          const { svg } = await mermaid.render(`mermaid-svg-${id}`, chart);
          if (ref.current) {
              ref.current.innerHTML = svg;
          }
        } catch (e) {
            console.error("Mermaid render error:", e);
            if (ref.current) {
                const errorMessage = e instanceof Error ? e.message : 'Unknown error';
                ref.current.innerHTML = `
                  <div class="bg-red-900/30 border border-red-500/50 text-red-300 p-4 rounded-lg text-left">
                    <p class="font-bold mb-2">Diagram Syntax Error</p>
                    <p class="text-sm mb-2">${errorMessage.split('lex').shift()}</p>
                    <pre class="bg-gray-900 p-2 rounded text-xs whitespace-pre-wrap font-mono overflow-auto">${chart}</pre>
                  </div>
                `;
            }
        }
      } else if (ref.current) {
          ref.current.innerHTML = ''; // Clear if no chart is provided
      }
    };
    renderChart();
  }, [chart, id]);
  
  // This div will be populated with the SVG by the useEffect hook.
  return (
    <div ref={ref} className="mermaid-container bg-gray-800 p-4 rounded-lg flex justify-center w-full overflow-auto" />
    );
};

export default MermaidDiagram;
