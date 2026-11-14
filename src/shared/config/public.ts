import { z } from "zod";
import { accountIdSchema } from "@/shared/lib/account-id";
import { ConfigError } from "./errors";
import { describeIssues, emptyToUndefined } from "./format";

// Client-safe configuration: only NEXT_PUBLIC_* variables, which Next.js inlines into the browser bundle.

export type NearNetwork = "testnet" | "mainnet";

const DEFAULT_CONTRACT: Record<NearNetwork, string> = { testnet: "thecut-daily.testnet", mainnet: "thecut.near" };

const schema = z
  .object({
    NEXT_PUBLIC_NEAR_NETWORK: z.preprocess(emptyToUndefined, z.enum(["testnet", "mainnet"]).default("testnet")),
    NEXT_PUBLIC_CUT_CONTRACT: z.preprocess(emptyToUndefined, accountIdSchema.optional()),
  })
  .transform(({ NEXT_PUBLIC_NEAR_NETWORK: network, NEXT_PUBLIC_CUT_CONTRACT: contract }) => ({
    network,
    contractId: contract ?? DEFAULT_CONTRACT[network],
  }))
  .superRefine(({ network, contractId }, ctx) => {
    // Named accounts carry their network's top-level account; a mismatch is a copy-paste error.
    const wrongTla = network === "testnet" ? contractId.endsWith(".near") : contractId.endsWith(".testnet");
    if (wrongTla) ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_CUT_CONTRACT"], message: `is not a ${network} account` });
  });

export type PublicEnv = z.output<typeof schema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new ConfigError(`Invalid public environment:\n${describeIssues(parsed.error)}`);
  return parsed.data;
}

// Each variable is read by its literal name so Next.js can inline it in client bundles.
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_NEAR_NETWORK: process.env.NEXT_PUBLIC_NEAR_NETWORK,
  NEXT_PUBLIC_CUT_CONTRACT: process.env.NEXT_PUBLIC_CUT_CONTRACT,
});
