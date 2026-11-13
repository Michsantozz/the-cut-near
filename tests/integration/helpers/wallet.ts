import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { signMessage } from "near-api-js/nep413";
import { base64ToBytes } from "@/shared/lib/base64";

/**
 * A test wallet: a fresh ed25519 key that signs NEP-413 messages with near-api-js, returning what
 * a NEAR Connect wallet returns from `signMessage` (signature in base64).
 */
export function testWallet(accountId: string) {
  const keyPair = KeyPair.fromRandom("ed25519");
  // Signing is local; this provider is never called.
  const account = new Account(accountId, new JsonRpcProvider({ url: "http://127.0.0.1:1" }), new KeyPairSigner(keyPair));
  return {
    accountId,
    publicKey: keyPair.getPublicKey().toString(),
    async signMessage({ message, recipient, nonce }: { message: string; recipient: string; nonce: string }) {
      const bytes = base64ToBytes(nonce);
      if (!bytes) throw new Error("bad nonce");
      const signed = await signMessage({ signerAccount: account, payload: { message, recipient, nonce: bytes } });
      return { accountId, publicKey: signed.publicKey.toString(), signature: Buffer.from(signed.signature).toString("base64") };
    },
  };
}
