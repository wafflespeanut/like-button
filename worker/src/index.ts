import { DurableObject } from "cloudflare:workers";

interface EnvType extends Env {
	POW_DIFFICULTY: string;
	POW_SECRET: string;
	TTL_SECS: string;
}

type TotalCount = {
	total: number;
}

const JSON_HEADERS = {
	"Content-Type": "application/json;charset=utf-8",
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function jsonError(msg: string): Response {
	return new Response(JSON.stringify({ error: msg }), {
		status: 400,
		headers: JSON_HEADERS,
	});
}

// TODO: check if this is slow
async function urlHashSHA64(canonical_url: string): Promise<bigint> {
	const data = new TextEncoder().encode(canonical_url);
	const buf = await crypto.subtle.digest("SHA-256", data);
	const view = new DataView(buf);
	const hi = BigInt(view.getUint32(0));
	const lo = BigInt(view.getUint32(4));
	return (hi << 32n) | lo;
}

export class Counter extends DurableObject {
	sql: SqlStorage;

	/**
	 * The constructor is invoked once upon creation of the Durable Object, i.e. the first call to
	 * 	`DurableObjectStub::get` for a given identifier (no-op constructors can be omitted)
	 *
	 * @param ctx - The interface for interacting with Durable Object state
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 */
	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql = ctx.storage.sql;
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS counters (
				hash      INTEGER NOT NULL,
				url       TEXT    NOT NULL,
				likes     INTEGER DEFAULT 0,
				dislikes  INTEGER DEFAULT 0,
				PRIMARY KEY (hash, url)
			) WITHOUT ROWID;

			CREATE INDEX IF NOT EXISTS counters_hash_idx ON counters(hash);
		`);
	}

	/**
	 *  Increments the counter for a given URL by a specified count.
	 *
	 * @param url  - The URL to increment the counter for
	 * @param count - The number to increment the counter by
	 * @returns The new value of the counter after incrementing
	 * @throws Error if the count is not 1 or -1
	 */
	async increment(hash: bigint, url: string, count: number): Promise<number> {
		if (count !== 1 && count !== -1) {
			throw new Error("Count must be either 1 or -1");
		}

		const cursor = this.sql.exec<TotalCount>(`
			INSERT INTO counters (hash, url, likes, dislikes)
			VALUES (?, ?, 0, 0)
			ON CONFLICT(hash, url) DO UPDATE SET likes = likes + ?, dislikes = dislikes + ?
			RETURNING likes + dislikes AS total;
		`, [hash, url, count === 1 ? 1 : 0, count === -1 ? 1 : 0]);
		return [...cursor][0].total;
	}
}

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.jsonc
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request: Request, env: EnvType, ctx: ExecutionContext): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: JSON_HEADERS });
		}

		const urlObj      = new URL(request.url);
		const path        = urlObj.pathname;
		// TODO: increase difficulty based on request rate
		const difficulty  = Number(env.POW_DIFFICULTY ?? 5) || 5;
		const ttl_secs    = Number(env.TTL_SECS ?? 20) || 20; // 20-sec default TTL
		const key         = await crypto.subtle.importKey(
			"raw",
			new TextEncoder().encode(env.POW_SECRET),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"]
		);

		if (request.method === "GET" && path === "/challenge") {
			let voteURL;
			try {
				voteURL = new URL(urlObj.searchParams.get("url") ?? "");
			} catch {
				return jsonError("Missing or malformed URL parameter");
			}

			const urlHash = await urlHashSHA64(voteURL.href);
			const seed    = crypto.randomUUID().replace(/-/g, "");
			const exp     = Math.floor(Date.now() / 1000) + ttl_secs;
			const payload = `${seed}:${urlHash}:${exp}`;
			const sigBuf  = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
			const sigHex  = [...new Uint8Array(sigBuf)].map(b => b.toString(16).padStart(2, "0")).join("");
			const token   = btoa(`${payload}:${sigHex}`);
			return new Response(JSON.stringify({ token, difficulty }), { headers: JSON_HEADERS });
		}

		if (request.method === "POST" && path === "/vote") {
			const body = await request.json() as {
				url: string; like: boolean; dislike: boolean;
				nonce: number; token: string;
			};

			let voteURL: URL;
			try {
				voteURL = new URL(body.url);
			} catch {
				return jsonError("Malformed page URL");
			}

			if (!body.like && !body.dislike)
				return jsonError("Missing like or dislike field");

			let { token, nonce } = body;
			const raw = atob(token);
			const [seed, urlHashStr, expStr, sigHex] = raw.split(":");
			const exp  = Number(expStr);
			const urlHashExpected = await urlHashSHA64(voteURL.href);
			if (urlHashExpected.toString() !== urlHashStr) {
				return jsonError("Invalid URL hash");
			}
			if (exp < Math.floor(Date.now() / 1000)) {
				return jsonError("Token expired");
			}
			const validSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${seed}:${urlHashStr}:${expStr}`));
			let matchingSigHex = [...new Uint8Array(validSig)].map(b => b.toString(16).padStart(2, "0")).join("");
			if (sigHex !== matchingSigHex) return jsonError("Bad signature");

			const targetPrefix = "0".repeat(difficulty);
			const digestBuf    = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${token}:${nonce}`));
			const digestHex = [...new Uint8Array(digestBuf)]
				.map(b => b.toString(16).padStart(2, "0"))
				.join("");
			if (!digestHex.startsWith(targetPrefix)) {
				return jsonError("Invalid proof-of-work");
			}

			const domain = voteURL.hostname.toLowerCase();
			const id   = env.COUNTER.idFromName(domain);
			const stub = env.COUNTER.get(id);
			let total = await stub.increment(urlHashExpected, voteURL.href, body.dislike ? -1 : 1);
			return new Response(JSON.stringify({ total }), { headers: JSON_HEADERS });
		}

		return new Response("Not found", { status: 404, headers: JSON_HEADERS });
	}
} satisfies ExportedHandler<EnvType>;
