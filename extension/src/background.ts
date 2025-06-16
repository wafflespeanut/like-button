
import { api } from "./utils/browser";

const API_BASE = "https://like-button.waffles.workers.dev";

type VoteRequest = {
  url: string;
  value?: 1 | -1; // 1 for like, -1 for dislike
}

type VoteResponse = {
  ok: boolean;
  url?: string;
  hash?: string;
  likes?: number;
  dislikes?: number;
}

api.runtime.onMessage.addListener((msg, _, sendResponse) => {
  let handle = async (handler: (msg: VoteRequest) => Promise<VoteResponse>) => {
    return handler(msg)
      .then((res) => sendResponse(res))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
  };

  if (msg.type === "vote") {
    handle(handleVote);
  } else if (msg.type == "counts") {
    handle(handleCounts);
  } else {
    sendResponse({ ok: false, error: "Unknown message type" });
  }
  return true; // keep message channel open for async reply
});

async function handleVote(msg: VoteRequest): Promise<VoteResponse> {
  // 1. Ask backend for a PoW challenge specific to this URL
  const challenge = await fetch(`${API_BASE}/challenge?url=` + encodeURIComponent(msg.url)).then(r => r.json());
  // 2. Solve challenge in dedicated worker (keeps UI thread free)
  const { nonce } = await solveChallenge(challenge);
  // 3. Submit vote along with PoW solution
  const body = JSON.stringify({
      url: msg.url,
      like: msg.value === 1,
      dislike: msg.value === -1,
      token: challenge.token,
      nonce,
    });
  const voteRes = await fetch(`${API_BASE}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  }).then(async (r) => {
    if (!r.ok) {
      throw new Error(`Vote failed (challenge: ${JSON.stringify(challenge)}, body: ${body}) with status ${r.status}: ${await r.text()}`);
    }
    return await r.json();
  });

  // 4. Persist locally so buttons stay disabled on future visits
  if (voteRes.likes !== undefined && voteRes.dislikes !== undefined) {
    return { ok: true, ...voteRes};
  }
  throw new Error(`Vote not counted? (challenge: ${JSON.stringify(challenge)}, body: ${body}): ${JSON.stringify(voteRes)}`);
}

async function handleCounts(msg: VoteRequest): Promise<VoteResponse> {
  const res = await fetch(`${API_BASE}/votes?url=${encodeURIComponent(msg.url)}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch counts for ${msg.url}: ${res.status} ${await res.text()}`);
  };
  const voteRes = await res.json();
  return { ok: true, ...voteRes };
}

async function solveChallenge(challenge: { difficulty: number; token: string }): Promise<{ nonce: number }> {
  let nonce = 0;
  const targetPrefix = "0".repeat(challenge.difficulty);
  while (true) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${challenge.token}:${nonce}`));
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex.startsWith(targetPrefix)) {
      return { nonce };
    }
    nonce++;
  }
}
