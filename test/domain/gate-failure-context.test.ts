import { describe, expect, it } from "vitest";
import {
  createGateFailureContext,
  GATE_FAILURE_OMISSION_MARKER,
  GATE_FAILURE_STREAM_CONTEXT_BYTES,
} from "../../src/domain/gate-failure-context.js";
import type { ProcessArtifact } from "../../src/domain/types.js";

describe("gate failure context", () => {
  it("uses the specified per-stream byte budget and omission marker", () => {
    expect(GATE_FAILURE_STREAM_CONTEXT_BYTES).toBe(8_192);
    expect(GATE_FAILURE_OMISSION_MARKER).toBe("\n...[middle of gate output omitted]...\n");
  });

  it("preserves small streams and exact process facts", () => {
    const context = createGateFailureContext("coverage", 2, processArtifact({
      stdout: "coverage output",
      stderr: "coverage failed",
      stderrTruncated: true,
    }));

    expect(context).toEqual({
      stepId: "coverage",
      visit: 2,
      processKind: "exited",
      exitCode: 7,
      signal: null,
      standardOutput: {
        text: "coverage output",
        capturedBytes: 15,
        includedBytes: 15,
        processTruncated: false,
        contextTruncated: false,
      },
      standardError: {
        text: "coverage failed",
        capturedBytes: 15,
        includedBytes: 15,
        processTruncated: true,
        contextTruncated: false,
      },
    });
  });

  it("keeps both ends of oversized ASCII output within the byte budget", () => {
    const middle = "middle-content-that-must-be-omitted";
    const stdout = `HEAD:${"a".repeat(5_000)}${middle}${"z".repeat(5_000)}:TAIL`;
    const stream = createGateFailureContext("mutation", 1, processArtifact({ stdout }))
      .standardOutput;

    expect(stream.contextTruncated).toBe(true);
    expect(stream.processTruncated).toBe(false);
    expect(stream.capturedBytes).toBe(Buffer.byteLength(stdout));
    expect(stream.includedBytes).toBe(GATE_FAILURE_STREAM_CONTEXT_BYTES);
    expect(Buffer.byteLength(stream.text)).toBe(stream.includedBytes);
    expect(stream.text).toMatch(/^HEAD:/u);
    expect(stream.text).toMatch(/:TAIL$/u);
    expect(stream.text).toContain(GATE_FAILURE_OMISSION_MARKER);
    expect(stream.text).toContain("\n...[middle of gate output omitted]...\n");
    expect(stream.text).not.toContain(middle);
  });

  it("preserves a stream exactly at the byte budget", () => {
    const stdout = "x".repeat(8_192);
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout }))
      .standardOutput;

    expect(stream).toEqual({
      text: stdout,
      capturedBytes: 8_192,
      includedBytes: 8_192,
      processTruncated: false,
      contextTruncated: false,
    });
  });

  it("compacts multibyte UTF-8 without replacement characters or split code points", () => {
    const euro = "\u{20ac}";
    const stdout = `BEGIN-${euro.repeat(4_000)}-END`;
    const stream = createGateFailureContext("sonar", 3, processArtifact({
      stdout,
      stdoutTruncated: true,
    })).standardOutput;

    expect(stream.contextTruncated).toBe(true);
    expect(stream.processTruncated).toBe(true);
    expect(stream.includedBytes).toBe(8_188);
    expect(stream.text.split(euro)).toHaveLength(2_714);
    expect(stream.text).toMatch(/^BEGIN-/u);
    expect(stream.text).toMatch(/-END$/u);
    expect(stream.text).not.toContain(String.fromCharCode(0xfffd));
  });

  it("counts and bounds supplementary characters without Node byte helpers", () => {
    const stdout = `BEGIN-${"😀".repeat(4_000)}-END`;
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout }))
      .standardOutput;

    expect(stream.contextTruncated).toBe(true);
    expect(stream.capturedBytes).toBe(Buffer.byteLength(stdout));
    expect(stream.includedBytes).toBeLessThanOrEqual(GATE_FAILURE_STREAM_CONTEXT_BYTES);
    expect(stream.text).toMatch(/^BEGIN-/u);
    expect(stream.text).toMatch(/-END$/u);
    expect(stream.text).not.toContain(String.fromCharCode(0xfffd));
  });

  it("preserves an exact supplementary-character suffix at the compact boundary", () => {
    const stdout = `${"x".repeat(9_000)}${"😀".repeat(2_000)}`;
    const marker = "\n...[middle of gate output omitted]...\n";
    const markerBytes = Buffer.byteLength(marker);
    const excerptBytes = GATE_FAILURE_STREAM_CONTEXT_BYTES - markerBytes;
    const headBytes = Math.floor(excerptBytes / 2);
    const tailBudget = Math.ceil(excerptBytes / 2);
    const head = "x".repeat(headBytes);
    const tail = "😀".repeat(Math.floor(tailBudget / 4));
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout })).standardOutput;

    expect(stream.text).toBe(`${head}${marker}${tail}`);
    expect(stream.includedBytes).toBe(markerBytes + headBytes + Buffer.byteLength(tail));
  });

  it.each([
    [0x10000, "lowest supplementary code point"],
    [0x10ffff, "highest supplementary code point"],
  ])("preserves %s at the suffix boundary (%s)", (codePoint) => {
    const character = String.fromCodePoint(codePoint);
    const stdout = `${"x".repeat(9_000)}${character.repeat(2_000)}`;
    const marker = "\n...[middle of gate output omitted]...\n";
    const markerBytes = Buffer.byteLength(marker);
    const excerptBytes = GATE_FAILURE_STREAM_CONTEXT_BYTES - markerBytes;
    const headBytes = Math.floor(excerptBytes / 2);
    const tailBudget = Math.ceil(excerptBytes / 2);
    const head = "x".repeat(headBytes);
    const tail = character.repeat(Math.floor(tailBudget / 4));
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout })).standardOutput;

    expect(stream.text).toBe(`${head}${marker}${tail}`);
    expect(stream.includedBytes).toBe(markerBytes + headBytes + Buffer.byteLength(tail));
  });

  it("does not combine an unpaired low surrogate with an ASCII predecessor", () => {
    const unit = "A\udc00";
    const stdout = `${"x".repeat(9_000)}${unit.repeat(2_000)}`;
    const marker = "\n...[middle of gate output omitted]...\n";
    const markerBytes = Buffer.byteLength(marker);
    const excerptBytes = GATE_FAILURE_STREAM_CONTEXT_BYTES - markerBytes;
    const headBytes = Math.floor(excerptBytes / 2);
    const tail = unit.repeat(Math.floor(Math.ceil(excerptBytes / 2) / 4));
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout })).standardOutput;

    expect(stream.text).toBe(`${"x".repeat(headBytes)}${marker}${tail}`);
    expect(stream.includedBytes).toBe(markerBytes + headBytes + Buffer.byteLength(tail));
  });

  it.each([
    ["\ud800\ud800", "adjacent unpaired high surrogates"],
    ["\ud800\ue000", "a non-low code unit after a high surrogate"],
    ["\udc00\udc00", "adjacent unpaired low surrogates"],
  ])("does not combine %s (%s)", (unit) => {
    const stdout = `${"x".repeat(9_000)}${unit.repeat(2_000)}`;
    const marker = "\n...[middle of gate output omitted]...\n";
    const markerBytes = Buffer.byteLength(marker);
    const excerptBytes = GATE_FAILURE_STREAM_CONTEXT_BYTES - markerBytes;
    const headBytes = Math.floor(excerptBytes / 2);
    const tailBudget = Math.ceil(excerptBytes / 2);
    const tail = `${tailBudget % 6 >= 3 ? unit.slice(-1) : ""}${unit.repeat(Math.floor(tailBudget / 6))}`;
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout })).standardOutput;

    expect(stream.text).toBe(`${"x".repeat(headBytes)}${marker}${tail}`);
    expect(stream.includedBytes).toBe(markerBytes + headBytes + Buffer.byteLength(tail));
  });

  it.each([
    [0x7f, 1, "one-byte upper boundary"],
    [0x7ff, 2, "two-byte upper boundary"],
    [0xffff, 3, "three-byte upper boundary"],
  ])("counts UTF-8 boundary %s (%s) as %s bytes", (codePoint, bytes) => {
    const text = String.fromCodePoint(codePoint);
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout: text }))
      .standardOutput;

    expect(stream).toMatchObject({ text, capturedBytes: bytes, includedBytes: bytes });
  });

  it("counts two-byte UTF-8 characters exactly", () => {
    const stream = createGateFailureContext("quick", 1, processArtifact({ stdout: "é" }))
      .standardOutput;

    expect(stream).toMatchObject({
      text: "é",
      capturedBytes: 2,
      includedBytes: 2,
      contextTruncated: false,
    });
  });
});

function processArtifact(overrides: Partial<ProcessArtifact> = {}): ProcessArtifact {
  return {
    kind: "exited",
    exitCode: 7,
    signal: null,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}
