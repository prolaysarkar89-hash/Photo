import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Identifies which photos in the candidate list match the person in the reference photos.
 * Using gemini-2.5-flash for speed and multimodal capabilities.
 * 
 * @param referencePhotosBase64 Array of base64 strings (multiple angles of the reference person)
 * @param candidatePhotosBase64 Array of base64 strings (photos to check)
 */
export const findFaceMatches = async (
  referencePhotosBase64: string[],
  candidatePhotosBase64: string[]
): Promise<number[]> => {
  if (candidatePhotosBase64.length === 0) return [];

  try {
    // Construct the parts array.
    // Parts 0 to R-1: Reference Images (Multi-angle)
    // Parts R to N: Candidate Images
    // Last Part: Text Prompt
    
    const parts: any[] = [];

    // Add Reference Images
    referencePhotosBase64.forEach(base64 => {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64
        }
      });
    });

    // Add Candidate Images
    candidatePhotosBase64.forEach(base64 => {
      parts.push({
        inlineData: {
          mimeType: 'image/jpeg',
          data: base64
        }
      });
    });

    // Instructions
    const refCount = referencePhotosBase64.length;
    const candCount = candidatePhotosBase64.length;
    
    const prompt = `
      The first ${refCount} images are the REFERENCE PERSON (showing different angles: front, sides, expressions).
      The subsequent ${candCount} images are CANDIDATE EVENT PHOTOS (indexed 0 to ${candCount - 1}).
      
      Your task: Identify which of the candidate images contain the person shown in the reference images.
      
      CRITICAL INSTRUCTIONS:
      1. Use ALL reference angles to build a complete mental model of the person's face.
      2. The person might be further away, in a group, or in different lighting in the candidate photos.
      3. Ignore background people. Focus on matching the specific facial features of the reference person.
      
      Return a JSON object with a single key "matches" which is an array of integers representing the indices of the matching candidate images.
      The indices should be relative to the candidate list (0 to ${candCount - 1}).
      Example: If the 1st and 3rd candidate images match, return {"matches": [0, 2]}.
      If no matches found, return {"matches": []}.
    `;

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            matches: {
              type: Type.ARRAY,
              items: { type: Type.INTEGER },
              description: "Indices of candidate images that match the reference face."
            }
          }
        }
      }
    });

    const resultText = response.text;
    if (!resultText) return [];

    const result = JSON.parse(resultText);
    return result.matches || [];

  } catch (error) {
    console.error("Gemini Face Match Error:", error);
    return [];
  }
};