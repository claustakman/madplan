import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function handleShopping(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT
        s.id, s.name, s.quantity, s.store, s.checked,
        s.checked_at, s.from_plan, s.recipe_id, s.created_at,
        s.category_id,
        ic.name   AS category_name,
        ic.sort_order AS category_sort_order,
        u.name    AS added_by_name,
        cu.name   AS checked_by_name
      FROM shopping_items s
      LEFT JOIN ingredient_categories ic ON s.category_id = ic.id
      LEFT JOIN users u  ON s.added_by   = u.id
      LEFT JOIN users cu ON s.checked_by = cu.id
      ORDER BY ic.sort_order ASC NULLS LAST, s.checked ASC, s.created_at ASC
    `).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as {
      name: string; category_id?: string; quantity?: string; store?: string;
    };
    if (!body.name?.trim()) {
      return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO shopping_items (id, name, category_id, quantity, store, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, body.name.trim(), body.category_id ?? null, body.quantity ?? null, body.store ?? null, user.id, created_at).run();

    const item = await env.DB.prepare(`
      SELECT s.*, ic.name AS category_name, ic.sort_order AS category_sort_order,
             u.name AS added_by_name
      FROM shopping_items s
      LEFT JOIN ingredient_categories ic ON s.category_id = ic.id
      LEFT JOIN users u ON s.added_by = u.id
      WHERE s.id = ?
    `).bind(id).first();

    return Response.json(item, { status: 201 });
  }

  // DELETE /api/shopping — ryd alle afkrydsede
  if (request.method === 'DELETE') {
    const { meta } = await env.DB.prepare('DELETE FROM shopping_items WHERE checked = 1').run();
    return Response.json({ deleted: meta.changes });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleShoppingItem(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'PUT') {
    const body = await request.json() as {
      name?: string; category_id?: string; quantity?: string; store?: string;
    };
    await env.DB.prepare(`
      UPDATE shopping_items SET
        name        = COALESCE(?, name),
        category_id = COALESCE(?, category_id),
        quantity    = ?,
        store       = ?
      WHERE id = ?
    `).bind(
      body.name ?? null,
      body.category_id ?? null,
      body.quantity ?? null,
      body.store ?? null,
      id
    ).run();

    const item = await env.DB.prepare(`
      SELECT s.*, ic.name AS category_name, ic.sort_order AS category_sort_order,
             u.name AS added_by_name, cu.name AS checked_by_name
      FROM shopping_items s
      LEFT JOIN ingredient_categories ic ON s.category_id = ic.id
      LEFT JOIN users u  ON s.added_by  = u.id
      LEFT JOIN users cu ON s.checked_by = cu.id
      WHERE s.id = ?
    `).bind(id).first();

    return Response.json(item);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shopping_items WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleShoppingCheck(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireAuth(request, env);

  const item = await env.DB.prepare('SELECT id, checked FROM shopping_items WHERE id = ?')
    .bind(id).first<{ id: string; checked: number }>();
  if (!item) return Response.json({ error: 'Vare ikke fundet' }, { status: 404 });

  const nowChecked = item.checked ? 0 : 1;

  if (nowChecked) {
    await env.DB.prepare(
      'UPDATE shopping_items SET checked = 1, checked_by = ?, checked_at = ? WHERE id = ?'
    ).bind(user.id, new Date().toISOString(), id).run();
  } else {
    await env.DB.prepare(
      'UPDATE shopping_items SET checked = 0, checked_by = NULL, checked_at = NULL WHERE id = ?'
    ).bind(id).run();
  }

  const updated = await env.DB.prepare(`
    SELECT s.*, ic.name AS category_name, ic.sort_order AS category_sort_order,
           u.name AS added_by_name, cu.name AS checked_by_name
    FROM shopping_items s
    LEFT JOIN ingredient_categories ic ON s.category_id = ic.id
    LEFT JOIN users u  ON s.added_by  = u.id
    LEFT JOIN users cu ON s.checked_by = cu.id
    WHERE s.id = ?
  `).bind(id).first();

  return Response.json(updated);
}
