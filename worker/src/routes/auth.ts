import { signJWT, comparePassword, requireAuth } from '../lib/auth';

interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const { email, password } = await request.json() as { email: string; password: string };

  if (!email || !password) {
    return Response.json({ error: 'Email og kodeord er påkrævet' }, { status: 400 });
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<{
    id: string; name: string; email: string; password_hash: string; role: string;
  }>();

  if (!user || !(await comparePassword(password, user.password_hash))) {
    return Response.json({ error: 'Forkert email eller kodeord' }, { status: 401 });
  }

  const token = await signJWT(
    { sub: user.id, role: user.role, name: user.name, exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 },
    env.JWT_SECRET
  );

  return Response.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}

export async function handleMe(request: Request, env: Env): Promise<Response> {
  const user = await requireAuth(request, env);

  const dbUser = await env.DB.prepare('SELECT id, name, email, role, created_at FROM users WHERE id = ?')
    .bind(user.id)
    .first();

  if (!dbUser) return Response.json({ error: 'Bruger ikke fundet' }, { status: 404 });

  return Response.json(dbUser);
}
