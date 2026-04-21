import { handleLogin, handleMe } from './routes/auth';
import { handleUsers, handleUser } from './routes/users';
import { handleShopping, handleShoppingItem, handleShoppingCheck } from './routes/shopping';
import { handleIngredients, handleIngredient, handleIngredientCategories, handleIngredientCategory } from './routes/ingredients';
import { handleRecipes, handleRecipe, handleRecipeIngredients, handleRecipeImage } from './routes/recipes';
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
  ANTHROPIC_API_KEY_MADPLAN: string;
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

      // Auth
      if (path === '/api/auth/login' && request.method === 'POST') {
        response = await handleLogin(request, env);
      } else if (path === '/api/auth/me' && request.method === 'GET') {
        response = await handleMe(request, env);
      }

      // Users
      else if (path === '/api/users') {
        response = await handleUsers(request, env, url);
      } else if (path.startsWith('/api/users/')) {
        const id = path.split('/')[3];
        response = await handleUser(request, env, id);
      }

      // Shopping — order matters: /checked before /:id, /check after /:id/check
      else if (path === '/api/shopping') {
        response = await handleShopping(request, env);
      } else if (path === '/api/shopping/checked' && request.method === 'DELETE') {
        response = await handleShopping(request, env);
      } else if (path.match(/^\/api\/shopping\/[^/]+\/check$/)) {
        const id = path.split('/')[3];
        response = await handleShoppingCheck(request, env, id);
      } else if (path.match(/^\/api\/shopping\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleShoppingItem(request, env, id);
      }

      // Ingredients — specific paths before generic /:id
      else if (path === '/api/ingredients/categories') {
        response = await handleIngredientCategories(request, env);
      } else if (path.match(/^\/api\/ingredients\/categories\/[^/]+$/)) {
        const id = path.split('/')[4];
        response = await handleIngredientCategory(request, env, id);
      } else if (path === '/api/ingredients') {
        response = await handleIngredients(request, env, url);
      } else if (path.match(/^\/api\/ingredients\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleIngredient(request, env, id);
      }

      // Recipes
      else if (path === '/api/recipes') {
        response = await handleRecipes(request, env, url);
      } else if (path.match(/^\/api\/recipes\/[^/]+\/ingredients$/)) {
        const id = path.split('/')[3];
        response = await handleRecipeIngredients(request, env, id);
      } else if (path.match(/^\/api\/recipes\/[^/]+\/image$/)) {
        const id = path.split('/')[3];
        response = await handleRecipeImage(request, env, id);
      } else if (path.match(/^\/api\/recipes\/[^/]+$/)) {
        const id = path.split('/')[3];
        response = await handleRecipe(request, env, id);
      }

      // Meal plans
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

      // Templates
      else if (path === '/api/templates') {
        response = await handleTemplates(request, env);
      }

      // AI
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
