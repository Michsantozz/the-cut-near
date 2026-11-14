// Client-safe API of the Director: kinds, limits and the shapes the UI renders.
export { DIRECTOR_LINE_KINDS, LINE_LIMITS, type DirectorLineKind } from "./model/kinds";
export { proofUrlOf, type DirectorLineView, type DirectorProofBundle, type DirectorProofStatus } from "./model/view";
export { proofBadge } from "./model/screen";
export { DirectorScreen } from "./ui/director-screen";
export { ProofBadge } from "./ui/proof-badge";
export type { DirectorScreen as DirectorScreenData } from "./server/load-screen";
