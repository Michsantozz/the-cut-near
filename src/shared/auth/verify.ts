import "server-only";
import { verifyMessage } from "near-api-js/nep413";
import { AccessKeyDoesNotExistError, AccountDoesNotExistError } from "near-api-js/rpc-errors";
import { RpcUnavailableError } from "@/shared/near/errors";
import type { NearRpc } from "@/shared/near/rpc";
import { SIGN_IN_MESSAGE, SIGN_IN_RECIPIENT, type SignInFailure } from "./constants";
import { isValidNep413Signature, type Nep413Payload } from "./nep413";

export type SignInProof = {
  accountId: string;
  publicKey: string;
  signature: Uint8Array;
  /** The challenge nonce, base64url as issued, and its 32 bytes. */
  nonce: { text: string; bytes: Uint8Array };
};

export type SignInResult = { ok: true; accountId: string; publicKey: string } | { ok: false; reason: Exclude<SignInFailure, "malformed" | "forbidden_origin"> };

export type SignInDeps = {
  rpc: NearRpc;
  /** Atomically burns the nonce; true when it existed and had not expired. */
  consumeNonce: (nonce: string) => Promise<boolean>;
  recipient?: string;
};

const fail = (reason: Exclude<SignInFailure, "malformed" | "forbidden_origin">): SignInResult => ({ ok: false, reason });

/**
 * Verifies a NEP-413 sign-in. Order matters:
 * 1. burn the nonce first, so a proof is single-use whatever happens next (replay-safe);
 * 2. check the signature offline, so forgeries never reach the RPC (rate-limit friendly);
 * 3. require a full-access key of the account (view_access_key), as NEP-413 asks of a login;
 * 4. run near-api-js `verifyMessage`, the reference check of key and signature together.
 */
export async function verifySignIn(proof: SignInProof, { rpc, consumeNonce, recipient = SIGN_IN_RECIPIENT }: SignInDeps): Promise<SignInResult> {
  if (!(await consumeNonce(proof.nonce.text))) return fail("nonce_invalid");

  const payload: Nep413Payload = { message: SIGN_IN_MESSAGE, recipient, nonce: proof.nonce.bytes };
  if (!isValidNep413Signature(payload, proof.publicKey, proof.signature)) return fail("bad_signature");

  try {
    const permission = await rpc.accessKey(proof.accountId, proof.publicKey);
    if (!permission) return fail("key_not_found");
    if (permission.kind !== "full" || permission.gasKey) return fail("not_full_access");

    await rpc.run((provider) =>
      verifyMessage({ signerAccountId: proof.accountId, signerPublicKey: proof.publicKey, signature: proof.signature, payload, provider }),
    );
  } catch (error) {
    if (error instanceof RpcUnavailableError) return fail("unavailable");
    if (error instanceof AccessKeyDoesNotExistError || error instanceof AccountDoesNotExistError) return fail("key_not_found");
    // verifyMessage throws a plain Error for a key that lost full access or a bad signature.
    return fail("bad_signature");
  }
  return { ok: true, accountId: proof.accountId, publicKey: proof.publicKey };
}
