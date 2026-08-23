import {
  isAiRecipeCategory,
  organizeRecipesLocally,
  type RecipeForOrganization,
  type RecipeOrganizationResult,
} from '@/data/recipe-ai';

const REQUEST_TIMEOUT_MS = 20_000;

export async function organizeRecipesWithAI(
  recipes: RecipeForOrganization[]
): Promise<RecipeOrganizationResult> {
  if (recipes.length === 0) return { classifications: [], source: 'local' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('/ai/organize-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipes }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI organization failed with ${response.status}`);

    const payload = await response.json() as Partial<RecipeOrganizationResult>;
    const classifications = (payload.classifications ?? []).filter(
      (item) =>
        typeof item?.id === 'string' &&
        isAiRecipeCategory(item.category) &&
        typeof item.reason === 'string'
    );
    if (classifications.length !== recipes.length) throw new Error('Incomplete AI result');
    return { classifications, source: 'openai' };
  } catch {
    return { classifications: organizeRecipesLocally(recipes), source: 'local' };
  } finally {
    clearTimeout(timeout);
  }
}
