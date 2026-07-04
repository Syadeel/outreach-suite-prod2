export type ScriptSegmentType = 'static' | 'variable';

export interface ScriptSegment {
  type: ScriptSegmentType;
  text?: string;
  placeholder?: string;
  index: number;
}

export interface ParsedScript {
  raw: string;
  segments: ScriptSegment[];
  variableNames: string[];
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

export function parseScriptTemplate(template: string): ParsedScript {
  const segments: ScriptSegment[] = [];
  const variableNames: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = PLACEHOLDER_REGEX.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'static',
        text: template.slice(lastIndex, match.index),
        index: i++,
      });
    }

    const placeholder = match[1];
    segments.push({
      type: 'variable',
      placeholder,
      index: i++,
    });

    if (!variableNames.includes(placeholder)) {
      variableNames.push(placeholder);
    }

    lastIndex = PLACEHOLDER_REGEX.lastIndex;
  }

  if (lastIndex < template.length) {
    segments.push({
      type: 'static',
      text: template.slice(lastIndex),
      index: i,
    });
  }

  return {
    raw: template,
    segments,
    variableNames,
  };
}

export function resolveScriptTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(PLACEHOLDER_REGEX, (_, name: string) => {
    const value = variables[name];
    return value !== undefined && value !== '' ? value : `[${name}]`;
  });
}

export function estimateSpeechDurationSeconds(text: string, wordsPerMinute = 150): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return (words / wordsPerMinute) * 60;
}

// --------------- Timed segments for ffmpeg.wasm splicing ---------------

export interface TimedSegment {
  type: 'static' | 'variable';
  text?: string;
  placeholder?: string;
  startTime: number;  // seconds in the base video
  endTime: number;    // seconds in the base video
}

/**
 * Parse script template and assign timestamps proportional to character count.
 * Used by ffmpeg.wasm to know WHERE in the base video to splice clips.
 *
 * @param template  The raw script template with {{placeholders}}
 * @param totalDuration  Total duration of the base video in seconds
 */
export function parseScriptWithTimestamps(
  template: string,
  totalDuration: number
): TimedSegment[] {
  const segments: { type: 'static' | 'variable'; value: string; placeholder?: string }[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'static', value: template.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'variable', value: match[1], placeholder: match[1] });
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < template.length) {
    segments.push({ type: 'static', value: template.slice(lastIndex) });
  }

  // Weight: variables get extra time (they're spoken slower for emphasis)
  const STATIC_WEIGHT = 1;
  const VARIABLE_WEIGHT = 1.5;

  const totalWeight = segments.reduce((sum, seg) => {
    const weight = seg.type === 'variable' ? VARIABLE_WEIGHT : STATIC_WEIGHT;
    return sum + seg.value.length * weight;
  }, 0);

  if (totalWeight === 0) return [];

  let currentTime = 0;
  return segments.map((seg) => {
    const weight = seg.type === 'variable' ? VARIABLE_WEIGHT : STATIC_WEIGHT;
    const duration = (seg.value.length * weight / totalWeight) * totalDuration;
    const startTime = currentTime;
    const endTime = currentTime + duration;
    currentTime = endTime;
    return {
      type: seg.type,
      text: seg.type === 'static' ? seg.value : undefined,
      placeholder: seg.placeholder,
      startTime,
      endTime,
    };
  });
}
