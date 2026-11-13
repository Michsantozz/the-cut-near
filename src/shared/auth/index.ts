// Client-safe sign-in API. Server-only session helpers are in ./server.
export { fetchSession, signInWithNear, SignInError, signOut, type SignedMessage, type SignMessage, type SignMessageParams } from "./client";
export { AUTH_ROUTES, SIGN_IN_MESSAGE, SIGN_IN_RECIPIENT, type SignInFailure } from "./constants";
