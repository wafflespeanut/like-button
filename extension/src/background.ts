
import { api } from "./utils/browser";

const API_BASE = "https://like-button.waffles.workers.dev";

api.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === "vote") {
    handleVote(msg)
      .then((ok) => sendResponse({ ok }))
      .catch((e) => {
        console.error(e);
        sendResponse({ ok: false });
      });
  }
  return true; // keep message channel open for async reply
});

async function handleVote(msg: { url: string; value: 1 | -1 }): Promise<boolean> {
  // 1. Ask backend for a PoW challenge specific to this URL
  const challenge = await fetch("/challenge?url=" + encodeURIComponent(location.href)).then(r => r.json());
  // 2. Solve challenge in dedicated worker (keeps UI thread free)
  const { nonce } = await solveChallenge(challenge);
  // 3. Submit vote along with PoW solution
  const voteRes = await fetch(`${API_BASE}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: msg.url,
      like: msg.value === 1,
      dislike: msg.value === -1,
      token: challenge.token,
      nonce,
    }),
  });
  const ok = voteRes.ok;

  // 4. Persist locally so buttons stay disabled on future visits
  if (ok) {
    await api.storage.local.set({ [msg.url]: true });
  }
  return ok;
}

function solveChallenge(challenge: { difficulty: number; token: string }): Promise<{ nonce: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker("pow-worker.js");
    worker.postMessage(challenge);
    worker.onmessage = (e) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = reject;
  });
}
