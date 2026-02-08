import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import type { Address } from "viem";

const TOKEN_VERSION = "v1";
const IV_SIZE = 12;
const TAG_SIZE = 16;

export interface ClaimTokenPayload {
  claimTokenId: string;
  recipient: Address;
}

function getTokenSecret(): Buffer {
  const secret =
    process.env.CLAIM_TOKEN_SECRET ||
    process.env.ESCROW_PRIVATE_KEY ||
    "dev-unsafe-claim-token-secret";
  return createHash("sha256").update(secret).digest();
}

function toBase64Url(data: Buffer): string {
  return data
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function assertPayload(payload: unknown): asserts payload is ClaimTokenPayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid claim token payload");
  }

  const parsed = payload as Record<string, unknown>;
  if (
    typeof parsed.claimTokenId !== "string" ||
    typeof parsed.recipient !== "string" ||
    !/^0x[a-fA-F0-9]{40}$/.test(parsed.recipient)
  ) {
    throw new Error("Malformed claim token payload");
  }
}

export function createClaimToken(payload: ClaimTokenPayload): string {
  const key = getTokenSecret();
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const plaintext = Buffer.from(
    JSON.stringify({
      claimTokenId: payload.claimTokenId,
      recipient: payload.recipient.toLowerCase(),
    }),
    "utf8"
  );

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${TOKEN_VERSION}.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(encrypted)}`;
}

export function decodeClaimToken(token: string): ClaimTokenPayload {
  const [version, ivPart, tagPart, bodyPart] = token.split(".");
  if (!version || !ivPart || !tagPart || !bodyPart) {
    throw new Error("Invalid claim token format");
  }
  if (version !== TOKEN_VERSION) {
    throw new Error("Unsupported claim token version");
  }

  const iv = fromBase64Url(ivPart);
  const tag = fromBase64Url(tagPart);
  const body = fromBase64Url(bodyPart);
  if (iv.length !== IV_SIZE || tag.length !== TAG_SIZE || body.length === 0) {
    throw new Error("Invalid claim token data");
  }

  const key = getTokenSecret();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
  const payload = JSON.parse(plaintext.toString("utf8"));
  assertPayload(payload);
  return {
    claimTokenId: payload.claimTokenId,
    recipient: payload.recipient.toLowerCase() as Address,
  };
}
