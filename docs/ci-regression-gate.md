# CI Regression Gate

The admin shell regression gate runs the existing validation layers in this order:

```bash
npm test
npm run lint
npm run build
npm run test:smoke
```

`npm run test:smoke` is a Playwright browser smoke suite for the admin shell. It must run on a machine or CI runner that can launch a browser; the GitHub Actions workflow installs Playwright Chromium with `npx playwright install --with-deps chromium`.

The smoke suite intercepts the minimal API reads needed to render an authenticated admin shell. It does not validate backend behavior, booking/rental/payment workflows, inventory updates, or business data persistence.
