import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function handleTemplates(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM meal_plans WHERE is_template = 1 ORDER BY created_at DESC'
    ).all();
    return Response.json(results);
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
