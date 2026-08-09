import fs from 'fs';
import path from 'path';

const outputPath = path.resolve('src/data/vigil-data.json');
const empty = () => ({
  latestCommit: null,
  myStats: null,
  lastWeekHourly: Array.from({ length: 7 }, () => Array(24).fill(0)),
  lastWeekDaily: [],
  hourLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  privateRepos: [],
  fetchedAt: new Date().toISOString(),
});

let envVars = {};
try {
  const envFile = fs.readFileSync('.env', 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const eq = trimmed.indexOf('=');
      if (eq > 0) envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
  }
} catch {}

const BASE = envVars.VIGIL_API_BASE_URL || process.env.VIGIL_API_BASE_URL || 'https://vigil.emiliano-go.com';
const KEY = envVars.VIGIL_API_KEY || process.env.VIGIL_API_KEY;

if (!KEY) {
  console.warn('[vigil] No VIGIL_API_KEY set. Writing empty data file.');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(empty(), null, 2));
  process.exit(0);
}

const headers = { 'X-API-Key': KEY };

async function get(p) {
  const res = await fetch(`${BASE}/api${p}`, { headers });
  if (!res.ok) throw new Error(`API ${p}: ${res.status}`);
  return res.json();
}

async function main() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  let latestCommit = null;
  let myLatestCommit = null;
  let repos = [];
  let authors = [];
  let range = [];

  try {
    const commits = get('/commits?limit=50');
    [latestCommit, repos, authors] = await Promise.all([
      commits.then(r => r[0] || null),
      get('/repos'),
      get('/stats/authors'),
    ]);
  } catch (e) {
    console.warn('[vigil] Initial fetch failed:', e.message);
  }

  const privateRepos = repos.filter(r => r.private).map(r => r.full_name);

  const authorTotals = {};
  for (const a of authors) {
    authorTotals[a.author_login] = (authorTotals[a.author_login] || 0) + a.total;
  }
  const knownBots = /\[bot\]$/;
  const sortedAuthors = Object.entries(authorTotals)
    .filter(([login]) => !knownBots.test(login) && login !== '')
    .sort(([, a], [, b]) => b - a);
  const myLogin = sortedAuthors[0]?.[0] || latestCommit?.author_login || 'emiliano-go';

  try {
    const myCommits = await get(`/commits?limit=100`);
    myLatestCommit = myCommits.find(c => c.author_login === myLogin) || latestCommit;
  } catch (e) {
    console.warn('[vigil] My-commits fetch failed:', e.message);
    myLatestCommit = latestCommit;
  }

  const myAuthorRows = authors.filter(a => a.author_login === myLogin);
  const myTotalCommits = myAuthorRows.reduce((s, a) => s + a.total, 0);
  const myRepos = new Set(myAuthorRows.map(a => a.repo));
  let myMostActiveRepo = null;
  let myMostActiveRepoTotal = 0;
  for (const a of myAuthorRows) {
    if (a.total > myMostActiveRepoTotal) {
      myMostActiveRepo = a.repo;
      myMostActiveRepoTotal = a.total;
    }
  }

  try {
    const since = weekAgo.toISOString();
    range = await get(`/stats/activity-range?since=${encodeURIComponent(since)}`);
  } catch (e) {
    console.warn('[vigil] Activity-range fetch failed:', e.message);
  }

  const myCommits = range.filter(c => c.author_login === myLogin);

  let streak = 0;
  try {
    const s = await get(`/stats/streak/${encodeURIComponent(myLogin)}`);
    streak = s.current_streak ?? 0;
  } catch (e) {
    console.warn('[vigil] Streak fetch failed:', e.message);
  }

  const lastWeekHourly = Array.from({ length: 7 }, () => Array(24).fill(0));
  const dailyMap = {};
  let myBusiestDay = null;
  let myBusiestDayTotal = 0;

  for (const c of myCommits) {
    const d = new Date(c.committed_at);
    const day = d.getUTCDay();
    const hour = d.getUTCHours();
    lastWeekHourly[day][hour]++;

    const dayKey = c.committed_at.slice(0, 10);
    dailyMap[dayKey] = (dailyMap[dayKey] || 0) + 1;
  }

  for (const [day, total] of Object.entries(dailyMap)) {
    if (total > myBusiestDayTotal) {
      myBusiestDay = day;
      myBusiestDayTotal = total;
    }
  }

  const lastWeekDaily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, total]) => ({ period, total }));

  const repoWeekMap = {};
  for (const c of myCommits) {
    repoWeekMap[c.repo] = (repoWeekMap[c.repo] || 0) + 1;
  }
  let mostActiveRepoWeek = null;
  let mostActiveRepoWeekTotal = 0;
  for (const [repo, total] of Object.entries(repoWeekMap)) {
    if (total > mostActiveRepoWeekTotal) {
      mostActiveRepoWeek = repo;
      mostActiveRepoWeekTotal = total;
    }
  }

  const ensureZ = s => s && !s.endsWith('Z') ? s + 'Z' : s;

  const output = {
    latestCommit: myLatestCommit ? {
      repo: myLatestCommit.repo,
      sha: myLatestCommit.sha,
      author_login: myLatestCommit.author_login,
      message: myLatestCommit.message,
      committed_at: ensureZ(myLatestCommit.committed_at),
      is_merge: myLatestCommit.is_merge,
    } : (latestCommit ? {
      repo: latestCommit.repo,
      sha: latestCommit.sha,
      author_login: latestCommit.author_login,
      message: latestCommit.message,
      committed_at: ensureZ(latestCommit.committed_at),
      is_merge: latestCommit.is_merge,
    } : null),
    myStats: {
      login: myLogin,
      totalCommits: myTotalCommits,
      streak,
      totalRepos: myRepos.size,
      mostActiveRepo: myMostActiveRepo,
      mostActiveRepoTotal: myMostActiveRepoTotal,
      busiestDay: myBusiestDay,
      busiestDayTotal: myBusiestDayTotal,
      mostActiveRepoWeek,
      mostActiveRepoWeekTotal,
    },
    lastWeekHourly,
    lastWeekDaily,
    hourLabels: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    privateRepos,
    fetchedAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`[vigil] Data written for ${myLogin}: ${myTotalCommits} commits`);
}

main().catch(err => {
  console.warn('[vigil] Fatal:', err.message);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(empty(), null, 2));
});
