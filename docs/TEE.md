# What a signed move proves

Every agent move counts only if NEAR AI Cloud's TEE signed the model's answer to the exact prompt the contract built. This page
says what that check proves, how to repeat it, and what is still trusted.

## The check, in the contract

`submit_move({ agent_id, response, signature, signer })` in [`moves.rs`](../contracts/thecut/src/moves.rs):

1. The contract rebuilds the request for this agent and this cut with `moves::request_body`, the same function behind
   `get_move_request`. The relayer never sends the request, so it cannot add a word to the prompt.
2. It hashes the rebuilt request and the relayed response with SHA-256 and forms
   `"<model_id>:<hex sha256(request)>:<hex sha256(response)>"`.
3. It requires `signer` to be one of `model_signers` (fixed at launch, 1 to 4 keys) and `env::ed25519_verify(signature, text,
   signer)` to pass.
4. Only then does it parse the answer, burn the think fee and apply the personality's limits ([RULES.md](../RULES.md#agents-until-next_cut_at---move_lead)).

A changed byte in the request or the response gives another hash, so the signature fails. The tests
`a_tampered_response_is_refused`, `a_signature_by_another_key_is_refused` and `a_wrong_signer_is_refused` in
[`contract_moves.rs`](../contracts/thecut/src/tests/contract_moves.rs) pin this.

## Where `model_signers` comes from

`model_signers` is the Ed25519 key that NEAR AI's attestation report gives for `z-ai/glm-5.3-flash`:

```bash
curl -s 'https://cloud-api.near.ai/v1/attestation/report?model=z-ai/glm-5.3-flash&signing_algo=ed25519&provider=near' \
  | jq -r '.model_attestations[].signing_address'
# 5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff  (the value in get_params().model_signers)
```

## Check a move yourself

- **In the browser.** The judge desk (`/judges`) fetches each move's `submit_move` transaction from the FastNEAR Transactions
  API, hashes the response, checks the signer against `model_signers` and verifies Ed25519 with `@noble/curves`
  ([`move-signature.ts`](../src/shared/near/move-signature.ts)).
- **From a terminal.** `node scripts/testnet/probe-ai.ts` (Node 22+, `NEAR_AI_API_KEY` in the environment) builds a move request
  with the contract's template, sends it to NEAR AI and checks the whole chain: the attestation report names the expected key,
  the answer parses as a move, the signature is `provider_tee` over these exact bytes and Ed25519 verifies. Without a key it
  checks only the attestation report.
- **By hand.** Each `submit_move` transaction carries the full response and the signature in its arguments, and `get_moves`
  stores `request_sha256`, `response_sha256` and `signer`. Recompute the hashes and verify the signature with any Ed25519 library.

## What stays trusted

- **NEAR AI Cloud and its attestation.** The contract trusts that the key in `model_signers` lives only inside the model's TEE.
  That rests on NEAR AI's attestation report, which the contract cannot read. The app's Director lines go further: with
  `NEAR_AI_HARDWARE_CHECKS=on` (the default) each attestation's Intel TDX quote is verified with dcap-qvl and its GPU evidence with
  NVIDIA NRAS ([`hardware.ts`](../src/shared/ai/verify/hardware.ts)). Moves are not re-attested per call; the key is fixed at launch.
- **The relayer's choice.** Anyone may relay and the first valid move counts. A relayer can ask the model several times and submit
  the answer it prefers. It cannot write an answer, change the prompt or forge the signature.
- **Key rotation.** If NEAR AI rotates the model's TEE key, every move is refused and all agents hold until a new contract is
  launched. The game keeps running on fans alone.
- **Availability.** If NEAR AI is down, agents do not move, which counts as hold. The cut never waits for the AI.
