self.onmessage = async (e) => {
  const { token, difficulty } = e.data as { token: string; difficulty: number };
  let nonce = 0;
  const targetPrefix = "0".repeat(difficulty);
  while (true) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${token}:${nonce}`));
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hex.startsWith(targetPrefix)) {
      (self as any).postMessage({ nonce });
      break;
    }
    nonce++;
  }
};
