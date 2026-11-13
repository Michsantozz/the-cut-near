import "server-only";
import { z } from "zod";
import { accountIdSchema } from "@/shared/lib/account-id";
import { ConfigError } from "./errors";
import { describeIssues, emptyToUndefined } from "./format";

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: "must be a postgres:// URL" });
const httpUrl = z.url({ protocol: /^https?$/, error: "must be an http(s) URL" });
const secretKey = z.string().regex(/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]+$/, "must be a NEAR private key (ed25519:...)");
const flag = z.preprocess(emptyToUndefined, z.enum(["true", "false", "1", "0"]).default("false")).transform((v) => v === "true" || v === "1");

const schema = z
  .object({
    /** "sample" serves the design's fictional data; "live" reads NEAR and Postgres. */
    DATA_SOURCE: z.preprocess(emptyToUndefined, z.enum(["sample", "live"]).default("sample")),
    /** Preferred RPC endpoint; the public endpoints of the network are the fallbacks. */
    NEAR_RPC_URL: optional(httpUrl),
    /** FastNEAR Transactions API base URL, the indexer's event source. Defaults to the network's. */
    NEAR_TX_API_URL: optional(httpUrl),
    DATABASE_URL: optional(postgresUrl),
    /** HMAC key for session JWTs. */
    SESSION_SECRET: optional(z.string().min(32, "must be at least 32 characters")),
    /** Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`. */
    CRON_SECRET: optional(z.string().min(16, "must be at least 16 characters")),
    KEEPER_ACCOUNT_ID: optional(accountIdSchema),
    /** A function-call access key limited to `run_cut` on the main contract. Full-access keys are refused. */
    KEEPER_PRIVATE_KEY: optional(secretKey),
    /** The keeper never signs on mainnet unless a human sets this. */
    KEEPER_ALLOW_MAINNET: flag,
    FAUCET_ACCOUNT_ID: optional(accountIdSchema),
    FAUCET_PRIVATE_KEY: optional(secretKey),
    NEAR_AI_API_KEY: optional(z.string()),
    NEAR_AI_MODEL: optional(z.string()),
  })
  .superRefine((env, ctx) => {
    const require = (key: keyof typeof env, why: string) => {
      if (env[key] === undefined) ctx.addIssue({ code: "custom", path: [key], message: `is required ${why}` });
    };
    if (env.DATA_SOURCE === "live") {
      require("DATABASE_URL", "when DATA_SOURCE=live");
      require("SESSION_SECRET", "when DATA_SOURCE=live");
    }
    const pair = (a: keyof typeof env, b: keyof typeof env) => {
      if ((env[a] === undefined) !== (env[b] === undefined)) require(env[a] === undefined ? a : b, `together with ${env[a] === undefined ? b : a}`);
    };
    pair("KEEPER_ACCOUNT_ID", "KEEPER_PRIVATE_KEY");
    pair("FAUCET_ACCOUNT_ID", "FAUCET_PRIVATE_KEY");
  });

export type ServerEnv = z.output<typeof schema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new ConfigError(`Invalid server environment:\n${describeIssues(parsed.error)}`);
  return parsed.data;
}

/**
 * The validated server environment. Parsed on every call (cheap) so a bad value fails the first
 * request that needs it with a message naming the variable, and tests can change the environment.
 */
export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export function requireDatabaseUrl(): string {
  const url = serverEnv().DATABASE_URL;
  if (!url) throw new ConfigError("DATABASE_URL must be set to use the database.");
  return url;
}

/** The HS256 key for session tokens. */
export function requireSessionKey(): Uint8Array {
  const secret = serverEnv().SESSION_SECRET;
  if (!secret) throw new ConfigError("SESSION_SECRET must be set (32+ characters) to sign in.");
  return new TextEncoder().encode(secret);
}

export type KeeperCredentials = { accountId: string; privateKey: string; allowMainnet: boolean };

export function requireKeeperCredentials(): KeeperCredentials {
  const env = serverEnv();
  if (!env.KEEPER_ACCOUNT_ID || !env.KEEPER_PRIVATE_KEY) throw new ConfigError("KEEPER_ACCOUNT_ID and KEEPER_PRIVATE_KEY must be set to run the keeper.");
  return { accountId: env.KEEPER_ACCOUNT_ID, privateKey: env.KEEPER_PRIVATE_KEY, allowMainnet: env.KEEPER_ALLOW_MAINNET };
}
