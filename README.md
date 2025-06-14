## Like Button

A like/dislike button for the web.

1. **Install deps**: `npm i`
2. **Build**: `npm run build`
3. **Load unpacked**:
   - Chrome/Edge: `chrome://extensions` → Dev mode → Load unpacked → `dist/`
   - Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add‑on → select `dist/manifest.json`
   - Safari: `xcrun safari-web-extension-converter dist` then open the generated Xcode project and run.

The extension injects a floating like/dislike button on every webpage. Clicking triggers a challenge and a PoW‑backed vote which then gets persisted in the server.

#### Secrets

`POW_SECRET`, `POW_DIFFICULTY` and `TTL_SECS` are set in secrets through `npx wrangler secret put {VAR}` (although only `POW_SECRET` is truly secret).

#### Credits

@letmutx for idea, ChatGPT o3 for codegen
