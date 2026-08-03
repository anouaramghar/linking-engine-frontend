# LinkMesh dashboard

The LinkMesh frontend is a React and Vite dashboard for connecting sites, reviewing
internal-link suggestions, starting crawl and publish jobs, and monitoring their
progress. Browser requests stay on the same origin and are proxied to the LinkMesh
backend in both development and production.

## Requirements

- Node.js 22 and npm
- A running LinkMesh backend
- A LinkMesh API key for the production container; local Vite may omit it only
  when backend authentication is disabled

## Local development

From this directory in Windows PowerShell:

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run dev
```

Open <http://127.0.0.1:5173>. Vite forwards `/api` requests to `BACKEND_URL`.

Edit `.env` for your local backend:

```dotenv
VITE_API_BASE_URL=/api
BACKEND_URL=http://127.0.0.1:8000
LINKMESH_API_KEY=replace-with-your-local-key
```

`LINKMESH_API_KEY` is read only by the Vite development server and proxy. Never
rename it with a `VITE_` prefix: Vite exposes every `VITE_` variable to browser
JavaScript.

## Quality checks

```powershell
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

The production build is written to `dist/`. Inter and EB Garamond are bundled by
Fontsource, so the deployed dashboard does not contact Google Fonts.

## Production container

Build the nginx image:

```powershell
docker build -t linkmesh-dashboard:local .
```

Run it against a backend on the Windows host:

```powershell
docker run --rm --name linkmesh-dashboard -p 8080:80 `
  -e BACKEND_URL=http://host.docker.internal:8000 `
  -e LINKMESH_API_KEY=replace-with-your-api-key `
  linkmesh-dashboard:local
```

Then open <http://127.0.0.1:8080>.

For a Compose deployment, set `BACKEND_URL` to the backend service name, such as
`http://api:8000`. The container deliberately exits before nginx starts when
`LINKMESH_API_KEY` is missing or empty; this prevents an unresolved template
variable or an unauthenticated proxy from presenting as a backend outage.

## Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | Browser build | `/api` | Same-origin base path for API requests |
| `BACKEND_URL` | Vite and nginx proxies | `http://127.0.0.1:8000` in development; `http://api:8000` in the image | Backend origin |
| `LINKMESH_API_KEY` | Vite and nginx proxies | None | Server-side `X-API-Key` header; required by the production image |

Do not commit `.env`; only `.env.example` belongs in Git.
