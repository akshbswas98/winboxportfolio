/* ============================================================================
   netlify/functions/notion.mjs

   Server-side proxy for the Notion API. Two reasons it has to exist:

     1. Notion does not send CORS headers, so a browser cannot call it directly.
     2. An integration token must never be shipped to the client.

   Served at /.netlify/functions/notion, or /api/content via netlify.toml.

   Uses Notion API version 2025-09-03, where a database is a container and a
   data source is the actual table. You configure database IDs; this resolves
   the matching data source IDs automatically.
   ========================================================================== */

const NOTION_VERSION = '2025-09-03';
const EDGE_TTL = 60; // seconds. Drag a Progress number in Notion, see it here.

/* Warm-instance memo: database_id -> data_source_id. */
const dsMemo = new Map();

function headers() {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  };
}

async function notion(path, init = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) }
  });
  if (!res.ok) {
    throw new Error(`Notion ${res.status} on ${path}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

/* Resolve a database ID to its first data source ID (cached per instance). */
async function dataSourceId(databaseId) {
  if (dsMemo.has(databaseId)) return dsMemo.get(databaseId);

  const db = await notion(`/databases/${databaseId}`);
  const ds = (db.data_sources || [])[0];

  if (!ds) {
    throw new Error(
      `No data source found under database ${databaseId}. ` +
      `Check the database is shared with your Notion connection.`
    );
  }
  dsMemo.set(databaseId, ds.id);
  return ds.id;
}

async function query(databaseId, body) {
  if (!databaseId) return [];
  const id = await dataSourceId(databaseId);
  const res = await notion(`/data_sources/${id}/query`, {
    method: 'POST',
    body: JSON.stringify({ page_size: 100, ...body })
  });
  return res.results || [];
}

/* ------------------------------------------------------- property readers */

const txt = p => (p?.title ?? p?.rich_text ?? []).map(t => t.plain_text).join('');
const num = p => p?.number ?? null;
const url = p => p?.url ?? null;
const sel = p => p?.select?.name ?? null;
const multi = p => (p?.multi_select ?? []).map(s => s.name);
const flag = p => p?.checkbox ?? false;
const date = p => p?.date?.start ?? null;
const file = p => p?.files?.[0]?.file?.url ?? p?.files?.[0]?.external?.url ?? null;
const clamp = n => Math.max(0, Math.min(100, Number(n) || 0));

/* ----------------------------------------------------------------- shapers */

function shapeBook(p) {
  const x = p.properties;
  return {
    title: txt(x.Title),
    author: txt(x.Author),
    cover: file(x.Cover),
    progress: clamp(num(x.Progress)), // plain 0-100, clamped at the edge
    status: sel(x.Status),
    started: date(x.Started),
    rating: num(x.Rating),
    note: url(x.Note)
  };
}

function shapeCert(p) {
  const x = p.properties;
  return {
    title: txt(x.Title),
    issuer: txt(x.Issuer),
    cred: txt(x['Credential ID']),
    url: url(x.URL),
    badge: file(x.Badge),
    issued: date(x.Issued),
    expires: date(x.Expires),
    order: num(x.Order) ?? 999
  };
}

function shapeProject(p) {
  const x = p.properties;
  return {
    title: txt(x.Title),
    summary: txt(x.Summary),
    description: txt(x.Description),
    stack: multi(x.Stack),
    repo: url(x.Repo),
    live: url(x.Live),
    caseStudy: url(x['Case Study']),
    video: url(x.Video),
    cover: file(x.Cover),
    year: num(x.Year),
    featured: flag(x.Featured),
    order: num(x.Order) ?? 999
  };
}

const byOrder = (a, b) => (a.order ?? 999) - (b.order ?? 999);

/* ----------------------------------------------------------------- handler */

export default async function handler(req) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        // Must be set here: netlify.toml [[headers]] does not apply to functions.
        'Cache-Control': `public, max-age=0, s-maxage=${EDGE_TTL}, stale-while-revalidate=600`,
        'Access-Control-Allow-Origin': '*'
      }
    });

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  if (!process.env.NOTION_TOKEN) {
    console.error('[notion] NOTION_TOKEN is not set');
    return json({ error: 'not_configured' }, 500);
  }

  try {
    const [books, certifications, projects] = await Promise.all([
      query(process.env.BOOKS_DB_ID, {
        filter: { property: 'Status', select: { equals: 'Reading' } },
        sorts: [{ property: 'Started', direction: 'descending' }]
      }).then(r => r.map(shapeBook)),

      query(process.env.CERTS_DB_ID, {
        sorts: [{ property: 'Order', direction: 'ascending' }]
      }).then(r => r.map(shapeCert).sort(byOrder)),

      query(process.env.PROJECTS_DB_ID, {
        sorts: [{ property: 'Order', direction: 'ascending' }]
      }).then(r => r.map(shapeProject).sort(byOrder))
    ]);

    return json({ books, certifications, projects, fetchedAt: new Date().toISOString() });
  } catch (err) {
    // Non-2xx on purpose: content.js sees the failure and uses the static
    // fallback rather than rendering nothing.
    console.error('[notion]', err.message);
    return json({ error: 'upstream_unavailable' }, 502);
  }
}