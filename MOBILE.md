# Saw Rent Android Mobile Build

Saw Rent uses Capacitor to package the existing Vite + React app as Android. The web/Vercel build still uses `dist` and relative `/api` routes.

## Install And Sync

```bash
npm install
npm run mobile:build
npm run mobile:sync
npm run android:open
```

Installed Capacitor packages:

- `@capacitor/core`
- `@capacitor/cli`
- `@capacitor/android`
- `@capacitor/app`
- `@capacitor/status-bar`
- `@capacitor/splash-screen`
- `@capacitor/network`

## Build Commands

```bash
npm run build
npx cap sync android
npx cap open android
npm run android:build
```

Debug from Android Studio:

1. Run `npm run android:build`.
2. Run `npm run android:open`.
3. Select an emulator or Android device.
4. Use Android Studio Run for a debug APK launch.

Release AAB:

```bash
npm run android:release
```

On Windows PowerShell, use this equivalent if `./gradlew` is not executable:

```powershell
cd android
.\gradlew.bat bundleRelease
```

Release output:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

## Android App Settings

- App name: `Saw Rent`
- Package ID: `com.soflipco.sawrent`
- Web directory: `dist`
- Android project: `android/`
- Version code: `1`
- Version name: `1.0.0`
- minSdk: `24`
- targetSdk: `37`
- Orientation: portrait
- INTERNET permission: enabled
- Cleartext traffic: disabled
- Status bar: dark Saw Rent graphite
- Splash screen: configured placeholder
- Adaptive icon: configured placeholder
- App links: `https://soflipco.com`
- Custom scheme: `com.soflipco.sawrent://`

## Environment

Public client values are the only values allowed in the mobile bundle:

```bash
VITE_ANDROID_API_BASE_URL=https://soflipco.com/api
VITE_PUBLIC_APP_ORIGIN=https://soflipco.com
```

For local Android emulator testing against a backend on your machine:

```bash
VITE_ANDROID_API_BASE_URL=http://10.0.2.2:3000/api
VITE_ALLOW_LOCAL_API=true
```

Debug Android builds allow cleartext traffic for local emulator testing. Release builds keep cleartext disabled, and production must use an HTTPS API. Do not set Android API variables to localhost, `127.0.0.1`, or `10.0.2.2` for release builds.

Server-only secrets must stay in Vercel or the server runtime and must never use a `VITE_` prefix:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `CRYPTO_BTC_WALLET_SERVICE_TOKEN`
- `CRYPTO_XMR_WALLET_RPC_PASSWORD`
- wallet RPC URLs and private wallet credentials

For Android admin cookies, production should use:

```bash
ADMIN_COOKIE_SAMESITE=none
CLIENT_ALLOWED_ORIGINS=https://soflipco.com,https://www.soflipco.com,https://localhost,capacitor://localhost
```

## Signing

Generate a release key:

```bash
keytool -genkeypair -v -keystore saw-rent-release.jks -alias saw-rent -keyalg RSA -keysize 2048 -validity 10000
```

Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in the real passwords. Do not commit `android/keystore.properties` or `.jks` files.

Then run:

```bash
npm run android:release
```

## Google Play Upload

1. Build the signed AAB.
2. Open Google Play Console.
3. Create or select the Saw Rent app.
4. Upload `android/app/build/outputs/bundle/release/app-release.aab`.
5. Complete app content, data safety, target audience, and store listing.
6. Add a privacy policy URL.
7. Add screenshots, app icon, and feature graphic.
8. Run internal testing before production release.

## Store Asset Checklist

- 512 x 512 app icon
- 1024 x 500 feature graphic
- Phone screenshots
- 7-inch and 10-inch tablet screenshots if supporting tablets
- Privacy policy URL
- Data safety form covering rental requests, contact info, payment redirects, cookies/session use, and crypto payment metadata

## Testing Checklist

- `npm run lint`
- `npm run build`
- `npx cap sync android`
- `npm run android:build`
- Android debug launch
- Android release AAB generation
- Public renter request flow
- Checkout flow
- Stripe hosted checkout redirect/return behavior
- Crypto payment flow
- Admin login
- Contact form
- `?module=` deep links where supported
- Mobile OS shell full-screen windows
- Android back button closes panels/windows before history navigation
- Offline banner and backend unavailable errors
- No localhost in production Android bundle
- No server secrets in mobile bundle
- Vercel web deployment still works

## Future iOS

iOS is intentionally not generated yet. When ready, install `@capacitor/ios`, run `npx cap add ios`, and repeat signing, icon, splash, and App Store privacy review separately.
