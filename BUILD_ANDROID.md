# Build APK/AAB For Real Device

## 1) Prepare API URL

Edit `eas.json`:
- `build.preview.env.EXPO_PUBLIC_API_URL` = backend URL for real phone test.
- `build.production.env.EXPO_PUBLIC_API_URL` = production backend URL.

For local backend test on same Wi-Fi:
- Use `http://<YOUR_PC_LAN_IP>:4000`
- Example: `http://192.168.1.10:4000`

If you need to use app on a different network, use a public backend URL (HTTPS) or tunnel URL.
You can also change API URL directly in app at Login screen (`Change API URL`).

## 2) Login EAS

```powershell
npx eas login
```

## 3) Build APK (install directly on phone)

```powershell
npm run build:apk
```

After build finishes, open the build URL and download `.apk`.

## 4) Build AAB (upload to Google Play)

```powershell
npm run build:aab
```

## 5) Optional submit to Play Console

```powershell
npm run submit:android
```

## Notes

- Keep backend server running and reachable from phone network.
- Do not use `localhost` or `10.0.2.2` in APK for real device.

## One-command auto tunnel + APK (recommended for your workflow)

From `DisasterResponseNetwork` folder:

```powershell
npm run apk:auto
```

What this command does:
- checks backend `http://localhost:4000/health`
- starts Cloudflare quick tunnel in background
- auto reads latest `https://...trycloudflare.com`
- updates `app.json` with new `expo.extra.apiBaseUrl`
- builds `android/app/build/outputs/apk/release/app-release.apk`

Optional:

```powershell
npm run apk:auto:no-build
```

This only starts tunnel and updates app config (no APK build).

Stop background tunnel:

```powershell
npm run tunnel:stop
```

## Fixed URL mode (Cloudflare Named Tunnel)

If you already have named tunnel token + fixed hostname URL:

1) Save named tunnel config in backend:

```powershell
cd C:\Users\Admin\Downloads\back-end
npm run tunnel:setup -- -PublicUrl https://api.your-domain.com -TunnelToken <TOKEN>
```

2) Build app using named tunnel fixed URL:

```powershell
cd C:\Users\Admin\Downloads\DisasterResponseNetwork
npm run apk:auto:named
```

Now app keeps a stable API URL and does not require manual API URL edits every restart.
