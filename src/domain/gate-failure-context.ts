import type {
  GateFailureContext,
  GateFailureStreamContext,
  ProcessArtifact,
} from "./types.js";

export const GATE_FAILURE_STREAM_CONTEXT_BYTES = 8_192;
export const GATE_FAILURE_OMISSION_MARKER = omissionMarker();

export function createGateFailureContext(
  stepId: string,
  visit: number,
  process: ProcessArtifact,
): GateFailureContext {
  return {
    stepId,
    visit,
    processKind: process.kind,
    exitCode: process.exitCode,
    signal: process.signal,
    standardOutput: compactStream(process.stdout, process.stdoutTruncated),
    standardError: compactStream(process.stderr, process.stderrTruncated),
  };
}

function compactStream(text: string, processTruncated: boolean): GateFailureStreamContext {
  const capturedBytes = utf8ByteLength(text);
  if (capturedBytes <= GATE_FAILURE_STREAM_CONTEXT_BYTES) {
    return {
      text,
      capturedBytes,
      includedBytes: capturedBytes,
      processTruncated,
      contextTruncated: false,
    };
  }

  const marker = omissionMarker();
  const markerBytes = utf8ByteLength(marker);
  const excerptBytes = GATE_FAILURE_STREAM_CONTEXT_BYTES - markerBytes;
  const head = utf8Prefix(text, Math.floor(excerptBytes / 2));
  const tail = utf8Suffix(text, Math.ceil(excerptBytes / 2));
  const compacted = `${head}${marker}${tail}`;
  return {
    text: compacted,
    capturedBytes,
    includedBytes: utf8ByteLength(compacted),
    processTruncated,
    contextTruncated: true,
  };
}

function utf8Prefix(value: string, maximumBytes: number): string {
  let bytes = 0;
  let end = 0;
  for (const character of value) {
    const characterBytes = utf8CharacterBytes(character);
    if (bytes + characterBytes > maximumBytes) break;
    bytes += characterBytes;
    end += character.length;
  }
  return value.slice(0, end);
}

function utf8Suffix(value: string, maximumBytes: number): string {
  let bytes = 0;
  let start = value.length;
  let nextStart = 0;
  for (; start !== 0; start = nextStart) {
    let characterStart = start - 1;
    const trailingCodeUnit = value.charCodeAt(characterStart); // NOSONAR: inspect UTF-16 code units for surrogate boundaries.
    if (isLowSurrogate(trailingCodeUnit)) {
      const precedingCodeUnit = value.charCodeAt(characterStart - 1); // NOSONAR: inspect the preceding UTF-16 code unit.
      if (isHighSurrogate(precedingCodeUnit)) {
        characterStart -= 1;
      }
    }
    const character = value.slice(characterStart, start);
    const characterBytes = utf8CharacterBytes(character);
    if (bytes + characterBytes > maximumBytes) break;
    bytes += characterBytes;
    nextStart = characterStart;
  }
  return value.slice(start);
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) bytes += utf8CharacterBytes(character);
  return bytes;
}

function utf8CharacterBytes(character: string): number {
  const codePoint = character.codePointAt(0)!;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function omissionMarker(): string {
  return "\n...[middle of gate output omitted]...\n";
}

function isHighSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xd800 && codeUnit <= 0xdbff;
}

function isLowSurrogate(codeUnit: number): boolean {
  return codeUnit >= 0xdc00 && codeUnit <= 0xdfff;
}
