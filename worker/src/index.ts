import { handleLogin, handleMe } from './routes/auth';
import { handleUsers, handleUser } from './routes/users';
import { handleShopping, handleShoppingItem, handleShoppingCheck } from './routes/shopping';
import { handleRecipes, handleRecipe, handleRecipeImage } from './routes/recipes';
import {
  handleMealPlans,
  handleMealPlanCurrent,
  handleMealPlanDay,
  handleMealPlanToShopping,
  handleMealPlanArchive,
  handleMealPlanDelete,
} from './routes/mealplan';
import { handleTemplates } from './routes/templates';
import { handleAISuggestRecipes, handleAISuggestPlan } from './routes/ai';

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  ENVIRONMENT: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      let response: Response;

      // Auth routes
      if (path === '/api/auth/login' && request.method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/api/auth/me' && request.method === 'GET') {
        response = await handleMe(request, env);
      }

      // User routes
      else if (path === '/api/users') {
        response = await handleUsers(request, env, url);
      } else if (path.startsWith('/api/users/')) {
        const id = path.split('/')[3];
        response = await handleUser(request, env, id);
      }

      // Shopping routes
      else if (path === '/api/shopping' || (path === '/api/shopping' && request.method === 'DELETE')) {
        response = await handleShopping(request, env);
      } else if (path.match(/^\/api\/shopping\/[^/]+\/check$/)) {
        const id = path.split('/')[3];
        response = await handleShoppingCheck(request, env, id);
      } else if (path.match(/^\/api\/shopping\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleShoppingItem(request, env, id);
      }

      // Ingredient routes
      else if (path === '/api/ingredients') {
        response = await handleIngredients(request, env, url);
      } else if (path === '/api/ingredients/categories') {
        response = await handleIngredientCategories(request, env);
      }

      // Recipe routes
      else if (path === '/api/recipes') {
        response = await handleRecipes(request, env, url);
      } else if (path.match(/^\/api\/recipes\/[^/]+\/image$/)) {
        const id = path.split('/')[3];
        response = await handleRecipeImage(request, env, id);
      } else if (path.match(/^\/api\/recipes\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleRecipe(request, env, id);
      }

      // Meal plan routes
      else if (path === '/api/mealplans/current') {
        response = await handleMealPlanCurrent(request, env);
      } else if (path === '/api/mealplans') {
        response = await handleMealPlans(request, env, url);
      } else if (path.match(/^\/api\/mealplans\/[^/]+\/days\/\d+$/)) {
        const parts = path.split('/');
        response = await handleMealPlanDay(request, env, parts[3], parts[5]);
      } else if (path.match(/^\/api\/mealplans\/[^/]+\/to-shopping-list$/)) {
        const id = path.split('/')[3];
        response = await handleMealPlanToShopping(request, env, id);
      } else if (path.match(/^\/api\/mealplans\/[^/]+\/archive$/)) {
        const id = path.split('/')[3];
        response = await handleMealPlanArchive(request, env, id);
      } else if (path.match(/^\/api\/mealplans\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleMealPlanDelete(request, env, id);
      }

      // Template routes
      else if (path === '/api/templates') {
        response = await handleTemplates(request, env);
      }

      // AI routes
      else if (path === '/api/ai/suggest-recipes') {
        response = await handleAISuggestRecipes(request, env);
      } else if (path === '/api/ai/suggest-plan') {
        response = await handleAISuggestPlan(request, env);
      }

      else {
        response = Response.json({ error: 'Not found' }, { status: 404 });
      }

      return withCors(response);
    } catch (e) {
      if (e instanceof Response) return withCors(e);
      console.error(e);
      return withCors(Response.json({ error: 'Internal server error' }, { status: 500 }));
    }
  },
};

async function handleIngredients(request: Request, env: Env, url: URL): Promise<Response> {
  const { requireAuth } = await import('./lib/auth');
  await requireAuth(request, env);

  if (request.method === 'GET') {
    const q = url.searchParams.get('q');
    if (q) {
      const { results } = await env.DB.prepare('SELECT * FROM ingredients WHERE name LIKE ? ORDER BY name LIMIT 20')
        .bind(`%${q}%`).all();
      return Response.json(results);
    }
    const { results } = await env.DB.prepare('SELECT * FROM ingredients ORDER BY name').all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    const { requireAuth: ra } = await import('./lib/auth');
    await ra(request, env);
    const { name, category_id } = await request.json() as { name: string; category_id?: string };
    if (!name) return Response.json({ error: 'Navn er påkrævet' }, { status: 400 });

    const id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO ingredients (id, name, category_id) VALUES (?, ?, ?)')
      .bind(id, name, category_id ?? null).run();
    return Response.json({ id, name, category_id }, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

async function handleIngredientCategories(request: Request, env: Env): Promise<Response> {
  const { requireAuth } = await import('./lib/auth');
  await requireAuth(request, env);
  const { results } = await env.DB.prepare('SELECT * FROM ingredient_categories ORDER BY sort_order').all();
  return Response.json(results);
}
