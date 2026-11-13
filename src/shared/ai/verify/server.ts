import "server-only";

// Server-only verification API: network calls to NEAR AI Cloud, Intel collateral and NVIDIA NRAS.
export { collectAttestation, freshNonce, type CollectAttestationOptions } from "./attestation";
export { ACCEPTED_TCB_STATUSES, createHardwareVerifier, NRAS_JWKS_URL, NRAS_URL, type HardwareVerdict, type HardwareVerifier, type HardwareVerifierOptions } from "./hardware";
