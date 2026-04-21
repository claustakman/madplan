import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}

export async function handleMealPlans(request: Request, env: Env, _url: URL): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM meal_plans ORDER BY week_start DESC'
    ).all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const { week_start, name, is_template, template_name, from_template_id } = await request.json() as {
      week_start?: string; name?: string; is_template?: boolean; template_name?: string; from_template_id?: string;
    };

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    const weekStart = week_start ?? getMondayOfWeek(new Date());
    const planName = name ?? `Uge ${weekStart}`;

    await env.DB.prepare(
      'INSERT INTO meal_plans (id, week_start, name, is_template, template_name, archived, created_by, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
    ).bind(id, weekStart, planName, is_template ? 1 : 0, template_name ?? null, user.id, created_at).run();

    if (from_template_id) {
      const { results: templateDays } = await env.DB.prepare(
        'SELECT * FROM meal_plan_days WHERE plan_id = ?'
      ).bind(from_template_id).all<{ weekday: number; recipe_id: string | null; note: string | null }>();

      for (const day of templateDays) {
        await env.DB.prepare(
          'INSERT INTO meal_plan_days (id, plan_id, weekday, recipe_id, note) VALUES (?, ?, ?, ?, ?)'
        ).bind(crypto.randomUUID(), id, day.weekday, day.recipe_id, day.note).run();
      }
    }

    return Response.json({ id, week_start: weekStart, name: planName, is_template: is_template ? 1 : 0, template_name, archived: 0, created_by: user.id, created_at }, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleMealPlanCurrent(request: Request, env: Env): Promise<Response> {
  await requireAuth(request, env);

  const monday = getMondayOfWeek(new Date());
  let plan = await env.DB.prepare(
    'SELECT * FROM meal_plans WHERE week_start = ? AND is_template = 0 AND archived = 0'
  ).bind(monday).first<{ id: string }>();

  if (!plan) {
    return Response.json(null);
  }

  const { results: days } = await env.DB.prepare(`
    SELECT d.*, r.title as recipe_title, r.image_url, r.tags
    FROM meal_plan_days d
    LEFT JOIN recipes r ON d.recipe_id = r.id
    WHERE d.plan_id = ?
    ORDER BY d.weekday
  `).bind(plan.id).all();

  return Response.json({ ...plan, days });
}

export async function handleMealPlanDay(request: Request, env: Env, planId: string, weekday: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method !== 'PUT') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  const { recipe_id, note } = await request.json() as { recipe_id?: string | null; note?: string | null };

  const existing = await env.DB.prepare(
    'SELECT id FROM meal_plan_days WHERE plan_id = ? AND weekday = ?'
  ).bind(planId, parseInt(weekday)).first<{ id: string }>();

  if (existing) {
    await env.DB.prepare('UPDATE meal_plan_days SET recipe_id = ?, note = ? WHERE id = ?')
      .bind(recipe_id ?? null, note ?? null, existing.id).run();
  } else {
    await env.DB.prepare('INSERT INTO meal_plan_days (id, plan_id, weekday, recipe_id, note) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), planId, parseInt(weekday), recipe_id ?? null, note ?? null).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM meal_plan_days WHERE plan_id = ? AND weekday = ?')
    .bind(planId, parseInt(weekday)).first();
  return Response.json(updated);
}

export async function handleMealPlanToShopping(request: Request, env: Env, planId: string): Promise<Response> {
  const user = await requireAuth(request, env);

  const { results: days } = await env.DB.prepare(
    'SELECT recipe_id FROM meal_plan_days WHERE plan_id = ? AND recipe_id IS NOT NULL'
  ).bind(planId).all<{ recipe_id: string }>();

  const recipeIds = days.map(d => d.recipe_id);
  let added = 0;

  for (const recipeId of recipeIds) {
    const { results: ingredients } = await env.DB.prepare(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ?'
    ).bind(recipeId).all<{ name: string; category_id: string | null; quantity: string | null }>();

    for (const ing of ingredients) {
      const existing = await env.DB.prepare(
        'SELECT id FROM shopping_items WHERE name = ? AND from_plan = 1 AND recipe_id = ?'
      ).bind(ing.name, recipeId).first();

      if (!existing) {
        await env.DB.prepare(
          'INSERT INTO shopping_items (id, name, category_id, quantity, from_plan, recipe_id, added_by, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)'
        ).bind(crypto.randomUUID(), ing.name, ing.category_id, ing.quantity, recipeId, user.id, new Date().toISOString()).run();
        added++;
      }
    }
  }

  return Response.json({ added });
}

export async function handleMealPlanArchive(request: Request, env: Env, planId: string): Promise<Response> {
  await requireAuth(request, env);
  await env.DB.prepare('UPDATE meal_plans SET archived = 1 WHERE id = ?').bind(planId).run();
  return Response.json({ archived: true });
}

export async function handleMealPlan(request: Request, env: Env, planId: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const plan = await env.DB.prepare('SELECT * FROM meal_plans WHERE id = ?').bind(planId).first();
    if (!plan) return Response.json({ error: 'Not found' }, { status: 404 });
    const { results: days } = await env.DB.prepare(`
      SELECT d.*, r.title as recipe_title, r.tags
      FROM meal_plan_days d
      LEFT JOIN recipes r ON d.recipe_id = r.id
      WHERE d.plan_id = ?
      ORDER BY d.weekday
    `).bind(planId).all();
    return Response.json({ ...plan, days });
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM meal_plans WHERE id = ?').bind(planId).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
