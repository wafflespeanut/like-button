# 🌐 Like Button Everywhere

A privacy-first browser extension using [Cloudflare Workers](https://workers.cloudflare.com/) backend that lets anyone **like or dislike _any_ web page** — from YouTube videos to arXiv papers, `.onion` sites, or the most obscure blog post — without creating an account. A like button for the web, if you want.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![Cloudflare Workers](https://img.shields.io/badge/Powered_by-Cloudflare_Workers-orange)](https://workers.cloudflare.com/) [![TypeScript](https://img.shields.io/badge/code-TypeScript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

## 🙏 Acknowledgements

* [@letmutx](https://github.com/letmutx) for idea
* ChatGPT o3 model for codegen

## ✨ Features
- **Universal** – works on _any_ URL, not just one domain
- **Anonymous** – no sign-in, no cookies/trackers, no IP logging
- **Bot-resistant** – lightweight Proof-of-Work (PoW) runs in a web worker before every vote
- **Serverless** – uses Cloudflare Workers + Durable Objects for global low-latency scalable voting

## 🖼️ How It Works

1. The extension injects a small floating container (`<div id="ld-container">`) into every page.
2. On hover, it fetches existing like/dislike counts from the worker backend.
3. On clicking a vote, it requests a challenge from CF worker backend, uses the browser's web worker to solve a tiny hash-cash PoW puzzle (adjusted through `POW_DIFFICULTY` in server env) and POSTs the `nonce` to the backend.
4. CF worker validates the nonce and updates the relevant durable object for that domain and returns the updated counts which gets displayed in the container.

## 🛠️ Tech Stack

| Layer     | Tech                                                                  |
| --------- | --------------------------------------------------------------------- |
| Front-End | Browser Extension APIs (MV3), Node, TypeScript |
| Anti-Bot  | Client-side Proof-of-Work (Web Crypto SHA-256) with short-lived challenge                      |
| Backend   | Cloudflare Workers, Cloudflare Durable Objects

## ⚡ Quick Start

### 1. Setup

```bash
git clone https://github.com/wafflespeanut/like-button
cd like-button
npm i
npm run build  # generates extension/dist and worker/dist
```

### 2. Cloudflare Worker

```bash
npx wrangler secret put POW_SECRET      # stateless sign + verify
npx wrangler secret put POW_DIFFICULTY  # PoW difficulty (default: 5)
npx wrangler secret put TTL_SECS        # Challenge expiry (default: 20s)
npm run deploy --workspace worker
```

### 3. Browser Extension

- Chrome/Edge: `chrome://extensions` → Dev mode → Load unpacked → `dist/`
- Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add‑on → select `dist/manifest.json`
- Safari: `xcrun safari-web-extension-converter dist` then open the generated Xcode project and run.
