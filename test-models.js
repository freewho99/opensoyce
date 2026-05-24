import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey });

async function run(model) {
  try {
    console.log(`Testing model: ${model}...`);
    const response = await ai.models.generateContent({
      model: model,
      contents: 'Hello, respond with exactly "success"',
    });
    console.log(`Result for ${model}:`, response.text.trim());
    return true;
  } catch (err) {
    console.error(`Error for ${model}:`, err.message || err);
    return false;
  }
}

async function main() {
  const models = [
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash-preview',
    'gemini-2.5-pro'
  ];
  for (const m of models) {
    const ok = await run(m);
    if (ok) {
      console.log(`🎉 Model ${m} is working and has quota!`);
    }
  }
}

main();
