import { requireAuth } from '../lib/auth';
import { suggestRecipes, suggestPlan } from '../lib/ai';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY: string;
}

export async function handleAISuggestRecipes(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  const { prompt } = await request.json() as { prompt: string };
  if (!prompt) return Response.json({ error: 'Prompt er påkrævet' }, { status: 400 });

  const suggestions = await suggestRecipes(prompt, env.ANTHROPIC_API_KEY);
  return Response.json(suggestions);
}

export async function handleAISuggestPlan(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  const { prompt, days, existing_recipe_ids } = await request.json() as {
    prompt: string;
    days: number[];
    existing_recipe_ids?: string[];
  };

  if (!prompt || !days?.length) {
    return Response.json({ error: 'Prompt og dage er påkrævet' }, { status: 400 });
  }

  let existingRecipes: Array<{ id: string; title: string; tags: string[] }> = [];
  if (existing_recipe_ids?.length) {
    const placeholders = existing_recipe_ids.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id, title, tags FROM recipes WHERE id IN (${placeholders})`
    ).bind(...existing_recipe_ids).all<{ id: string; title: string; tags: string }>();

    existingRecipes = results.map(r => ({
      id: r.id,
      title: r.title,
      tags: JSON.parse(r.tags ?? '[]') as string[],
    }));
  }

  const plan = await suggestPlan(prompt, days, existingRecipes, env.ANTHROPIC_API_KEY);
  return Response.json(plan);
}
