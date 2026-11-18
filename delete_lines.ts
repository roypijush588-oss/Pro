import * as fs from 'fs';
const lines = fs.readFileSync('services/geminiService.ts', 'utf8').split('\n');
const newLines = [...lines.slice(0, 424), ...lines.slice(726)];
fs.writeFileSync('services/geminiService.ts', newLines.join('\n'));
console.log("Deleted lines 425 to 726");
