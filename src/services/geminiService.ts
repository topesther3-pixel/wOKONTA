import { GoogleGenAI, Type, Modality } from "@google/genai";
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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say warmly as a friendly Ghanaian market woman: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore is a warm voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      // Decode base64 to binary
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS returns raw 16-bit PCM at 24kHz
      const pcmData = new Int16Array(bytes.buffer);
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const audioBuffer = audioContext.createBuffer(1, pcmData.length, 24000);
      const channelData = audioBuffer.getChannelData(0);

      // Convert 16-bit PCM to float32 [-1, 1]
      for (let i = 0; i < pcmData.length; i++) {
        channelData[i] = pcmData[i] / 32768.0;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
    }
  } catch (error) {
    console.error("Gemini TTS error:", error);
    // Fallback to browser TTS
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

export async function getAkosuaAdvice(transactions: any[], debts: any[], language: string = "English", userMessage?: string): Promise<string> {
  const summary = transactions.map(t => `${t.type}: GHS ${t.amount} (${t.item || 'no item'})`).join('\n');
  const debtSummary = debts.map(d => `${d.name} owes GHS ${d.amount - d.paidAmount}`).join('\n');

  const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const profit = income - expense;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are AKOSUA, a friendly Ghanaian market woman and financial assistant for the WO Akontaa app.
    
    PERSONALITY:
    - Warm and friendly, like a local market woman.
    - Simple language (no big English).
    - Encouraging, not judgmental.
    - Can speak English, Twi, or Mixed language.
    
    DATA FOR TODAY:
    - Total Income: GHS ${income}
    - Total Expense: GHS ${expense}
    - Net Profit: GHS ${profit}
    - Transactions:
    ${summary}
    
    DEBTS (Who owes money):
    ${debtSummary || "No one owes you money right now."}
    
    USER MESSAGE: "${userMessage || "Give me some general advice"}"
    
    FAQ & SMART RULES:
    1. If asking about profit: Tell them the GHS ${profit}. If positive, say "You are doing well, but try to reduce spending small."
    2. If asking why not saving: "You are spending more than you earn. Try to reduce small small expenses and save at least GHS 5 every day."
    3. If losing money (expense > income): "Hm... it looks like your expenses are higher than your income. Let's try to cut down on unnecessary spending."
    4. If asking who owes money: List them from the data above. "Adjoa owes you GHS 20. Ama owes you GHS 15. Try to collect your money."
    5. If asking about today's spending: "You spent GHS ${expense} today. Try to reduce spending tomorrow."
    6. If asking "Should I buy this?": If expense > income or expense > 100, say "You have already spent a lot today. It's better to wait." Else: "You can buy, but don't overspend."
    7. If asking "Am I doing well?": If profit > 0, "You are doing well. Keep going!" Else: "You need to improve your spending habits."
    8. General advice: "Try to separate your business money from your personal money. Save small small every day."
    
    LOCAL LANGUAGE SUPPORT:
    - If user speaks Twi (e.g., "Me sika kɔ he?"), respond in Twi: "Hm... wo sika no rekɔ paa. Ma yɛn nhwɛ so yie."
    
    RULES:
    - Keep responses short and helpful.
    - Use simple words.
    - Encourage saving.
    - Be supportive.
    `,
  });

  return response.text;
}
