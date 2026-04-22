import { requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
}

export async function handleRecipes(request: Request, env: Env, url: URL): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    const q = url.searchParams.get('q');
    const tags = url.searchParams.get('tags');
    const ingredient = url.searchParams.get('ingredient');
    const minRating = url.searchParams.get('min_rating');

    let query = 'SELECT DISTINCT r.* FROM recipes r';
    const params: (string | number)[] = [];

    if (ingredient) {
      query += ' LEFT JOIN recipe_ingredients ri ON r.id = ri.recipe_id';
    }

    const conditions: string[] = [];
    if (q) {
      // Search in title and tags
      conditions.push('(r.title LIKE ? OR r.tags LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (ingredient) {
      conditions.push('ri.name LIKE ?');
      params.push(`%${ingredient}%`);
    }
    if (tags) {
      const tagList = tags.split(',');
      tagList.forEach(tag => {
        conditions.push("r.tags LIKE ?");
        params.push(`%${tag.trim()}%`);
      });
    }
    if (minRating) {
      conditions.push('r.rating >= ?');
      params.push(parseInt(minRating));
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY r.created_at DESC';

    const stmt = env.DB.prepare(query);
    const { results } = params.length ? await stmt.bind(...params).all() : await stmt.all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const { title, description, url: recipeUrl, servings, prep_minutes, tags, rating } = await request.json() as {
      title: string; description?: string; url?: string; servings?: number; prep_minutes?: number; tags?: string[]; rating?: number;
    };

    if (!title) return Response.json({ error: 'Titel er påkrævet' }, { status: 400 });

    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    await env.DB.prepare(
      'INSERT INTO recipes (id, title, description, url, servings, prep_minutes, tags, rating, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, title, description ?? null, recipeUrl ?? null, servings ?? 4, prep_minutes ?? null, JSON.stringify(tags ?? []), rating ?? 0, user.id, created_at).run();

    return Response.json({ id, title, description, url: recipeUrl, servings: servings ?? 4, prep_minutes, tags: tags ?? [], rating: rating ?? 0, created_by: user.id, created_at }, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleRecipe(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const recipe = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first();
    if (!recipe) return Response.json({ error: 'Opskrift ikke fundet' }, { status: 404 });

    const { results: ingredients } = await env.DB.prepare(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order'
    ).bind(id).all();

    return Response.json({ ...recipe, ingredients });
  }

  if (request.method === 'PUT') {
    const { title, description, url: recipeUrl, servings, prep_minutes, tags, rating } = await request.json() as {
      title?: string; description?: string; url?: string; servings?: number; prep_minutes?: number; tags?: string[]; rating?: number;
    };

    await env.DB.prepare(
      'UPDATE recipes SET title = COALESCE(?, title), description = COALESCE(?, description), url = COALESCE(?, url), servings = COALESCE(?, servings), prep_minutes = COALESCE(?, prep_minutes), tags = COALESCE(?, tags), rating = COALESCE(?, rating) WHERE id = ?'
    ).bind(title ?? null, description ?? null, recipeUrl ?? null, servings ?? null, prep_minutes ?? null, tags ? JSON.stringify(tags) : null, rating ?? null, id).run();

    const updated = await env.DB.prepare('SELECT * FROM recipes WHERE id = ?').bind(id).first();
    return Response.json(updated);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleRecipeIngredients(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  if (request.method === 'PUT') {
    const ingredients = await request.json() as Array<{
      id: string;
      name: string;
      quantity?: string | null;
      ingredient_id?: string | null;
      category_id?: string | null;
      sort_order?: number;
    }>;

    // Replace all ingredients for this recipe
    await env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(id).run();

    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.name?.trim()) continue;
      await env.DB.prepare(
        'INSERT INTO recipe_ingredients (id, recipe_id, ingredient_id, name, quantity, category_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        ing.id ?? crypto.randomUUID(),
        id,
        ing.ingredient_id ?? null,
        ing.name.trim(),
        ing.quantity?.trim() || null,
        ing.category_id ?? null,
        ing.sort_order ?? i
      ).run();
    }

    const { results } = await env.DB.prepare(
      'SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order'
    ).bind(id).all();
    return Response.json(results);
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleRecipeImage(request: Request, env: Env, id: string): Promise<Response> {
  await requireAuth(request, env);

  const contentType = request.headers.get('Content-Type') ?? '';
  if (!contentType.startsWith('image/')) {
    return Response.json({ error: 'Kun billedfiler er tilladt' }, { status: 400 });
  }

  const ext = contentType.split('/')[1] ?? 'jpg';
  const key = `recipes/${id}/${crypto.randomUUID()}.${ext}`;

  const body = await request.arrayBuffer();
  if (body.byteLength > 10 * 1024 * 1024) {
    return Response.json({ error: 'Billede må max være 10 MB' }, { status: 400 });
  }

  await env.R2.put(key, body, { httpMetadata: { contentType } });

  const image_url = `https://pub-madplan.r2.dev/${key}`;
  await env.DB.prepare('UPDATE recipes SET image_url = ? WHERE id = ?').bind(image_url, id).run();

  return Response.json({ image_url });
}
