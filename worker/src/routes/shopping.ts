import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function handleShopping(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT s.*, u.name as added_by_name, cu.name as checked_by_name
      FROM shopping_items s
      LEFT JOIN users u ON s.added_by = u.id
      LEFT JOIN users cu ON s.checked_by = cu.id
      ORDER BY s.checked ASC, s.created_at ASC
    `).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const { name, category_id, quantity, store } = await request.json() as { name: string; category_id?: string; quantity?: string; store?: string };
    if (!name) return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO shopping_items (id, name, category_id, quantity, store, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, name, category_id ?? null, quantity ?? null, store ?? null, user.id, created_at).run();

    return Response.json({ id, name, category_id, quantity, store, checked: 0, added_by: user.id, created_at }, { status: 201 });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shopping_items WHERE checked = 1').run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleShoppingItem(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'PUT') {
    const { name, category_id, quantity, store } = await request.json() as { name?: string; category_id?: string; quantity?: string; store?: string };
    await env.DB.prepare(
      'UPDATE shopping_items SET name = COALESCE(?, name), category_id = COALESCE(?, category_id), quantity = COALESCE(?, quantity), store = COALESCE(?, store) WHERE id = ?'
    ).bind(name ?? null, category_id ?? null, quantity ?? null, store ?? null, id).run();

    const updated = await env.DB.prepare('SELECT * FROM shopping_items WHERE id = ?').bind(id).first();
    return Response.json(updated);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM shopping_items WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleShoppingCheck(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireAuth(request, env);

  const item = await env.DB.prepare('SELECT * FROM shopping_items WHERE id = ?').bind(id).first<{ checked: number }>();
  if (!item) return Response.json({ error: 'Vare ikke fundet' }, { status: 404 });

  const newChecked = item.checked ? 0 : 1;
  const now = new Date().toISOString();

  if (newChecked) {
    await env.DB.prepare('UPDATE shopping_items SET checked = 1, checked_by = ?, checked_at = ? WHERE id = ?')
      .bind(user.id, now, id).run();
  } else {
    await env.DB.prepare('UPDATE shopping_items SET checked = 0, checked_by = NULL, checked_at = NULL WHERE id = ?')
      .bind(id).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM shopping_items WHERE id = ?').bind(id).first();
  return Response.json(updated);
}
