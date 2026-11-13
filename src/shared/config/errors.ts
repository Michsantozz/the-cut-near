/** A missing or malformed environment variable. Messages name the variables, never their values. */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}
