
import type { EditDecision, AudioAnalysis, ClipMetadata, CreativeRationale } from "../types";
import { resizeBlobToMaxBytes, blobToBase64 } from './imageUtils';
import { getGenAI } from './geminiClient';

const model = "gemini-2.5-flash";

/* Config / limits */
const TIMEOUT_MS = 90_000; // Increased timeout for streaming
const MAX_TOTAL_THUMBNAILS_BYTES = 1_000_000; // 1 MB
const PER_THUMBNAIL_TARGET_BYTES = 50 * 1024; // 50 KB
const MAX_OUTPUT_TOKENS = 8192;

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

const base64ToBlob = async (base64: string, mimeType: string = 'image/jpeg'): Promise<Blob> => {
    const res = await fetch(`data:${mimeType};base64,${base64}`);
    return await res.blob();
};

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
  return decisions.map(d => {
    const newDur = Math.max(0.1, Math.round(d.duration * scale * 100) / 100);
    return { ...d, duration: newDur };
  });
}

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

  const directorialMandate = `You are an experienced music video director.`;

  return `
${directorialMandate}

First, you MUST provide a few short status updates on new lines, each ending with an ellipsis. For example:
Analyzing music...
Reviewing visual content...
Generating edit decisions...

Then, after the updates, you MUST provide the final JSON object in a single markdown code block.

AUDIO SUMMARY:
- Vibe: "${musicDescription}"
- Duration: ${audioAnalysis.duration.toFixed(1)}s
- Tempo: ${audioAnalysis.bpm.toFixed(0)} BPM
Energy segments:
${formattedEnergySegments}

Available clips (${clips.length}):
${formattedVisualSummary}

OUTPUT REQUIREMENTS:
- Your entire response MUST end with a single JSON object inside a \`\`\`json markdown block.
- The JSON object must contain 'editDecisions' and 'creativeRationale'.
- 'editDecisions' durations should sum roughly to the audio duration (${audioAnalysis.duration.toFixed(1)}s).
- For each decision provide clipIndex, duration (seconds), and a short 5-10 word description.
- Provide a 'creativeRationale' with overallTheme, pacingStrategy, colorPalette and a timeline array that explains each segment.
`;
};

export const createVideoSequence = async (
  musicDescription: string,
  audioAnalysis: AudioAnalysis,
  clips: ClipMetadata[],
  onProgress: (update: string) => void,
): Promise<{ editDecisionList: EditDecision[]; creativeRationale: CreativeRationale }> => {
  if (!clips || clips.length === 0) {
    throw new Error("Cannot generate a video sequence with no video clips provided.");
  }
  
  const genAI = getGenAI();
  const prompt = generateContentAwarePrompt(musicDescription, audioAnalysis, clips);

  let totalThumbnailBytes = 0;
  const imagePartsPromises = clips.map(async (clip) => {
      const thumbBlob = await base64ToBlob(clip.thumbnail);
      const targetBytes = (totalThumbnailBytes + thumbBlob.size > MAX_TOTAL_THUMBNAILS_BYTES)
          ? PER_THUMBNAIL_TARGET_BYTES
          : thumbBlob.size;
      
      const resizedBlob = await resizeBlobToMaxBytes(thumbBlob, targetBytes);
      const resizedBase64 = await blobToBase64(resizedBlob);
      totalThumbnailBytes += base64Bytes(resizedBase64);
      return { inlineData: { mimeType: "image/jpeg", data: resizedBase64 } };
  });

  const imageParts = await Promise.all(imagePartsPromises);
  
  if (totalThumbnailBytes > MAX_TOTAL_THUMBNAILS_BYTES) {
    console.warn(`Total thumbnail size (${totalThumbnailBytes} bytes) still exceeds limit of ${MAX_TOTAL_THUMBNAILS_BYTES}.`);
  }

  let fullResponseText = '';
  const startTime = Date.now();

  try {
    const responseStream = await genAI.models.generateContentStream({
      model,
      contents: {
        parts: [
          { text: prompt },
          ...imageParts
        ]
      },
      config: {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: 0.7,
      }
    });

    for await (const chunk of responseStream) {
        if (Date.now() - startTime > TIMEOUT_MS) {
            throw new Error("AI generation timed out.");
        }
        const chunkText = chunk.text;
        if(chunkText) {
          fullResponseText += chunkText;
          onProgress(chunkText);
        }
    }
    
    if (!fullResponseText) {
      throw new Error("AI returned an empty response. Try again with different inputs or fewer thumbnails.");
    }
    
    const jsonMatch = fullResponseText.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch || !jsonMatch[1]) {
        console.error("Could not find JSON block in response:", fullResponseText);
        throw new Error("The AI returned a response in an unexpected format. Please try again.");
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.error("Failed to parse model response as JSON:", jsonMatch[1]);
      throw new Error("The AI returned invalid JSON. Try again; if this repeats, simplify inputs.");
    }

    const validation = validateParsedResponse(parsedJson);
    if (!validation.ok) {
      console.error("Model response validation error:", validation.reason, parsedJson);
      throw new Error(`AI response validation failed: ${validation.reason}`);
    }

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
        return { clipIndex: repairedIndex, duration, description } as EditDecision;
      })
      .filter((x): x is EditDecision => x !== null);

    if (repairedAndValidatedDecisions.length === 0) {
      throw new Error("The AI failed to produce valid edit decisions. Try again with different clips or a simpler prompt.");
    }

    const normalized = normalizeDurations(repairedAndValidatedDecisions, audioAnalysis.duration);

    return {
      editDecisionList: normalized,
      creativeRationale: parsedJson.creativeRationale as CreativeRationale,
    };
  } catch (error) {
    console.error("Error in createVideoSequence:", error instanceof Error ? error.message : error);
    if (error instanceof Error && error.message.toLowerCase().includes("safety")) {
      throw new Error("The request was blocked by safety policies. Try different clips or a different description.");
    }
    throw error instanceof Error ? error : new Error("AI generation failed unexpectedly.");
  }
};

export const describeMusic = async (audioFile: File): Promise<string> => {
  const genAI = getGenAI();
  const base64Audio = await fileToBase64(audioFile);

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

    const response = await call;
    // Fix: The 'text' property on GenerateContentResponse is a non-nullable string.
    const text = response.text.trim();
    if (!text) {
      console.error("AI response for audio description was empty or missing. Full response object:", JSON.stringify(response, null, 2));
      throw new Error("AI returned an empty description. This could be due to safety filters.");
    }
    return text;
  } catch (err) {
    console.error("Error calling AI for audio description:", err instanceof Error ? err.message : err);
    if (err instanceof Error && err.message.toLowerCase().includes("safety")) {
      throw new Error("The request was blocked by safety policies. Try a different audio file.");
    }
    throw err instanceof Error ? err : new Error("Failed to get an AI description for the audio.");
  }
};
