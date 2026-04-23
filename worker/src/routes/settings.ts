import { requireAuth, requireRole } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const ALLOWED_KEYS = ['ai_model_shopping', 'ai_model_recipe', 'ai_model_mealplan'] as const;
type SettingKey = typeof ALLOWED_KEYS[number];

const ALLOWED_MODELS = [
  'claude-haiku-4-5',
  'claude-sonnet-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-6',
  'claude-haiku-3-5',
  'claude-sonnet-3-5',
] as const;

export async function handleSettings(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
    const obj = Object.fromEntries(results.map(r => [r.key, r.value]));
    return Response.json(obj);
  }

  if (request.method === 'PUT') {
    requireRole(user, 'admin');
    const body = await request.json() as Partial<Record<SettingKey, string>>;

    for (const [key, value] of Object.entries(body)) {
      if (!ALLOWED_KEYS.includes(key as SettingKey)) continue;
      if (!ALLOWED_MODELS.includes(value as typeof ALLOWED_MODELS[number])) continue;
      await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(key, value).run();
    }

    const { results } = await env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
    return Response.json(Object.fromEntries(results.map(r => [r.key, r.value])));
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
