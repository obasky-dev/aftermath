export const PUBLIC_DEMO_EMAIL = "demo@aftermath.app";

/**
 * The public deployment runs as a read/write demo identity so reviewers can
 * open the app without creating an account. It is deliberately gated by an env
 * flag instead of AUTH_DISABLED, which the framework refuses in production.
 * Destructive and credential-revealing actions are closed while it is on.
 */
export function isPublicDemo(): boolean {
  // guard:allow-env-credential — deploy flag, not a user credential
  return process.env.AFTERMATH_PUBLIC_DEMO === "1";
}

/** `authorize` gate for actions a public demo must never expose. */
export function denyInPublicDemo(): boolean {
  return !isPublicDemo();
}
