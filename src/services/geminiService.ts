import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTransaction } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function cleanSpeechInput(input: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The following text is from a speech-to-text system in a noisy Ghanaian market. 
    The user might be speaking Twi, Ga, Ewe, Hausa, English, or a mix.
    Clean it up by removing background noise, filler words, and focusing on the dominant voice's intent.
    Keep the original language and phrasing as much as possible, just remove the "noise".
    
    Input: "${input}"
    
    Output only the cleaned text. If it's pure noise or unintelligible, return "noise".
    `,
  });
  return response.text.trim();
}

export async function speakText(text: string): Promise<void> {
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error("TTS failed");
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    await audio.play();
  } catch (error) {
    console.error("Playback error:", error);
    // Fallback to browser TTS if ElevenLabs fails
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}

export async function parseTransaction(input: string): Promise<ParsedTransaction | null> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a multi-lingual financial parser for Ghanaian market women. 
    Input: "${input}"
    
    Tasks:
    1. Detect the language (Twi, Ga, Ewe, Hausa, English, or Mixed).
    2. Translate the intent to English internally for data extraction.
    3. Understand local measures: olonka, crate, paint bucket, etc.
    4. Generate a warm, friendly response in the SAME language as the user.
    
    Response Rules:
    - If Twi: "Hm... wode sika pii adi dwuma nnɛ." (if high expense) or "Woatɔn [item] GHS [amount]. Eye!"
    - If English: "Recorded. You sold [item] for GHS [amount]."
    - Use natural, non-robotic phrasing for the detected language.
    - Ensure correct pronunciation of GHS as "cedis" when read aloud.
    
    Output JSON with:
    - type: "income" or "expense"
    - item: string (optional)
    - quantity: number (optional)
    - unit: string (optional)
    - amount: number (GHS)
    - category: "business" or "personal" (default "business")
    - isDebt: boolean (true if it's a credit sale or someone owes money)
    - debtorName: string (optional, if isDebt is true)
    - language: string (detected language name)
    - response: string (the friendly acknowledgment in the detected language)
    
    Examples:
    "Me tɔn tomato 50" -> { type: "income", item: "tomato", amount: 50, category: "business", language: "Twi", response: "Woatɔn tomato GHS 50. Eye paa!" }
    "I bought oil for 20" -> { type: "expense", item: "oil", amount: 20, category: "business", language: "English", response: "Recorded. You spent GHS 20 on oil." }
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ["income", "expense"] },
          item: { type: Type.STRING },
          quantity: { type: Type.NUMBER },
          unit: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          category: { type: Type.STRING, enum: ["business", "personal"] },
          isDebt: { type: Type.BOOLEAN },
          debtorName: { type: Type.STRING },
          language: { type: Type.STRING },
          response: { type: Type.STRING }
        },
        required: ["type", "amount", "language", "response"]
      }
    }
  });

  try {
    return JSON.parse(response.text) as ParsedTransaction;
  } catch (e) {
    console.error("Failed to parse transaction", e);
    return null;
  }
}

export async function getAkosuaAdvice(transactions: any[], debts: any[], language: string = "English"): Promise<string> {
  const summary = transactions.map(t => `${t.type}: GHS ${t.amount} (${t.item || 'no item'})`).join('\n');
  const debtSummary = debts.map(d => `${d.name} owes GHS ${d.amount - d.paidAmount}`).join('\n');

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are AKOSUA, a friendly Ghanaian market woman and financial advisor.
    Give short, friendly advice in ${language} based on these transactions today:
    ${summary}
    
    And these debts:
    ${debtSummary}
    
    Rules:
    - Respond in ${language}.
    - Short sentences.
    - No financial jargon.
    - Friendly tone.
    - Use local style (e.g., "Hm...", "Good job").
    - Warn if overspending or mixing business/personal money.
    - Encourage debt collection.
    - Ensure correct pronunciation of GHS as "cedis" when read aloud.
    `,
  });

  return response.text;
}
