import type { Recipe } from '@/data/kitchen-data';

export const AI_RECIPE_CATEGORIES = [
  '快手菜',
  '一锅料理',
  '下饭菜',
  '面食',
  '其他',
  '烘焙谱',
] as const;

export type AiRecipeCategory = (typeof AI_RECIPE_CATEGORIES)[number];

export type RecipeForOrganization = Pick<
  Recipe,
  'id' | 'name' | 'description' | 'ingredients' | 'steps' | 'timeMinutes'
>;

export type RecipeClassification = {
  id: string;
  category: AiRecipeCategory;
  reason: string;
};

export type RecipeOrganizationResult = {
  classifications: RecipeClassification[];
  source: 'openai' | 'local';
};

export function isAiRecipeCategory(value: unknown): value is AiRecipeCategory {
  return typeof value === 'string' && AI_RECIPE_CATEGORIES.includes(value as AiRecipeCategory);
}

export function organizeRecipesLocally(
  recipes: RecipeForOrganization[]
): RecipeClassification[] {
  return recipes.map((recipe) => {
    const content = [
      recipe.name,
      recipe.description,
      ...recipe.ingredients.map((ingredient) => ingredient.name),
      ...recipe.steps,
    ].join(' ').toLocaleLowerCase();

    let category: AiRecipeCategory = '其他';
    let reason = '根据菜名、食材和制作步骤自动归档';

    if (/(烤箱|烘焙|蛋糕|面包|曲奇|饼干|司康|吐司|玛芬|muffin|cake|bread|cookie)/i.test(content)) {
      category = '烘焙谱';
      reason = '包含明确的烘焙或烤箱制作特征';
    } else if (/(面(?!包|粉)|拉面|意面|乌冬|米线|粉丝|面食|noodle|pasta)/i.test(content)) {
      category = '面食';
      reason = '以面条、米线或意面为主要形式';
    } else if (/(焖|炖|汤|煲|锅|stew|soup|one pot)/i.test(content)) {
      category = '一锅料理';
      reason = '主要使用一锅完成或带有炖煮特征';
    } else if (/(下饭|红烧|糖醋|麻婆|咖喱|照烧|鱼香)/i.test(content)) {
      category = '下饭菜';
      reason = '口味和做法适合作为下饭主菜';
    } else if (recipe.timeMinutes <= 25 || /(快手|凉拌|炒蛋|煎蛋|三明治|沙拉)/i.test(content)) {
      category = '快手菜';
      reason = '用时较短或步骤适合快速完成';
    }

    return { id: recipe.id, category, reason };
  });
}
