export async function onRequest(context) {
  const { env, request } = context;
  const BASE = env.VIGIL_API_BASE_URL || 'https://vigil.emiliano-go.com';
  const KEY = env.VIGIL_API_KEY;

  if (!KEY) {
    return new Response(JSON.stringify({ error: 'no key' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const reposParam = url.searchParams.get('repos') || '';
  const repos = reposParam.split(',').filter(Boolean);
  if (!repos.length) {
    return new Response(JSON.stringify({}), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const hdrs = { 'X-API-Key': KEY };
  const results = {};
  await Promise.all(repos.map(async (repo) => {
    try {
      const res = await fetch(`${BASE}/api/commits?repo=${encodeURIComponent(repo)}&limit=1`, { headers: hdrs });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.length > 0) {
        const c = data[0];
        const ensureZ = s => s && !s.endsWith('Z') ? s + 'Z' : s;
        results[repo] = {
          sha: c.sha, message: c.message, committed_at: ensureZ(c.committed_at),
          author_login: c.author_login,
        };
      } else {
        results[repo] = null;
      }
    } catch {}
  }));

  return new Response(JSON.stringify(results), {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60' },
  });
}
