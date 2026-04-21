import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

const ING_SELECT = `
  SELECT i.id, i.name, i.category_id, i.times_bought,
         i.default_quantity, i.default_store,
         ic.name AS category_name
  FROM ingredients i
  LEFT JOIN ingredient_categories ic ON i.category_id = ic.id
`;

export async function handleIngredients(request: Request, env: Env, url: URL): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const q = url.searchParams.get('q')?.trim();
    if (q && q.length > 0) {
      const { results } = await env.DB.prepare(
        ING_SELECT + ' WHERE i.name LIKE ? ORDER BY i.times_bought DESC, i.name ASC LIMIT 20'
      ).bind(`%${q}%`).all();
      return Response.json(results);
    }
    const { results } = await env.DB.prepare(
      ING_SELECT + ' ORDER BY i.times_bought DESC, i.name ASC LIMIT 200'
    ).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as {
      name: string; category_id?: string;
      default_quantity?: string; default_store?: string;
    };
    if (!body.name?.trim()) return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });

    const existing = await env.DB.prepare(
      ING_SELECT + ' WHERE i.name = ? COLLATE NOCASE'
    ).bind(body.name.trim()).first();
    if (existing) return Response.json(existing);

    const id = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO ingredients (id, name, category_id, times_bought, default_quantity, default_store) VALUES (?, ?, ?, 0, ?, ?)'
    ).bind(id, body.name.trim(), body.category_id ?? null, body.default_quantity ?? null, body.default_store ?? null).run();

    const created = await env.DB.prepare(ING_SELECT + ' WHERE i.id = ?').bind(id).first();
    return Response.json(created, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleIngredient(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'PUT') {
    const body = await request.json() as {
      name?: string; category_id?: string | null;
      default_quantity?: string | null; default_store?: string | null;
    };
    await env.DB.prepare(`
      UPDATE ingredients SET
        name             = COALESCE(?, name),
        category_id      = ?,
        default_quantity = ?,
        default_store    = ?
      WHERE id = ?
    `).bind(
      body.name ?? null,
      body.category_id ?? null,
      body.default_quantity ?? null,
      body.default_store ?? null,
      id
    ).run();
    const updated = await env.DB.prepare(ING_SELECT + ' WHERE i.id = ?').bind(id).first();
    return Response.json(updated);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM ingredients WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleIngredientCategories(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM ingredient_categories ORDER BY sort_order'
    ).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as { name: string; sort_order?: number };
    if (!body.name?.trim()) return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });

    const id = `cat-${crypto.randomUUID().slice(0, 8)}`;
    const sort_order = body.sort_order ?? 50;
    await env.DB.prepare(
      'INSERT INTO ingredient_categories (id, name, sort_order) VALUES (?, ?, ?)'
    ).bind(id, body.name.trim(), sort_order).run();

    return Response.json({ id, name: body.name.trim(), sort_order }, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleIngredientCategory(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'PUT') {
    const body = await request.json() as { name?: string; sort_order?: number };
    await env.DB.prepare(`
      UPDATE ingredient_categories SET
        name       = COALESCE(?, name),
        sort_order = COALESCE(?, sort_order)
      WHERE id = ?
    `).bind(body.name ?? null, body.sort_order ?? null, id).run();
    const updated = await env.DB.prepare('SELECT * FROM ingredient_categories WHERE id = ?').bind(id).first();
    return Response.json(updated);
  }

  if (request.method === 'DELETE') {
    // Null-stil kategori på ingredienser der bruger denne kategori
    await env.DB.prepare('UPDATE ingredients SET category_id = NULL WHERE category_id = ?').bind(id).run();
    await env.DB.prepare('UPDATE shopping_items SET category_id = NULL WHERE category_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM ingredient_categories WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
