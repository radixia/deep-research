/**
 * Manus webhook signature verification (RSA-SHA256).
 * @see https://open.manus.ai/docs/webhooks/security
 */

import { createHash, createVerify } from "node:crypto";

const MANUS_PUBLIC_KEY_URLS = [
  "https://api.manus.ai/v2/webhook.publicKey",
  "https://open.manus.ai/v1/webhook/public_key",
  "https://open.manus.im/v1/webhook/public_key",
];
const CACHE_TTL_MS = 3600_000; // 1 hour
const MAX_TIMESTAMP_AGE_SEC = 300; // 5 minutes

let cachedKey: string | null = null;
let cacheExpiry = 0;

export async function getManusPublicKey(apiKey: string): Promise<string> {
  if (cachedKey && Date.now() < cacheExpiry) return cachedKey;
  let lastErr: Error | null = null;
  for (const url of MANUS_PUBLIC_KEY_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "x-manus-api-key": apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (!res.ok) {
        lastErr = new Error(`${url}: ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { public_key?: string };
      if (data.public_key) {
        cachedKey = data.public_key;
        cacheExpiry = Date.now() + CACHE_TTL_MS;
        return cachedKey;
      }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Manus public key fetch failed");
}

export function verifyManusWebhook(params: {
  url: string;
  body: Buffer;
  signatureB64: string;
  timestamp: string;
  publicKeyPem: string;
}): boolean {
  const { url, body, signatureB64, timestamp, publicKeyPem } = params;

  const requestTime = parseInt(timestamp, 10);
  if (Number.isNaN(requestTime)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > MAX_TIMESTAMP_AGE_SEC) return false;

  const bodyHashHex = createHash("sha256").update(body).digest("hex");
  const signatureContent = `${timestamp}.${url}.${bodyHashHex}`;
  const contentHash = createHash("sha256").update(signatureContent, "utf8").digest();

  try {
    const verifier = createVerify("RSA-SHA256");
    verifier.update(contentHash);
    return verifier.verify(publicKeyPem, signatureB64, "base64");
  } catch {
    return false;
  }
}
