import {
  parseInventoryTextLocally,
  type ImportedRecipe,
  type SmartInventoryItem,
} from '@/data/ai-import';
import { aiRequestHeaders } from '@/services/ai-auth-client';

type AnalyzeResponse<T> = { result: T; source: 'openai' | 'local' };

async function postAnalysis<T>(body: unknown, timeoutMs = 35_000): Promise<AnalyzeResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('/ai/analyze-import', {
      method: 'POST',
      headers: await aiRequestHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI analysis failed with ${response.status}`);
    return await response.json() as AnalyzeResponse<T>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function analyzeInventoryText(text: string): Promise<AnalyzeResponse<SmartInventoryItem[]>> {
  try {
    return await postAnalysis<SmartInventoryItem[]>({ mode: 'ingredients-text', text }, 8_000);
  } catch {
    return { result: parseInventoryTextLocally(text), source: 'local' };
  }
}

export function analyzeRecipeImage(imageDataUrl: string) {
  return postAnalysis<ImportedRecipe>({ mode: 'recipe-image', imageDataUrl });
}

export function analyzeReceiptImage(imageDataUrl: string) {
  return postAnalysis<SmartInventoryItem[]>({ mode: 'receipt-image', imageDataUrl });
}

export function analyzeRecipeLink(url: string) {
  return postAnalysis<ImportedRecipe>({ mode: 'recipe-link', url });
}
