import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Testing with API key present:', !!apiKey);

const ai = new GoogleGenAI({ apiKey });

async function run() {
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
  for (const model of models) {
    try {
      console.log(`Trying model: ${model}...`);
      const res = await ai.models.generateContent({
        model,
        contents: 'Say OK',
      });
      console.log(`Model ${model} SUCCESS:`, res.text);
      return model;
    } catch (e) {
      console.log(`Model ${model} FAILED:`, e.message);
    }
  }
}

run().catch(console.error);
