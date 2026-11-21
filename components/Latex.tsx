import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

export interface Delimiter {
  left: string;
  right: string;
  display: boolean;
}

export type Macros = Record<string, string>;

export interface LatexProps {
  children: string | string[];
  delimiters?: Delimiter[];
  strict?: boolean;
  macros?: Macros;
}

interface Segment {
  type: 'text' | 'math';
  data: string;
  rawData: string;
  display: boolean;
}

const DEFAULT_DELIMITERS: Delimiter[] = [
  { left: '$$', right: '$$', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false },
  { left: '\\[', right: '\\]', display: true },
];

const AMS_REGEX = /^\\begin\{/;

function escapeRegex(value: string): string {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function findEndOfMath(delimiter: string, text: string, startIndex: number): number {
  let index = startIndex;
  let braceLevel = 0;
  const delimLength = delimiter.length;

  while (index < text.length) {
    const character = text[index];
    if (braceLevel <= 0 && text.slice(index, index + delimLength) === delimiter) {
      return index;
    } else if (character === '\\') {
      index++;
    } else if (character === '{') {
      braceLevel++;
    } else if (character === '}') {
      braceLevel--;
    }
    index++;
  }

  return -1;
}

function splitAtDelimiters(text: string, delimiters: Delimiter[]): Segment[] {
  if (!text || delimiters.length === 0) {
    return text ? [{ type: 'text', data: text, rawData: text, display: false }] : [];
  }

  let remaining = text;
  const segments: Segment[] = [];
  const regexLeft = new RegExp(`(${delimiters.map((d) => escapeRegex(d.left)).join('|')})`);

  while (remaining.length > 0) {
    const index = remaining.search(regexLeft);
    if (index === -1) {
      break;
    }

    if (index > 0) {
      const plain = remaining.slice(0, index);
      segments.push({ type: 'text', data: plain, rawData: plain, display: false });
      remaining = remaining.slice(index);
    }

    const matchedDelimiter = delimiters.find((delim) => remaining.startsWith(delim.left));
    if (!matchedDelimiter) {
      break;
    }

    const endIndex = findEndOfMath(
      matchedDelimiter.right,
      remaining,
      matchedDelimiter.left.length
    );

    if (endIndex === -1) {
      break;
    }

    const rawData = remaining.slice(0, endIndex + matchedDelimiter.right.length);
    const math = AMS_REGEX.test(rawData)
      ? rawData
      : remaining.slice(matchedDelimiter.left.length, endIndex);

    segments.push({
      type: 'math',
      data: math,
      rawData,
      display: matchedDelimiter.display,
    });

    remaining = remaining.slice(endIndex + matchedDelimiter.right.length);
  }

  if (remaining.length > 0) {
    segments.push({ type: 'text', data: remaining, rawData: remaining, display: false });
  }

  return segments;
}

export default function Latex({
  children,
  delimiters = DEFAULT_DELIMITERS,
  strict = false,
  macros,
}: LatexProps) {
  const text = Array.isArray(children) ? children.join('') : String(children ?? '');

  const segments = useMemo(() => splitAtDelimiters(text, delimiters), [text, delimiters]);

  return (
    <span>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <React.Fragment key={index}>{segment.data}</React.Fragment>;
        }

        try {
          const html = katex.renderToString(segment.data, {
            displayMode: segment.display,
            throwOnError: strict,
            macros: macros ? { ...macros } : undefined,
          });
          return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
        } catch (error) {
          if (strict) {
            throw error;
          }
          return <React.Fragment key={index}>{segment.rawData}</React.Fragment>;
        }
      })}
    </span>
  );
}
