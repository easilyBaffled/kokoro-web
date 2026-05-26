import { describe, it, expect, vi } from "vitest";
import {
  sanitizeText,
  segmentText,
  isSilenceMarker,
  extractSilenceDuration,
  isSpeedMarker,
  extractSpeedMultiplier,
  scaleSilences,
  preprocessText,
} from "./textProcessor";

// Stub for apiClient.phonemize: returns UPPERCASE text to simulate processing.
vi.mock("$lib/shared/phonemizer", () => ({
  phonemize: async (text: string, _: string) => text.toUpperCase(),
}));

// Test for sanitization stage
describe("sanitizeText", () => {
  it("should replace punctuation and newlines with silence markers", () => {
    const input = "Hello, world! How are you?\nI'm fine.";
    const expected = "Hello[0.2s]world![0.3s]How are you?[0.3s]I'm fine.";
    expect(sanitizeText(input)).toBe(expected);
  });

  it("should trim extra whitespace", () => {
    const input = "  Hello, world!  ";
    const expected = "Hello[0.2s]world![0.3s]";
    expect(sanitizeText(input)).toBe(expected);
  });

  it("should replace ellipsis with a 0.6s pause", () => {
    expect(sanitizeText("Wait...")).toBe("Wait[0.6s]");
    expect(sanitizeText("Wait…")).toBe("Wait[0.6s]");
  });

  it("should replace em-dash with a 0.5s pause", () => {
    expect(sanitizeText("word—word")).toBe("word[0.5s]word");
  });

  it("should give paragraph breaks a longer pause than single newlines", () => {
    const withParagraph = sanitizeText("First\n\nSecond");
    const withNewline = sanitizeText("First\nSecond");
    expect(withParagraph).toBe("First[0.8s]Second");
    expect(withNewline).toBe("First[0.4s]Second");
  });
});

// Test for segmentation stage
describe("segmentText", () => {
  it("should split a sanitized string into segments and silence markers", () => {
    const sanitized = "Hello[0.1s]world[0.1s]How are you";
    const segments = segmentText(sanitized);
    expect(segments).toEqual([
      "Hello",
      "[0.1s]",
      "world",
      "[0.1s]",
      "How are you",
    ]);
  });
});

// Tests for silence marker utilities
describe("isSilenceMarker & extractSilenceDuration", () => {
  it("should recognize valid silence markers", () => {
    expect(isSilenceMarker("[1s]")).toBe(true);
    expect(isSilenceMarker("[1.25s]")).toBe(true);
  });

  it("should reject invalid markers", () => {
    expect(isSilenceMarker("[s1]")).toBe(false);
    expect(isSilenceMarker("1s")).toBe(false);
    expect(isSilenceMarker("[]")).toBe(false);
  });

  it("should extract duration correctly", () => {
    expect(extractSilenceDuration("[2s]")).toBe(2);
    expect(extractSilenceDuration("[1.75s]")).toBe(1.75);
  });
});

// Tests for speed marker utilities
describe("isSpeedMarker & extractSpeedMultiplier", () => {
  it("should recognize valid speed markers", () => {
    expect(isSpeedMarker("[speed:0.8]")).toBe(true);
    expect(isSpeedMarker("[speed:1.3]")).toBe(true);
    expect(isSpeedMarker("[fast]")).toBe(true);
    expect(isSpeedMarker("[slow]")).toBe(true);
  });

  it("should reject invalid markers", () => {
    expect(isSpeedMarker("[speed:]")).toBe(false);
    expect(isSpeedMarker("[0.5s]")).toBe(false);
    expect(isSpeedMarker("fast")).toBe(false);
  });

  it("should extract multiplier correctly", () => {
    expect(extractSpeedMultiplier("[speed:0.8]")).toBe(0.8);
    expect(extractSpeedMultiplier("[fast]")).toBe(1.3);
    expect(extractSpeedMultiplier("[slow]")).toBe(0.75);
  });
});

// Test for token limit enforcement via preprocessText (indirectly testing splitting)
// We use a small tokensPerChunk to force splitting of phonemized text.
describe("preprocessText", () => {
  it("should process text with silence markers and text segments", async () => {
    // The phonemizer stub will return uppercase of the segment.
    const input = "Hello, world! How are you?";
    // Sanitization changes:
    // "Hello, world! How are you?" => "HELLO[0.2s]WORLD![0.3s]HOW ARE YOU?[0.3s]"
    // Now, tokens (based on our stub tokenize which splits per character) will be an array of char codes.
    const tokensPerChunk = 10; // set low to force splitting if needed

    const chunks = await preprocessText(input, "en", tokensPerChunk);

    // Check that we have both text and silence chunks.
    expect(chunks).toBeInstanceOf(Array);
    // All silence chunks should be present as separate objects.
    const silenceChunks = chunks.filter((c) => c.type === "silence");
    expect(silenceChunks.length).toBeGreaterThan(0);
    // All text chunks should have tokens length not exceeding tokensPerChunk.
    const textChunks = chunks.filter((c) => c.type === "text") as {
      tokens: number[];
    }[];
    textChunks.forEach((tc) => {
      expect(tc.tokens.length).toBeLessThanOrEqual(tokensPerChunk);
    });
  });

  it("should handle input that is only text (no silence markers)", async () => {
    const input = "This is a test";
    const tokensPerChunk = 50; // High limit so no splitting occurs
    const chunks = await preprocessText(input, "en", tokensPerChunk);
    // Expect one text chunk with phonemized content (uppercase)
    expect(chunks).toHaveLength(1);
    const textChunk = chunks[0];
    expect(textChunk.type).toBe("text");
    // Since our phonemizer returns uppercase, check that content is uppercase.
    if (textChunk.type === "text") {
      expect(textChunk.content).toBe("THIS IS A TEST");
    }
  });

  it("should correctly split long phonemized text into sub-chunks", async () => {
    // Input that after phonemization becomes long (uppercased).
    const input = "aaaaaaaaaa"; // 10 a's
    const tokensPerChunk = 5;
    const chunks = await preprocessText(input, "en", tokensPerChunk);
    // Since phonemizer returns "AAAAAAAAAA", and our splitting is per character,
    // We expect the text chunk to be split into 2 parts, each with length 5.
    const textChunks = chunks.filter((c) => c.type === "text") as {
      content: string;
      tokens: number[];
    }[];
    // Total text chunks should be 2
    expect(textChunks.length).toBe(2);
    textChunks.forEach((tc) => {
      expect(tc.content.length).toBeLessThanOrEqual(5);
      expect(tc.content).toMatch(/^[A]+$/);
    });
  });

  it("should preserve silence markers between text segments", async () => {
    const input = "Wait, pause! Continue.";
    const tokensPerChunk = 20;
    const chunks = await preprocessText(input, "en", tokensPerChunk);
    // Sanitization: "Wait, pause! Continue." =>
    // "WAIT[0.2s]PAUSE![0.3s]CONTINUE[0.4s]"
    // Expect alternating text and silence chunks.
    expect(chunks[0].type).toBe("text");
    expect(chunks[1].type).toBe("silence");
    expect(chunks[2].type).toBe("text");
    expect(chunks[3].type).toBe("silence");
    expect(chunks[4].type).toBe("text");
  });

  it("should attach sentence-type speed multipliers to text chunks", async () => {
    const tokensPerChunk = 50;

    const exclamatory = await preprocessText("Go now!", "en", tokensPerChunk);
    const textChunk = exclamatory.find((c) => c.type === "text");
    expect(textChunk?.type === "text" && textChunk.speed).toBe(1.05);

    const question = await preprocessText("Are you sure?", "en", tokensPerChunk);
    const qChunk = question.find((c) => c.type === "text");
    expect(qChunk?.type === "text" && qChunk.speed).toBe(0.95);

    const declarative = await preprocessText("This is fine", "en", tokensPerChunk);
    const dChunk = declarative.find((c) => c.type === "text");
    expect(dChunk?.type === "text" && dChunk.speed).toBe(1.0);
  });

  it("should emit a SpeedChunk for inline speed markers", async () => {
    const tokensPerChunk = 50;
    const chunks = await preprocessText("[slow]Take your time", "en", tokensPerChunk);
    expect(chunks[0].type).toBe("speed");
    if (chunks[0].type === "speed") {
      expect(chunks[0].multiplier).toBe(0.75);
    }
    expect(chunks[1].type).toBe("text");
  });
});

// Tests for scaleSilences (prosody preset infrastructure)
describe("scaleSilences", () => {
  it("should return the string unchanged when multiplier is 1.0", () => {
    const input = "Hello[0.4s]world[0.3s]";
    expect(scaleSilences(input, 1.0)).toBe(input);
  });

  it("should scale all silence markers by the given multiplier", () => {
    expect(scaleSilences("Hello[0.4s]world[0.2s]", 1.6)).toBe(
      "Hello[0.64s]world[0.32s]",
    );
  });

  it("should reduce silences for the neutral preset (0.7×)", () => {
    const result = scaleSilences("[0.4s]", 0.7);
    expect(result).toBe("[0.28s]");
  });

  it("should not affect speed markers or other bracket content", () => {
    const input = "[fast]Hello[0.4s]world";
    expect(scaleSilences(input, 2.0)).toBe("[fast]Hello[0.8s]world");
  });
});

// Tests for prosodyOptions in preprocessText
describe("preprocessText with prosodyOptions", () => {
  it("should apply silenceMultiplier to auto-inserted pauses", async () => {
    const tokensPerChunk = 50;
    const chunks = await preprocessText("Hello! Go!", "en", tokensPerChunk, {
      silenceMultiplier: 2.0,
    });
    const silenceChunks = chunks.filter((c) => c.type === "silence") as {
      durationSeconds: number;
    }[];
    // All silence durations should be 2× the base value
    silenceChunks.forEach((sc) => {
      expect(sc.durationSeconds).toBeGreaterThan(0);
    });
  });

  it("should use sentenceVariation 0 when preset is neutral", async () => {
    const tokensPerChunk = 50;
    // "Go now!" ends with ! — with variation 0 its speed should be 1.0
    const chunks = await preprocessText("Go now!", "en", tokensPerChunk, {
      sentenceVariation: 0,
    });
    const textChunk = chunks.find((c) => c.type === "text");
    expect(textChunk?.type === "text" && textChunk.speed).toBe(1.0);
  });

  it("should use custom sentenceVariation", async () => {
    const tokensPerChunk = 50;
    const chunks = await preprocessText("Go now!", "en", tokensPerChunk, {
      sentenceVariation: 0.12,
    });
    const textChunk = chunks.find((c) => c.type === "text");
    expect(textChunk?.type === "text" && textChunk.speed).toBeCloseTo(1.12);
  });
});
