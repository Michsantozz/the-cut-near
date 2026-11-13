// Client-safe verification API: pure functions over stored bytes and evidence, no network, no secrets.
// The network side (fetching attestations, Intel and NVIDIA checks) is in `@/shared/ai/verify/server`.
export { sha256Hex } from "./bytes";
export { DELEGATES, LINKS, verifiedSigners, worst, type AttestationEvidence, type CheckScope, type CheckStatus, type ProofCheck, type ReportVerdict } from "./checks";
export { verifierUrl, verifyCompletionProof, type CompletionProof, type ProofStatus, type ProofSummary, type VerifyCompletionInput } from "./proof";
export { checkReportLocally } from "./report-checks";
export { attestationReportSchema, chatSignatureSchema, signingAlgoSchema, type AttestationReport, type ChatSignature, type NearReport, type SigningAlgo } from "./schemas";
export { expectedSignedText, recoverEip191Signer, verifySignatureBySigner, type SignatureKind, type SignerIdentity } from "./signature";
export { parseTdxQuote, replayRtmr3, type TdxQuoteFields } from "./tdx";
