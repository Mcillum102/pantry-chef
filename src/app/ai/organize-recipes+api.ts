import {
  AI_RECIPE_CATEGORIES,
  isAiRecipeCategory,
  type RecipeClassification,
  type RecipeForOrganization,
} from '@/data/recipe-ai';
import { rejectUnauthenticated } from '@/services/ai-auth-server';

const MAX_RECIPES = 50;

function isRecipeInput(value: unknown): value is RecipeForOrganization {
  if (!value || typeof value !== 'object') return false;
  const recipe = value as Partial<RecipeForOrganization>;
  return (
    typeof recipe.id === 'string' && recipe.id.length <= 100 &&
    typeof recipe.name === 'string' && recipe.name.length <= 100 &&
    typeof recipe.description === 'string' && recipe.description.length <= 500 &&
    typeof recipe.timeMinutes === 'number' && Number.isFinite(recipe.timeMinutes) &&
    Array.isArray(recipe.ingredients) && recipe.ingredients.length <= 50 &&
    recipe.ingredients.every((item) =>
      item && typeof item === 'object' &&
      typeof item.name === 'string' && item.name.length <= 100 &&
      typeof item.amount === 'number' && Number.isFinite(item.amount) &&
      typeof item.unit === 'string' && item.unit.length <= 30
    ) &&
    Array.isArray(recipe.steps) && recipe.steps.length <= 50 &&
    recipe.steps.every((step) => typeof step === 'string' && step.length <= 500)
  );
}

function extractOutputText(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const response = payload as {
    output?: { content?: { type?: string; text?: string }[] }[];
  };
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI service is not configured' }, { status: 503 });
  }
  const unauthorized = await rejectUnauthenticated(request);
  if (unauthorized) return unauthorized;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const recipes = (body as { recipes?: unknown } | null)?.recipes;
  if (!Array.isArray(recipes) || recipes.length === 0 || recipes.length > MAX_RECIPES || !recipes.every(isRecipeInput)) {
    return Response.json({ error: 'Invalid recipe list' }, { status: 400 });
  }

  const upstream = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_RECIPE_MODEL || 'gpt-5.6-luna',
      store: false,
      instructions: [
        'You organize recipes for a bilingual Chinese cooking app.',
        `Choose exactly one category from: ${AI_RECIPE_CATEGORIES.join(', ')}.`,
        'Prefer 烘焙谱 for oven baking, 面食 for noodles or pasta, 一锅料理 for soups/stews/one-pot meals, 下饭菜 for strongly flavored mains, 快手菜 for recipes usually finished within 25 minutes, and 其他 only when none fit.',
        'Return one classification for every input id. Keep each Chinese reason concise.',
      ].join(' '),
      input: JSON.stringify(recipes),
      text: {
        format: {
          type: 'json_schema',
          name: 'recipe_organization',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              classifications: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    category: { type: 'string', enum: AI_RECIPE_CATEGORIES },
                    reason: { type: 'string' },
                  },
                  required: ['id', 'category', 'reason'],
                },
              },
            },
            required: ['classifications'],
          },
        },
      },
    }),
  });

  if (!upstream.ok) {
    return Response.json({ error: 'AI service request failed' }, { status: 502 });
  }

  const outputText = extractOutputText(await upstream.json());
  if (!outputText) return Response.json({ error: 'AI service returned no result' }, { status: 502 });

  try {
    const parsed = JSON.parse(outputText) as { classifications?: RecipeClassification[] };
    const allowedIds = new Set(recipes.map((recipe) => recipe.id));
    const classifications = (parsed.classifications ?? []).filter(
      (item) => allowedIds.has(item.id) && isAiRecipeCategory(item.category) && typeof item.reason === 'string'
    );
    if (
      classifications.length !== recipes.length ||
      new Set(classifications.map((item) => item.id)).size !== recipes.length
    ) throw new Error('Incomplete result');
    return Response.json({ classifications, source: 'openai' });
  } catch {
    return Response.json({ error: 'AI service returned an invalid result' }, { status: 502 });
  }
}
