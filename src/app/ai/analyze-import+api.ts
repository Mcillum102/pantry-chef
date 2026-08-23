import { AI_RECIPE_CATEGORIES } from '@/data/recipe-ai';

const inventorySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    result: {
      type: 'array', maxItems: 30,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string' }, name: { type: 'string' }, emoji: { type: 'string' },
          quantity: { type: 'number' }, unit: { type: 'string' },
          library: { type: 'string', enum: ['食材', '甜品', '零食', '饮料', '速食'] },
          storage: { type: 'string', enum: ['冷藏', '冷冻', '速食柜', '零食车'] },
          shelfDays: { type: 'number' },
        },
        required: ['id', 'name', 'emoji', 'quantity', 'unit', 'library', 'storage', 'shelfDays'],
      },
    },
  },
  required: ['result'],
} as const;

const recipeSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    result: {
      type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' }, emoji: { type: 'string' }, description: { type: 'string' },
        timeMinutes: { type: 'number' }, difficulty: { type: 'string', enum: ['简单', '适中'] },
        category: { type: 'string', enum: AI_RECIPE_CATEGORIES },
        servings: { type: 'number' }, carbsPerServing: { type: 'number' }, tip: { type: 'string' },
        ingredients: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { name: { type: 'string' }, amount: { type: 'number' }, unit: { type: 'string' } },
            required: ['name', 'amount', 'unit'],
          },
        },
        steps: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            properties: { instruction: { type: 'string' }, timerMinutes: { type: 'number' } },
            required: ['instruction', 'timerMinutes'],
          },
        },
      },
      required: ['name', 'emoji', 'description', 'timeMinutes', 'difficulty', 'category', 'servings', 'carbsPerServing', 'ingredients', 'steps', 'tip'],
    },
  },
  required: ['result'],
} as const;

function extractText(payload: unknown) {
  const output = (payload as { output?: { content?: { type?: string; text?: string }[] }[] })?.output ?? [];
  for (const item of output) {
    for (const content of item.content ?? []) {
      if (content.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

export async function POST(request: Request) {
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'AI is not configured' }, { status: 503 });
  let body: { mode?: string; text?: string; imageDataUrl?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const isInventory = body.mode === 'ingredients-text';
  const isImage = body.mode === 'recipe-image';
  const isLink = body.mode === 'recipe-link';
  if (!isInventory && !isImage && !isLink) return Response.json({ error: 'Invalid mode' }, { status: 400 });
  if (isInventory && (!body.text || body.text.length > 6_000)) return Response.json({ error: 'Invalid text' }, { status: 400 });
  if (isImage && (!body.imageDataUrl?.startsWith('data:image/') || body.imageDataUrl.length > 12_000_000)) {
    return Response.json({ error: 'Invalid image' }, { status: 400 });
  }
  if (isLink) {
    try {
      const url = new URL(body.url ?? '');
      if (url.protocol !== 'https:' || url.username || url.password || body.url!.length > 2_000) throw new Error();
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400 });
    }
  }

  const recipeInstructions = [
    'Extract a cooking recipe into the exact JSON schema.',
    'Use Chinese for name, description, ingredients, steps, and tip.',
    'Never invent an ingredient quantity when it is unreadable; use amount 1 and unit 待确认.',
    `Choose one category from ${AI_RECIPE_CATEGORIES.join(', ')}.`,
    'Use timerMinutes 0 when a step has no explicit timer. Keep carbsPerServing 0 when unknown.',
  ].join(' ');
  const input = isInventory
    ? `Analyze this Chinese shopping description and list every purchased item. Normalize units and infer a sensible emoji, inventory library, storage location, and shelf life. Give every item a unique short id.\n\n${body.text}`
    : isImage
      ? [{ role: 'user', content: [
          { type: 'input_text', text: recipeInstructions },
          { type: 'input_image', image_url: body.imageDataUrl, detail: 'high' },
        ] }]
      : `${recipeInstructions}\nUse web search to open and analyze this exact recipe URL: ${body.url}`;

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_RECIPE_MODEL || 'gpt-5.6-luna',
        store: false,
        instructions: isInventory ? 'Return only purchased inventory items in the requested schema.' : recipeInstructions,
        input,
        ...(isLink ? { tools: [{ type: 'web_search' }] } : {}),
        text: {
          format: {
            type: 'json_schema', name: isInventory ? 'inventory_import' : 'recipe_import',
            strict: true, schema: isInventory ? inventorySchema : recipeSchema,
          },
        },
      }),
    });
    if (!upstream.ok) return Response.json({ error: 'OpenAI request failed' }, { status: 502 });
    const outputText = extractText(await upstream.json());
    if (!outputText) return Response.json({ error: 'No analysis result' }, { status: 502 });
    return Response.json({ ...JSON.parse(outputText), source: 'openai' });
  } catch {
    return Response.json({ error: 'Analysis failed' }, { status: 502 });
  }
}
