export async function onRequest(context) {
  const { env } = context;
  const BASE = env.VIGIL_API_BASE_URL || 'https://vigil.emiliano-go.com';
  const KEY = env.VIGIL_API_KEY;

  const empty = () => ({
    latestCommit: null, myStats: null,
    last24hHourly: Array(24).fill(0),
    lastWeekDaily: [], hourLabels: Array(24).fill('--'),
    privateRepos: [], fetchedAt: new Date().toISOString(),
  });

  if (!KEY) {
    return new Response(JSON.stringify(empty()), { headers: { 'content-type': 'application/json' } });
  }

  const hdrs = { 'X-API-Key': KEY };
  async function get(p) {
    const res = await fetch(`${BASE}/api${p}`, { headers: hdrs });
    if (!res.ok) throw new Error(`API ${p}: ${res.status}`);
    return res.json();
  }

  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [repos, authors, overview] = await Promise.all([
      get('/repos'), get('/stats/authors'), get('/stats/overview'),
    ]);

    const privateRepos = repos.filter(r => r.private).map(r => r.full_name);
    const authorTotals = {};
    for (const a of authors) authorTotals[a.author_login] = (authorTotals[a.author_login] || 0) + a.total;
    const knownBots = /\[bot\]$/;
    const sorted = Object.entries(authorTotals).filter(([l]) => !knownBots.test(l) && l !== '').sort(([,a],[,b]) => b - a);
    const myLogin = sorted[0]?.[0] || 'emiliano-go';

    let daily = { total: [] };
    try {
      daily = await get(`/stats/daily/authors?author_login=${encodeURIComponent(myLogin)}&days=7`);
    } catch {}

    let myLatestCommit = null;
    try {
      [myLatestCommit] = await get(`/commits?author_login=${encodeURIComponent(myLogin)}&limit=1`);
    } catch {}
    if (!myLatestCommit) {
      try {
        [myLatestCommit] = await get('/commits?limit=1');
      } catch {}
    }

    const myTotalCommits = overview?.total_commits ?? 0;
    const myAuthorRows = authors.filter(a => a.author_login === myLogin);
    const myRepos = new Set(myAuthorRows.map(a => a.repo));
    let myMostActiveRepo = null, myMostActiveRepoTotal = 0;
    for (const a of myAuthorRows) {
      if (a.total > myMostActiveRepoTotal) { myMostActiveRepo = a.repo; myMostActiveRepoTotal = a.total; }
    }

    let range = [];
    try {
      range = await get(`/stats/activity-range?since=${encodeURIComponent(weekAgo.toISOString())}`);
    } catch {}
    const myCommits = range.filter(c => c.author_login === myLogin);

    let streak = 0;
    try {
      const s = await get(`/stats/streak/${encodeURIComponent(myLogin)}`);
      streak = s.current_streak ?? 0;
    } catch {}

    const lastWeekDaily = (daily?.total || [])
      .sort(function(a, b) { return a.period.localeCompare(b.period); })
      .slice(-7);
    const repoWeekMap = {};
    let mostActiveRepoWeek = null, mostActiveRepoWeekTotal = 0;

    for (var ci = 0; ci < myCommits.length; ci++) {
      repoWeekMap[myCommits[ci].repo] = (repoWeekMap[myCommits[ci].repo] || 0) + 1;
    }
    for (const [repo, total] of Object.entries(repoWeekMap)) {
      if (total > mostActiveRepoWeekTotal) { mostActiveRepoWeek = repo; mostActiveRepoWeekTotal = total; }
    }

    // Last 24h hourly: use the zero-filled hourly range endpoint
    var now = new Date();
    var untilHour = new Date(now);
    untilHour.setUTCMinutes(0, 0, 0);
    if (now.getUTCMinutes() || now.getUTCSeconds() || now.getUTCMilliseconds()) {
      untilHour.setUTCHours(untilHour.getUTCHours() + 1);
    }
    var sinceHour = new Date(untilHour.getTime() - 24 * 60 * 60 * 1000);
    var hourlyRange = [];
    try {
      hourlyRange = await get(`/stats/hourly/authors/range?author_login=${encodeURIComponent(myLogin)}&since=${encodeURIComponent(sinceHour.toISOString())}&until=${encodeURIComponent(untilHour.toISOString())}`);
    } catch {}

    var last24hHourly = hourlyRange.map(function(row) { return row.total; });
    var last24hPeriods = hourlyRange.map(function(row) {
      var p = String(row.period);
      return (p.endsWith('Z') || p.includes('+')) ? p : p + 'Z';
    });
    var hourLabels24 = hourlyRange.map(function(row) {
      var p = String(row.period);
      var d = new Date((p.endsWith('Z') || p.includes('+')) ? p : p + 'Z');
      return String(d.getUTCHours()).padStart(2, '0');
    });
    while (last24hHourly.length < 24) {
      last24hHourly.push(0);
      hourLabels24.push('--');
      last24hPeriods.push('--');
    }
    var last24hTotal = last24hHourly.reduce(function(a, b) { return a + b; }, 0);

    var privateRepoSet = new Set(privateRepos);
    var activityRows24h = [];
    try {
      activityRows24h = await get(`/stats/activity-range?since=${encodeURIComponent(sinceHour.toISOString())}&until=${encodeURIComponent(untilHour.toISOString())}`);
    } catch {}

    var unique24hMyCommits = activityRows24h.filter(function(row) { return row && row.author_login === myLogin; });
    var ossCommits24h = unique24hMyCommits.filter(function(row) { return row && row.repo && !privateRepoSet.has(row.repo); }).length;

    const ensureZ = s => s && !s.endsWith('Z') ? s + 'Z' : s;

    const output = {
      latestCommit: myLatestCommit ? {
        repo: myLatestCommit.repo, sha: myLatestCommit.sha,
        author_login: myLatestCommit.author_login, message: myLatestCommit.message,
        committed_at: ensureZ(myLatestCommit.committed_at), is_merge: myLatestCommit.is_merge,
      } : null,
      myStats: {
        login: myLogin, totalCommits: myTotalCommits, streak, totalRepos: myRepos.size,
        mostActiveRepo: myMostActiveRepo, mostActiveRepoTotal: myMostActiveRepoTotal,
        mostActiveRepoWeek, mostActiveRepoWeekTotal,
      },
      last24hHourly: last24hHourly,
      last24hTotal,
      ossCommits24h,
      last24hPeriods,
      lastWeekDaily,
      hourLabels: hourLabels24,
      privateRepos, fetchedAt: new Date().toISOString(),
    };

    return new Response(JSON.stringify(output), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=60' },
    });
  } catch (e) {
    return new Response(JSON.stringify(empty()), {
      headers: { 'content-type': 'application/json' },
    });
  }
}
