import { requireAuth, requireRole, hashPassword } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function handleUsers(request: Request, env: Env, _url: URL): Promise<Response> {
  const user = await requireAuth(request, env);

  if (request.method === 'GET') {
    requireRole(user, 'admin');
    const { results } = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at').all();
    return Response.json(results);
  }

  if (request.method === 'POST') {
    requireRole(user, 'admin');
    const { name, email, password, role } = await request.json() as { name: string; email: string; password: string; role?: string };

    if (!name || !email || !password) {
      return Response.json({ error: 'Navn, email og kodeord er påkrævet' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const password_hash = await hashPassword(password);
    const created_at = new Date().toISOString();

    await env.DB.prepare(
      'INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, name, email, password_hash, role ?? 'member', created_at).run();

    return Response.json({ id, name, email, role: role ?? 'member', created_at }, { status: 201 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function handleUser(request: Request, env: Env, id: string): Promise<Response> {
  const user = await requireAuth(request, env);
  requireRole(user, 'admin');

  if (request.method === 'PUT') {
    const { name, email, password, role } = await request.json() as { name?: string; email?: string; password?: string; role?: string };

    if (password) {
      const hash = await hashPassword(password);
      await env.DB.prepare('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), password_hash = ?, role = COALESCE(?, role) WHERE id = ?')
        .bind(name ?? null, email ?? null, hash, role ?? null, id).run();
    } else {
      await env.DB.prepare('UPDATE users SET name = COALESCE(?, name), email = COALESCE(?, email), role = COALESCE(?, role) WHERE id = ?')
        .bind(name ?? null, email ?? null, role ?? null, id).run();
    }

    const updated = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?').bind(id).first();
    return Response.json(updated);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405 });
}
