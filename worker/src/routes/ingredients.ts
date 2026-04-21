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
        SELECT i.id, i.name, i.category_id, i.times_bought, ic.name AS category_name
        FROM ingredients i
        LEFT JOIN ingredient_categories ic ON i.category_id = ic.id
        WHERE i.name LIKE ?
        ORDER BY i.times_bought DESC, i.name ASC
        LIMIT 20
      `).bind(`%${q}%`).all();
      return Response.json(results);
    }
    const { results } = await env.DB.prepare(`
      SELECT i.id, i.name, i.category_id, i.times_bought, ic.name AS category_name
      FROM ingredients i
      LEFT JOIN ingredient_categories ic ON i.category_id = ic.id
      ORDER BY i.times_bought DESC, i.name ASC
      LIMIT 100
    `).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { name: string; category_id?: string };
    if (!body.name?.trim()) {
      return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });
    }

    // Return existing if already there
    const existing = await env.DB.prepare(
      'SELECT i.id, i.name, i.category_id, i.times_bought, ic.name AS category_name FROM ingredients i LEFT JOIN ingredient_categories ic ON i.category_id = ic.id WHERE i.name = ? COLLATE NOCASE'
    ).bind(body.name.trim()).first();
    if (existing) return Response.json(existing);

    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO ingredients (id, name, category_id, times_bought) VALUES (?, ?, ?, 0)')
      .bind(id, body.name.trim(), body.category_id ?? null).run();

    const created = await env.DB.prepare(
      'SELECT i.id, i.name, i.category_id, i.times_bought, ic.name AS category_name FROM ingredients i LEFT JOIN ingredient_categories ic ON i.category_id = ic.id WHERE i.id = ?'
    ).bind(id).first();
    return Response.json(created, { status: 201 });
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
