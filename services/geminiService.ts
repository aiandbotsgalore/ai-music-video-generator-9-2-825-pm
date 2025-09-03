import { GoogleGenAI, Type } from "@google/genai";
import type { EditDecision, AudioAnalysis, ClipMetadata, CreativeRationale } from "../types";

let ai: GoogleGenAI | null = null;

const getGenAI = (): GoogleGenAI => {
  if (ai) return ai;
  // Lazy init; caller is expected to configure environment/build to make this work.
  const API_KEY = (process.env as any).API_KEY;
  if (!API_KEY) {
    throw new Error("API_KEY environment variable not set. Please configure your API key.");
  }
  ai = new GoogleGenAI({ apiKey: API_KEY });
  return ai;
};

const model = "gemini-2.5-flash";

/* Config / limits */
const TIMEOUT_MS = 60_000; // 60s timeout for the AI call
const MAX_TOTAL_THUMBNAILS_BYTES = 1_000_000; // 1 MB for all thumbnails combined
const MAX_TOTAL_PAYLOAD_BYTES = 2_000_000; // 2 MB total payload safeguard
const MAX_OUTPUT_TOKENS = 8192; // reasonable upper bound for responses

/* --- Helpers --- */
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string | null;
      if (!result) return reject(new Error("Failed to read file."));
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1) : result;
      if (!base64) return reject(new Error("Failed to read file as base64."));
      resolve(base64);
    };
    reader.onerror = (e) => reject(e);
  });

const ensureBase64Data = (maybeDataUrlOrBase64: string | undefined | null): string => {
  if (!maybeDataUrlOrBase64) return "";
  const s = maybeDataUrlOrBase64.trim();
  const comma = s.indexOf(",");
  return comma >= 0 ? s.slice(comma + 1) : s;
};

// Estimate bytes from base64 string (approx)
const base64Bytes = (b64: string) => Math.ceil((b64.length * 3) / 4);

/* Lightweight runtime validation for the parsed JSON response */
function validateParsedResponse(obj: any): { ok: boolean; reason?: string } {
  if (!obj || typeof obj !== "object") return { ok: false, reason: "Response is not an object." };
  if (!Array.isArray(obj.editDecisions)) return { ok: false, reason: "'editDecisions' is missing or not an array." };
  if (!obj.creativeRationale || typeof obj.creativeRationale !== "object")
    return { ok: false, reason: "'creativeRationale' is missing or not an object." };

  for (let i = 0; i < obj.editDecisions.length; i++) {
    const d = obj.editDecisions[i];
    if (!d || typeof d !== "object") return { ok: false, reason: `editDecisions[${i}] is not an object.` };
    if (typeof d.clipIndex !== "number") return { ok: false, reason: `editDecisions[${i}].clipIndex is not a number.` };
    if (typeof d.duration !== "number" || d.duration <= 0) return { ok: false, reason: `editDecisions[${i}].duration is invalid.` };
    if (typeof d.description !== "string") return { ok: false, reason: `editDecisions[${i}].description is not a string.` };
  }

  // Timeline structure validation (if present)
  const timeline = obj.creativeRationale.timeline;
  if (!Array.isArray(timeline)) return { ok: false, reason: "'creativeRationale.timeline' missing or not an array." };
  for (let i = 0; i < timeline.length; i++) {
    const t = timeline[i];
    if (!t || typeof t !== "object") return { ok: false, reason: `timeline[${i}] is not an object.` };
    if (typeof t.startTime !== "number" || typeof t.endTime !== "number") return { ok: false, reason: `timeline[${i}] times invalid.` };
    if (typeof t.clipIndex !== "number") return { ok: false, reason: `timeline[${i}].clipIndex invalid.` };
    if (typeof t.rationale !== "string") return { ok: false, reason: `timeline[${i}].rationale invalid.` };
  }

  return { ok: true };
}

/* Clamp/repair logic for clipIndex */
const clampIndex = (n: number, maxExclusive: number) => {
  if (!Number.isFinite(n)) return 0;
  const floored = Math.floor(n);
  if (floored < 0) return 0;
  if (floored >= maxExclusive) return Math.max(0, maxExclusive - 1);
  return floored;
};

/* Normalize durations so total ≈ targetTotal (scale proportionally) */
function normalizeDurations(decisions: EditDecision[], targetTotal: number): EditDecision[] {
  const total = decisions.reduce((s, d) => s + Math.max(0.001, d.duration), 0);
  if (total <= 0.001 || targetTotal <= 0) return decisions;
  const scale = targetTotal / total;
  // Keep minimum duration and round to 2 decimal places
  return decisions.map(d => {
    const newDur = Math.max(0.1, Math.round(d.duration * scale * 100) / 100);
    return { ...d, duration: newDur };
  });
}

/* Timeout wrapper */
function withTimeout<T>(p: Promise<T>, ms: number, msg = "Timed out") {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg)), ms);
    p.then(v => {
      clearTimeout(t);
      resolve(v);
    }).catch(err => {
      clearTimeout(t);
      reject(err);
    });
  });
}

/* Response JSON schema for the model (kept as guidance in the request) */
const responseSchema = {
  type: Type.OBJECT,
  properties: {
    editDecisions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          clipIndex: { type: Type.INTEGER },
          duration: { type: Type.NUMBER },
          description: { type: Type.STRING },
        },
        required: ["clipIndex", "duration", "description"],
      },
    },
    creativeRationale: {
      type: Type.OBJECT,
      properties: {
        overallTheme: { type: Type.STRING },
        pacingStrategy: { type: Type.STRING },
        colorPalette: { type: Type.STRING },
        timeline: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startTime: { type: Type.NUMBER },
              endTime: { type: Type.NUMBER },
              clipIndex: { type: Type.INTEGER },
              rationale: { type: Type.STRING },
            },
            required: ["startTime", "endTime", "clipIndex", "rationale"],
          },
        },
      },
      required: ["overallTheme", "pacingStrategy", "colorPalette", "timeline"],
    },
  },
  required: ["editDecisions", "creativeRationale"],
};

/* Build prompt (unchanged in spirit; kept concise here) */
const generateContentAwarePrompt = (
  musicDescription: string,
  audioAnalysis: AudioAnalysis,
  clips: ClipMetadata[]
): string => {
  const formattedEnergySegments = audioAnalysis.energySegments
    .map(segment => `- From ${segment.startTime.toFixed(1)}s to ${segment.endTime.toFixed(1)}s: ${segment.intensity.toUpperCase()} energy.`)
    .join("\n");

  const formattedVisualSummary = clips.map((clip, index) => {
    if (!clip.analysis) return `Clip ${index} (${clip.name}): [Analysis not available]`;
    const { dominantCategory, hasFaces, motionLevel, avgBrightness, visualComplexity } = clip.analysis;
    const brightnessDesc = avgBrightness > 0.6 ? "bright" : avgBrightness < 0.4 ? "dark" : "medium-lit";
    const complexityDesc = visualComplexity > 0.6 ? "visually complex" : visualComplexity < 0.4 ? "visually simple" : "moderately complex";
    const faceDesc = hasFaces ? "Contains faces." : "";
    const motionDesc = motionLevel === "static" ? "A static shot" : `A shot with ${motionLevel} motion`;
    return `Clip ${index} (${clip.name}): A ${brightnessDesc}, ${complexityDesc} clip. ${motionDesc}, primarily featuring ${dominantCategory}. ${faceDesc}`;
  }).join("\n");

  const directorialMandate = `You are an experienced music video director. Produce a single JSON object (see schema) with 'editDecisions' and 'creativeRationale'. Make intentional connections between the music's energy and the chosen visuals. Synchronize cuts with beats and phrase changes.`;

  return `
${directorialMandate}

AUDIO SUMMARY:
- Vibe: "${musicDescription}"
- Duration: ${audioAnalysis.duration.toFixed(1)}s
- Tempo: ${audioAnalysis.bpm.toFixed(0)} BPM
Energy segments:
${formattedEnergySegments}

Available clips (${clips.length}):
${formattedVisualSummary}

OUTPUT REQUIREMENTS:
- Return ONE strict JSON object that matches the schema.
- 'editDecisions' durations should sum roughly to the audio duration (${audioAnalysis.duration.toFixed(1)}s).
- For each decision provide clipIndex, duration (seconds), and a short 5-10 word description.
- Provide a 'creativeRationale' with overallTheme, pacingStrategy, colorPalette and a timeline array that explains each segment.

Return only the JSON object in the response body (no extraneous commentary).
`;
};

/* Primary exported function */
export const createVideoSequence = async (
  musicDescription: string,
  audioAnalysis: AudioAnalysis,
  clips: ClipMetadata[],
): Promise<{ editDecisionList: EditDecision[]; creativeRationale: CreativeRationale }> => {
  const genAI = getGenAI();
  const prompt = generateContentAwarePrompt(musicDescription, audioAnalysis, clips);

  // Build image parts and enforce max payload size
  const imageParts: { inlineData: { mimeType: string; data: string } }[] = [];
  let thumbnailBytesTotal = 0;

  for (const clip of clips) {
    const b64 = ensureBase64Data(clip.thumbnail);
    const bytes = base64Bytes(b64);
    thumbnailBytesTotal += bytes;
    imageParts.push({ inlineData: { mimeType: "image/jpeg", data: b64 } });
  }

  const estimatedPayloadBytes = thumbnailBytesTotal; // we only estimate thumbnails here; audio handled elsewhere
  if (thumbnailBytesTotal > MAX_TOTAL_THUMBNAILS_BYTES || estimatedPayloadBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    throw new Error("Thumbnails are too large to send to the model directly. Reduce thumbnail size or upload them and provide URLs instead.");
  }

  try {
    // Prepare request. Use a timeout wrapper to avoid a stuck UI.
    const call = genAI.models.generateContent({
      model,
      contents: {
        parts: [
          { text: prompt },
          ...imageParts
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        thinkingConfig: { thinkingBudget: 512 },
      }
    });

    const response = await withTimeout(call as Promise<any>, TIMEOUT_MS, "AI generation timed out");

    // SDKs sometimes provide structured output. Prefer that if available.
    const rawText =
      response?.output?.[0]?.content?.[0]?.text ??
      response?.text ??
      (typeof response === "string" ? response : "");

    const text = String(rawText).trim();
    if (!text) {
      throw new Error("AI returned an empty response. Try again with different inputs or fewer thumbnails.");
    }

    // Parse JSON
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(text);
    } catch (e) {
      // If parsing fails, surface the error with a helpful message
      console.error("Failed to parse model response as JSON:", text);
      throw new Error("The AI returned a response in an unexpected format. Try again; if this repeats, simplify inputs.");
    }

    // Runtime validate
    const validation = validateParsedResponse(parsedJson);
    if (!validation.ok) {
      console.error("Model response validation error:", validation.reason, parsedJson);
      throw new Error(`AI response validation failed: ${validation.reason}`);
    }

    // Repair and normalize editDecisions
    const repairedAndValidatedDecisions: EditDecision[] = parsedJson.editDecisions
      .map((item: any) => {
        if (typeof item !== "object" || item == null) return null;
        const rawIndex = Number(item.clipIndex);
        const duration = Number(item.duration);
        const description = String(item.description || "").trim();
        if (!Number.isFinite(rawIndex) || !Number.isFinite(duration) || duration <= 0 || !description) {
          return null;
        }
        const repairedIndex = clampIndex(rawIndex, clips.length);
        return {
          clipIndex: repairedIndex,
          duration,
          description,
        } as EditDecision;
      })
      .filter((x): x is EditDecision => x !== null);

    if (repairedAndValidatedDecisions.length === 0) {
      throw new Error("The AI failed to produce valid edit decisions. Try again with different clips or a simpler prompt.");
    }

    // Normalize durations to match audio duration
    const normalized = normalizeDurations(repairedAndValidatedDecisions, audioAnalysis.duration);

    return {
      editDecisionList: normalized,
      creativeRationale: parsedJson.creativeRationale as CreativeRationale,
    };
  } catch (error) {
    console.error("Error in createVideoSequence:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.message.includes("SAFETY")) {
      throw new Error("The request was blocked by safety policies. Try different clips or a different description.");
    }
    if (error instanceof Error && error.message.includes("timed out")) {
      throw new Error("AI generation timed out. Try again or reduce payload size (smaller thumbnails).");
    }
    throw error instanceof Error ? error : new Error("AI generation failed unexpectedly.");
  }
};

/* Also export describeMusic (keeps existing behavior but enforces size limit on audio) */
export const describeMusic = async (audioFile: File): Promise<string> => {
  if (audioFile.size > 1_500_000) {
    // Conservative guidance: don't send large audio blobs directly.
    throw new Error("Audio file is too large to send directly. Upload a shorter sample or use a server-side proxy to handle the upload.");
  }

  const genAI = getGenAI();
  const base64Audio = await fileToBase64(audioFile);

  const audioBytes = base64Bytes(base64Audio);
  if (audioBytes > MAX_TOTAL_PAYLOAD_BYTES) {
    throw new Error("Audio payload is too large to send directly to the model. Please trim or upload audios via a server.");
  }

  const audioPart = {
    inlineData: {
      mimeType: audioFile.type || "audio/mpeg",
      data: base64Audio,
    },
  };

  const prompt = `Analyze this audio file and provide a concise, evocative description of its mood, genre, and tempo. Keep it to one sentence. Example: "Energetic hyper-pop with a fast beat, perfect for quick cuts and flashy visuals."`;

  try {
    const call = genAI.models.generateContent({
      model,
      contents: { parts: [{ text: prompt }, audioPart] },
      config: { maxOutputTokens: 256 },
    });

    const response = await withTimeout(call as Promise<any>, TIMEOUT_MS, "AI description timed out");
    const text = response?.output?.[0]?.content?.[0]?.text ?? response?.text ?? "";
    const trimmed = String(text).trim();
    if (!trimmed) throw new Error("AI returned an empty description.");
    return trimmed;
  } catch (err) {
    console.error("Error calling AI for audio description:", err instanceof Error ? err.message : err);
    throw err instanceof Error ? err : new Error("Failed to get an AI description for the audio.");
  }
};
