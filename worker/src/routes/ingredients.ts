import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function handleIngredients(request: Request, env: Env, url: URL): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const q = url.searchParams.get('q')?.trim();
    if (q && q.length > 0) {
      const { results } = await env.DB.prepare(`
        SELECT i.id, i.name, i.category_id, ic.name AS category_name
        FROM ingredients i
        LEFT JOIN ingredient_categories ic ON i.category_id = ic.id
        WHERE i.name LIKE ?
        ORDER BY i.name
        LIMIT 20
      `).bind(`%${q}%`).all();
      return Response.json(results);
    }
    const { results } = await env.DB.prepare(`
      SELECT i.id, i.name, i.category_id, ic.name AS category_name
      FROM ingredients i
      LEFT JOIN ingredient_categories ic ON i.category_id = ic.id
      ORDER BY i.name
      LIMIT 100
    `).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { name: string; category_id?: string };
    if (!body.name?.trim()) {
      return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });
    }

    const existing = await env.DB.prepare('SELECT id FROM ingredients WHERE name = ? COLLATE NOCASE')
      .bind(body.name.trim()).first<{ id: string }>();
    if (existing) return Response.json(existing);

    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO ingredients (id, name, category_id) VALUES (?, ?, ?)')
      .bind(id, body.name.trim(), body.category_id ?? null).run();
    return Response.json({ id, name: body.name.trim(), category_id: body.category_id ?? null }, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleIngredientCategories(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);
  const { results } = await env.DB.prepare(
    'SELECT * FROM ingredient_categories ORDER BY sort_order'
  ).all();
  return Response.json(results);
}
