SvelteKit + Azure Functions + MapLibre + Azure Table Storage

This repo is my starter scaffold to build a single-page app that shows geo-located text data stored in Azure Table Storage. It includes:

- An Azure Functions backend (`functions/`) that exposes an HTTP endpoint to list geo posts from a table called `GeoPosts`.
- A SvelteKit frontend (`app/`) that uses MapLibre to display the posts on a map.
- Interactive map using MapLibre
- Geo‑tagged text posts - short stories linked to place, travel blog entries etc.
- Minimal admin UI for deletes and moderating
- Azure Table Storage for data
- Local development supported via Azurite
- No external API keys required


Quick steps

1. Install Azure Functions Core Tools (for local backend):

```bash
npm i -g azure-functions-core-tools@4 --unsafe-perm true
```

2. Backend setup

```bash
cd functions
npm install
# set TABLE_CONNECTION_STRING in local.settings.json or environment
npm run populate   # optional: populate sample data
func start          # runs function locally on http://localhost:7071
```

3. Frontend setup

```bash
cd app
npm install
npm run dev        # runs SvelteKit dev server (proxies /api to localhost:7071)
```

Notes

- Configure `TABLE_CONNECTION_STRING` (and optionally `TABLE_NAME`) in `functions/local.settings.json` or environment.
- The frontend proxies `/api` to the local function runtime so `fetch('/api/getPosts')` works during dev.

API endpoints

- `GET /api/getPosts` — lists all posts from the `GeoPosts` table.
- `POST /api/addPost` — create a new post. JSON payload: `{ "text": "...", "latitude": 47.6, "longitude": -122.3 }`.
