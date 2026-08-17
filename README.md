# LinkMesh dashboard

The LinkMesh frontend is a React and Vite dashboard for connecting sites, reviewing
internal-link suggestions, starting crawl and publish jobs, and monitoring their
progress. Browser requests stay on the same origin and are proxied to the LinkMesh
backend in both development and production.

## Trust boundary

The browser never holds the backend API key. Vite (development) and nginx
(production) inject `LINKMESH_API_KEY` only on the server side of the `/api`
proxy. Anyone who can reach that proxy therefore inherits full backend
authority for the key it holds.

Mitigations in this repo:

- Dev server and the documented Docker publish bind to **loopback only**.
- Unsafe `/api` methods require the custom header `X-LinkMesh-Client: dashboard`
  (sent by the SPA). Bare HTML form CSRF cannot set it.
- nginx accepts only allowlisted `Host` values (`localhost`, `127.0.0.1`, plus
  optional `LINKMESH_SERVER_NAMES`). Unknown hosts are dropped.
- Browser security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`, …).
- A restrictive Content Security Policy limits scripts, connections, images, fonts, and
  framing to the dashboard's expected same-origin resources.
- Telegram identifies each operator. First contact creates a pending request; an operator
  in the **access-admin group** must approve it before Telegram issues a one-time login
  code. An ordinary approved operator cannot approve or revoke anyone; the backend
  answers 403, and the hidden buttons are only the courtesy on top of that.
- nginx verifies the resulting session before it injects the shared backend key.

Telegram login is a second layer, not permission to expose the service publicly. Keep the
deployment behind its IP-restricted firewall and put a TLS terminator in front of the
container before any non-loopback exposure; WordPress application passwords travel
through this path.

Admission is the only privilege that is split. The access-admin group governs who may
join and who may be removed — nothing else. It is not a data or site role: every approved
operator still sees every site, every queue and every suggestion, and there are no
per-person site scopes. See `docs/design/dashboard-authentication.md` in the engine repo.

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

Open <http://127.0.0.1:5173>. Vite listens on loopback only and forwards `/api`
requests to `BACKEND_URL`.

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

The browser E2E suite uses Playwright with a deterministic mocked API boundary.
Install Chromium once, then run the suite:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Playwright starts the Vite server itself on `127.0.0.1:4173`. The suite covers
the anonymous Telegram challenge and invalid-code recovery; site connection,
crawl and analysis queueing; Content Pool connection, approval and crawl;
suggestion selection; exact-edit approval; publication queueing; the required
unsafe-request marker; and SPA navigation. It does not contact Telegram, Tavily,
WordPress, or the runtime database; real connector validation belongs in the
staging pilot.

The production build is written to `dist/`. Inter and EB Garamond are bundled by
Fontsource, so the deployed dashboard does not contact Google Fonts.

## Production container

Build the nginx image:

```powershell
docker build -t linkmesh-dashboard:local .
```

Run it against a backend on the Windows host. Publish **only on loopback**
unless an authenticating TLS edge already protects the port:

```powershell
docker run --rm --name linkmesh-dashboard -p 127.0.0.1:8080:80 `
  -e BACKEND_URL=http://host.docker.internal:8000 `
  -e LINKMESH_API_KEY=replace-with-your-api-key `
  linkmesh-dashboard:local
```

Then open <http://127.0.0.1:8080>.

For a named host behind a TLS terminator, pass the public hostname so Host
allowlisting accepts it:

```powershell
docker run --rm --name linkmesh-dashboard -p 127.0.0.1:8080:80 `
  -e BACKEND_URL=http://host.docker.internal:8000 `
  -e LINKMESH_API_KEY=replace-with-your-api-key `
  -e LINKMESH_SERVER_NAMES=dashboard.example.com `
  linkmesh-dashboard:local
```

Terminate TLS on the reverse proxy in front of this container (HTTPS to
browsers). Do not treat plain `http://` on a routable interface as a supported
production path when operators enter WordPress credentials.

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
| `LINKMESH_SERVER_NAMES` | nginx | empty | Extra space-separated Host names accepted besides localhost / 127.0.0.1 |

Do not commit `.env`; only `.env.example` belongs in Git.
