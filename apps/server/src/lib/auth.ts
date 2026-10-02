import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "qa_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
/** Socket tickets are single-purpose and short-lived: fetched over the cookie-authenticated API, used once on connect. */
const SOCKET_TICKET_TTL_SECONDS = 60;

type Purpose = "session" | "socket";

export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string) {
    this.key = new TextEncoder().encode(secret);
  }

  private sign(userId: string, purpose: Purpose, ttlSeconds: number) {
    return new SignJWT({ purpose })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuedAt()
      .setIssuer("quizarena")
      .setAudience(`quizarena:${purpose}`)
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.key);
  }

  signSession(userId: string) {
    return this.sign(userId, "session", SESSION_TTL_SECONDS);
  }

  signSocketTicket(userId: string) {
    return this.sign(userId, "socket", SOCKET_TICKET_TTL_SECONDS);
  }

  /** Returns the user id, or null for any invalid/expired/mis-scoped token. */
  async verify(token: string, purpose: Purpose): Promise<string | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: "quizarena",
        audience: `quizarena:${purpose}`,
        algorithms: ["HS256"],
      });
      return typeof payload.sub === "string" ? payload.sub : null;
    } catch {
      return null;
    }
  }
}

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** A real hash compared against for unknown emails, so login timing doesn't reveal which exist. */
let dummyHash: Promise<string> | null = null;
export const getDummyHash = () => (dummyHash ??= bcrypt.hash("quizarena-timing-equaliser", 12));

/** Reconnect tokens: 32 random bytes for the player, only the SHA-256 is stored. */
export function createPlayerToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokensMatch(token: string, hash: string) {
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
