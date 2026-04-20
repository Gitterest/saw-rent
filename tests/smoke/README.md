# Admin Shell Smoke Tests

Run the browser-level admin shell smoke suite with:

```bash
npm run test:smoke
```

The suite uses Playwright against a Vite dev server and a Chromium browser. It intercepts the minimal API reads required to render an authenticated admin shell, so it does not exercise backend logic or mutate rental data.

In CI or a fresh local environment, install the browser runtime first:

```bash
npx playwright install --with-deps chromium
```

The smoke suite must run on a machine or runner that can spawn a browser process. Sandboxed environments that block browser launch cannot execute this suite.

## Covered

- Clean `/admin` boot with no open windows.
- Normal boot does not auto-restore a stale saved workspace.
- Start menu launches an admin module.
- Launched windows become active and appear in the taskbar.
- Taskbar minimize and restore behavior.
- Workspace controls: Restore Workspace, Tile Windows, Reset Window Positions, and Clear Workspace.

## Not Covered

- Auth implementation, login form behavior, cookies, or backend session storage.
- Booking, rental, payment, inventory, maintenance, or settings workflows.
- Full drag/resize interaction coverage.
- Cross-browser matrix or mobile shell behavior.
