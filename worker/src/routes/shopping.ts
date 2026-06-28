import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

// Parse a freetext quantity like "500g" or "2 stk" into { count, unit }.
// Returns null if it doesn't start with a number.
function parseQuantity(q: string): { count: number; unit: string } | null {
  const m = q.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return null;
  return { count: parseFloat(m[1].replace(',', '.')), unit: m[2].trim() };
}

// Combine two quantities when adding the same item again. If both are
// numeric with the same unit, add the counts. If neither has a quantity,
// fall back to a simple "×N" counter. Otherwise keep the existing quantity.
function mergeQuantity(existing: string | null, incoming: string | null): string | null {
  const a = existing?.trim() || null;
  const b = incoming?.trim() || null;

  if (!a && !b) return '×2';

  if (a) {
    const countMatch = a.match(/^×(\d+)$/);
    if (countMatch) return `×${parseInt(countMatch[1], 10) + 1}`;
  }

  if (a && b) {
    const pa = parseQuantity(a);
    const pb = parseQuantity(b);
    if (pa && pb && pa.unit.toLowerCase() === pb.unit.toLowerCase()) {
      const total = pa.count + pb.count;
      const formatted = Number.isInteger(total) ? String(total) : total.toFixed(1);
      return pa.unit ? `${formatted} ${pa.unit}` : formatted;
    }
    return a;
  }

  return a ?? b;
}

const ITEM_SELECT = `
  SELECT
    s.id, s.name, s.quantity, s.store, s.checked,
    s.checked_at, s.from_plan, s.recipe_id, s.created_at,
    s.category_id,
    s.added_by,
    ic.name        AS category_name,
    ic.sort_order  AS category_sort_order,
    u.name         AS added_by_name,
    cu.name        AS checked_by_name,
    COALESCE(i.times_bought, 0) AS times_bought
  FROM shopping_items s
  LEFT JOIN ingredient_categories ic ON s.category_id = ic.id
  LEFT JOIN users u   ON s.added_by   = u.id
  LEFT JOIN users cu  ON s.checked_by = cu.id
  LEFT JOIN ingredients i ON i.name = s.name COLLATE NOCASE
`;

export async function handleShopping(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      ITEM_SELECT + ' ORDER BY ic.sort_order ASC NULLS LAST, s.checked ASC, s.created_at ASC'
    ).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const body = await request.json() as {
      name: string; category_id?: string; quantity?: string; store?: string;
    };
    const name = body.name?.trim();
    if (!name) {
      return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });
    }

    // If an unchecked item with the same name already exists, bump its quantity
    // instead of inserting a duplicate row.
    const existing = await env.DB.prepare(
      'SELECT id, quantity FROM shopping_items WHERE name = ? COLLATE NOCASE AND checked = 0'
    ).bind(name).first<{ id: string; quantity: string | null }>();

    if (existing) {
      const mergedQuantity = mergeQuantity(existing.quantity, body.quantity ?? null);
      await env.DB.prepare('UPDATE shopping_items SET quantity = ? WHERE id = ?')
        .bind(mergedQuantity, existing.id).run();
      const item = await env.DB.prepare(ITEM_SELECT + ' WHERE s.id = ?').bind(existing.id).first();
      return Response.json(item, { status: 200 });
    }

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    await env.DB.prepare(
      'INSERT INTO shopping_items (id, name, category_id, quantity, store, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, name, body.category_id ?? null, body.quantity ?? null, body.store ?? null, user.id, created_at).run();

    const item = await env.DB.prepare(ITEM_SELECT + ' WHERE s.id = ?').bind(id).first();
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
      name?: string; category_id?: string; quantity?: string | null; store?: string | null;
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

    // Sync category change to ingredient catalog
    if (body.category_id !== undefined) {
      const current = await env.DB.prepare('SELECT name FROM shopping_items WHERE id = ?').bind(id).first<{ name: string }>();
      if (current) {
        await env.DB.prepare(
          'UPDATE ingredients SET category_id = ? WHERE name = ? COLLATE NOCASE'
        ).bind(body.category_id ?? null, current.name).run();
      }
    }

    const item = await env.DB.prepare(ITEM_SELECT + ' WHERE s.id = ?').bind(id).first();
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

  const item = await env.DB.prepare('SELECT id, name, checked FROM shopping_items WHERE id = ?')
    .bind(id).first<{ id: string; name: string; checked: number }>();
  if (!item) return Response.json({ error: 'Vare ikke fundet' }, { status: 404 });

  const nowChecked = item.checked ? 0 : 1;

  if (nowChecked) {
    await env.DB.prepare(
      'UPDATE shopping_items SET checked = 1, checked_by = ?, checked_at = ? WHERE id = ?'
    ).bind(user.id, new Date().toISOString(), id).run();

    // Increment times_bought on matching ingredient
    await env.DB.prepare(
      'UPDATE ingredients SET times_bought = times_bought + 1 WHERE name = ? COLLATE NOCASE'
    ).bind(item.name).run();
  } else {
    await env.DB.prepare(
      'UPDATE shopping_items SET checked = 0, checked_by = NULL, checked_at = NULL WHERE id = ?'
    ).bind(id).run();
  }

  const updated = await env.DB.prepare(ITEM_SELECT + ' WHERE s.id = ?').bind(id).first();
  return Response.json(updated);
}
