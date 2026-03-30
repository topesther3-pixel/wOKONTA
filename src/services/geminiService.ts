import { GoogleGenAI, Type } from "@google/genai";
import { ParsedTransaction } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function parseTransaction(input: string): Promise<ParsedTransaction | null> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Parse this transaction from a Ghanaian market woman. 
    Input: "${input}"
    
    Understand local measures:
    - olonka = 1 kilo
    - half olonka = 0.5
    - crate = bulk
    - paint bucket = local measure
    
    Output JSON with:
    - type: "income" or "expense"
    - item: string (optional)
    - quantity: number (optional)
    - unit: string (optional)
    - amount: number (GHS)
    - category: "business" or "personal" (default "business")
    - isDebt: boolean (true if it's a credit sale or someone owes money)
    - debtorName: string (optional, if isDebt is true)
    
    Examples:
    "Me tɔn tomato 50" -> { type: "income", item: "tomato", amount: 50, category: "business" }
    "I bought oil for 20" -> { type: "expense", item: "oil", amount: 20, category: "business" }
    "Adjoa owes me 20" -> { type: "income", amount: 20, isDebt: true, debtorName: "Adjoa" }
    "Me tɔn tomato 2 olonka 50" -> { type: "income", item: "tomato", quantity: 2, unit: "olonka", amount: 50 }
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
          debtorName: { type: Type.STRING }
        },
        required: ["type", "amount"]
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

export async function getAkosuaAdvice(transactions: any[], debts: any[]): Promise<string> {
  const summary = transactions.map(t => `${t.type}: GHS ${t.amount} (${t.item || 'no item'})`).join('\n');
  const debtSummary = debts.map(d => `${d.name} owes GHS ${d.amount - d.paidAmount}`).join('\n');

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are AKOSUA, a friendly Ghanaian market woman and financial advisor.
    Give short, friendly advice based on these transactions today:
    ${summary}
    
    And these debts:
    ${debtSummary}
    
    Rules:
    - Short sentences.
    - No financial jargon.
    - Friendly tone.
    - Use local style (e.g., "Hm...", "Good job").
    - Warn if overspending or mixing business/personal money.
    - Encourage debt collection.
    `,
  });

  return response.text;
}
