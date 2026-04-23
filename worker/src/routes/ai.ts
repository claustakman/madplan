import { requireAuth } from '../lib/auth';
import { parseShopping, generateRecipe, suggestRecipes, suggestPlan } from '../lib/ai';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY_MADPLAN: string;
}

async function getSetting(env: Env, key: string, fallback: string): Promise<string> {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  return row?.value ?? fallback;
}

export async function handleAIparseShopping(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const { text } = await request.json() as { text: string };
  if (!text?.trim()) return Response.json({ error: 'Tekst er påkrævet' }, { status: 400 });
  const model = await getSetting(env, 'ai_model_shopping', 'claude-haiku-4-5');
  const items = await parseShopping(text.trim(), env.ANTHROPIC_API_KEY_MADPLAN, model);
  return Response.json(items);
}

export async function handleAIGenerateRecipe(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const { prompt, url } = await request.json() as { prompt: string; url?: string };
  if (!prompt?.trim()) return Response.json({ error: 'Prompt er påkrævet' }, { status: 400 });

  let urlContent: string | null = null;
  if (url?.trim()) {
    try {
      const res = await fetch(url.trim(), { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const html = await res.text();
        // Strip HTML tags for a rough plain-text extraction
        urlContent = html.replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s{2,}/g, ' ')
          .trim();
      }
    } catch { /* URL-hentning fejlede, fortsæt uden */ }
  }

  const model = await getSetting(env, 'ai_model_recipe', 'claude-sonnet-4-5');
  const recipe = await generateRecipe(prompt.trim(), urlContent, env.ANTHROPIC_API_KEY_MADPLAN, model);
  return Response.json(recipe);
}

export async function handleAISuggestRecipes(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  const { prompt } = await request.json() as { prompt: string };
  if (!prompt) return Response.json({ error: 'Prompt er påkrævet' }, { status: 400 });

  const model = await getSetting(env, 'ai_model_recipe', 'claude-sonnet-4-5');
  const suggestions = await suggestRecipes(prompt, env.ANTHROPIC_API_KEY_MADPLAN, model);
  return Response.json(suggestions);
}

export async function handleAISuggestPlan(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  const { prompt, days } = await request.json() as {
    prompt: string;
    days: number[];
  };

  if (!prompt || !days?.length) {
    return Response.json({ error: 'Prompt og dage er påkrævet' }, { status: 400 });
  }

  // Always use full recipe catalog so Claude can pick the best matches
  const { results } = await env.DB.prepare(
    'SELECT id, title, tags FROM recipes ORDER BY created_at DESC'
  ).all<{ id: string; title: string; tags: string }>();

  const existingRecipes = results.map(r => ({
    id: r.id,
    title: r.title,
    tags: JSON.parse(r.tags ?? '[]') as string[],
  }));

  const model = await getSetting(env, 'ai_model_mealplan', 'claude-sonnet-4-5');
  const plan = await suggestPlan(prompt, days, existingRecipes, env.ANTHROPIC_API_KEY_MADPLAN, model);
  return Response.json(plan);
}
