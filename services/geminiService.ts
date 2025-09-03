import { GoogleGenAI, Type } from "@google/genai";
import type { EditDecision, AudioAnalysis, ClipMetadata, CreativeRationale } from "../types";

let ai: GoogleGenAI | null = null;

// This function lazily initializes the GoogleGenAI client,
// preventing the app from crashing on load if the API key is missing.
const getGenAI = (): GoogleGenAI => {
    if (ai) {
        return ai;
    }

    // --- CRITICAL SECURITY WARNING ---
    // The Gemini API key is being exposed on the client-side.
    // This is a major security risk. In a production environment,
    // this key MUST be secured on a server-side proxy. The client
    // should make requests to your server, which then securely
    // communicates with the Gemini API.
    // Do NOT deploy this application to the public with the key
    // exposed like this.
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("API_KEY environment variable not set. Please configure your API key.");
    }

    ai = new GoogleGenAI({ apiKey: API_KEY });
    return ai;
}

const model = 'gemini-2.5-flash';

// Helper function to convert a File to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            // remove 'data:*/*;base64,' prefix
            const base64 = result.split(',')[1];
            if (!base64) {
                reject(new Error("Failed to read file as base64."));
            } else {
                resolve(base64);
            }
        };
        reader.onerror = error => reject(error);
    });
};

export const describeMusic = async (audioFile: File): Promise<string> => {
    const genAI = getGenAI();
    const base64Audio = await fileToBase64(audioFile);
    
    const audioPart = {
        inlineData: {
            mimeType: audioFile.type,
            data: base64Audio,
        },
    };

    const prompt = `Analyze this audio file and provide a concise, evocative description of its mood, genre, and tempo. This description will be used to guide the creation of a music video. Keep it to one sentence. Example: "Energetic hyper-pop with a fast beat, perfect for quick cuts and flashy visuals."`;

    try {
        const response = await genAI.models.generateContent({
            model: model,
            contents: {
                parts: [
                    { text: prompt },
                    audioPart
                ]
            }
        });
        
        const text = response.text.trim();
        if (!text) {
            throw new Error("AI returned an empty description. Please try again or describe the music manually.");
        }
        return text;
    } catch (error) {
        console.error("Error calling Gemini API for audio description:", error);
        throw new Error("Failed to get an AI description for the audio. The model might be temporarily unavailable or the file could not be processed. You can describe the vibe manually.");
    }
};

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        editDecisions: {
            type: Type.ARRAY,
            description: "The array of video editing cuts, forming the final video sequence.",
            items: {
                type: Type.OBJECT,
                properties: {
                    clipIndex: {
                        type: Type.INTEGER,
                        description: 'The 0-based index of the video clip to use from the provided clips.'
                    },
                    duration: {
                        type: Type.NUMBER,
                        description: 'How long this clip should play, in seconds.'
                    },
                    description: {
                        type: Type.STRING,
                        description: 'A very concise (5-10 words) justification for this edit, linking visual to audio.'
                    }
                },
                required: ["clipIndex", "duration", "description"]
            }
        },
        creativeRationale: {
            type: Type.OBJECT,
            description: "The director's commentary explaining the creative process.",
            properties: {
                overallTheme: {
                    type: Type.STRING,
                    description: "A summary of the video's main theme, mood, or aesthetic."
                },
                pacingStrategy: {
                    type: Type.STRING,
                    description: "How the editing pace changes throughout the video to match the music's energy."
                },
                colorPalette: {
                    type: Type.STRING,
                    description: "Description of the visual color choices, grading, or overall visual style."
                },
                timeline: {
                    type: Type.ARRAY,
                    description: "A chronological breakdown of the editing decisions with detailed explanations.",
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            startTime: {
                                type: Type.NUMBER,
                                description: "The start time of this segment in seconds."
                            },
                            endTime: {
                                type: Type.NUMBER,
                                description: "The end time of this segment in seconds."
                            },
                            clipIndex: {
                                type: Type.INTEGER,
                                description: "The 0-based index of the video clip used for this segment."
                            },
                            rationale: {
                                type: Type.STRING,
                                description: "A detailed explanation for choosing this clip at this time, linking it to specific musical elements like rhythm, mood, energy level, or structure (e.g., 'to emphasize the chorus')."
                            }
                        },
                        required: ["startTime", "endTime", "clipIndex", "rationale"]
                    }
                }
            },
            required: ["overallTheme", "pacingStrategy", "colorPalette", "timeline"]
        }
    },
    required: ["editDecisions", "creativeRationale"]
};



const generateContentAwarePrompt = (
    musicDescription: string,
    audioAnalysis: AudioAnalysis,
    clips: ClipMetadata[]
): string => {
    const formattedEnergySegments = audioAnalysis.energySegments.map(segment => 
        `- From ${segment.startTime.toFixed(1)}s to ${segment.endTime.toFixed(1)}s: The music has ${segment.intensity.toUpperCase()} energy.`
    ).join('\n');

    const formattedVisualSummary = clips.map((clip, index) => {
        if (!clip.analysis) {
            return `Clip ${index} (${clip.name}): [Analysis not available]`;
        }
        const { dominantCategory, hasFaces, motionLevel, avgBrightness, visualComplexity } = clip.analysis;
        const brightnessDesc = avgBrightness > 0.6 ? 'bright' : avgBrightness < 0.4 ? 'dark' : 'medium-lit';
        const complexityDesc = visualComplexity > 0.6 ? 'visually complex' : visualComplexity < 0.4 ? 'visually simple' : 'moderately complex';
        const faceDesc = hasFaces ? 'Contains faces. ' : '';
        const motionDesc = motionLevel === 'static' ? 'A static shot' : `A shot with ${motionLevel} motion`;

        return `Clip ${index} (${clip.name}): A ${brightnessDesc}, ${complexityDesc} clip. ${motionDesc}, primarily featuring ${dominantCategory}. ${faceDesc}`;
    }).join('\n');

    const directorialMandate = `
You are an astute and empathetic music video director. Your task is to generate a complete music video plan, including both the final edit decisions and a detailed "Director's Commentary" explaining your creative process.
Analyze the provided audio and video data with the following directives:

1.  **Semantic Coherence is Paramount:** Create meaningful connections between the music's emotion and the visuals' content. The 'why' is as important as the 'what'.
2.  **Narrative Flow:** The sequence of clips must feel intentional, guiding the viewer through the song's journey. Match visual energy (motion, complexity) to musical energy (from the energy segments).
3.  **Rhythmic Editing:** Ensure cuts are synchronized with the beat and musical phrasing. Vary the cutting pace based on the song's intensity.
`;

    return `
${directorialMandate}

---

### PROJECT BRIEF ###

**AUDIO TRACK ANALYSIS:**
-   **General Vibe:** "${musicDescription}"
-   **Total Duration:** ${audioAnalysis.duration.toFixed(1)} seconds.
-   **Tempo:** ${audioAnalysis.bpm.toFixed(0)} BPM.
-   **Emotional & Structural Arc (Energy Segments):**
${formattedEnergySegments}

**AVAILABLE VIDEO CLIPS (${clips.length} total):**
${formattedVisualSummary}

---

### YOUR TASK ###

Generate a single JSON object that strictly adheres to the provided schema. This object will contain two main parts: 'editDecisions' and 'creativeRationale'.

**Part 1: 'editDecisions'**
-   Create a JSON array of edit decisions to construct the video.
-   The total duration of all clips in this array MUST sum to approximately ${audioAnalysis.duration.toFixed(1)} seconds.
-   'clipIndex' must be a valid 0-based index (from 0 to ${clips.length - 1}).
-   'description' must be a very concise (5-10 words) justification.

**Part 2: 'creativeRationale'**
-   **Global Strategy:** In 'overallTheme', 'pacingStrategy', and 'colorPalette', explain your high-level artistic choices for the entire video.
-   **Timeline Breakdown:** Create a 'timeline' array that documents your process. For EACH decision in the 'editDecisions' array, create a corresponding entry here.
    -   Calculate and provide the 'startTime' and 'endTime' for each segment.
    -   Provide a detailed 'rationale' explaining WHY you chose that specific clip for that specific moment, linking it directly to the song's characteristics (e.g., "Used a high-motion clip here to match the song's high-energy chorus from 15s to 30s," or "Selected a calm nature shot to reflect the quiet introspection of the bridge.").
`;
};


export const createVideoSequence = async (
  musicDescription: string,
  audioAnalysis: AudioAnalysis,
  clips: ClipMetadata[],
): Promise<{ editDecisionList: EditDecision[], creativeRationale: CreativeRationale }> => {
    
  const genAI = getGenAI();
  const prompt = generateContentAwarePrompt(musicDescription, audioAnalysis, clips);
  
  const imageParts = clips.map(clip => ({
      inlineData: {
          mimeType: 'image/jpeg',
          data: clip.thumbnail,
      }
  }));

  try {
    const response = await genAI.models.generateContent({
        model: model,
        contents: {
            parts: [
                { text: prompt },
                ...imageParts
            ]
        },
        config: {
            responseMimeType: "application/json",
            responseSchema: responseSchema,
            maxOutputTokens: 32768,
            thinkingConfig: { thinkingBudget: 1024 },
        }
    });

    const text = response.text.trim();
    let parsedJson;
    try {
        parsedJson = JSON.parse(text);
    } catch (e) {
        console.error("Failed to parse Gemini response as JSON:", text);
        throw new Error("The AI returned a response in an unexpected format. This is often a temporary issue, please try generating again.");
    }
    
    if (!parsedJson.editDecisions || !parsedJson.creativeRationale || !Array.isArray(parsedJson.editDecisions)) {
        throw new Error("AI response is missing the required 'editDecisions' or 'creativeRationale' structure.");
    }
    
    // Repair and validate the AI's response to be more resilient
    const repairedAndValidatedDecisions: EditDecision[] = parsedJson.editDecisions
        .map((item: any) => {
            if (typeof item?.clipIndex !== 'number' || typeof item?.duration !== 'number' || item.duration <= 0 || typeof item?.description !== 'string') {
                return null;
            }
            const repairedIndex = Math.abs(item.clipIndex) % clips.length;
            return {
                clipIndex: repairedIndex,
                duration: item.duration,
                description: item.description,
            };
        })
        .filter((item): item is EditDecision => item !== null);


    if (repairedAndValidatedDecisions.length === 0) {
        throw new Error("The AI failed to generate a valid video sequence. Please try again with different clips or a clearer description.");
    }
    
    return {
        editDecisionList: repairedAndValidatedDecisions,
        creativeRationale: parsedJson.creativeRationale
    };

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error && error.message.includes("SAFETY")) {
        throw new Error("The request was blocked due to safety policies. Please try different clips or a different description.")
    }
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("The AI was unable to create a video sequence. This could be due to a temporary network issue or an internal error. Please try again.");
  }
};
