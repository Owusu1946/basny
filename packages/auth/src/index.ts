import type { Database } from "@basny-web/db";
import * as schema from "@basny-web/db/schema/auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendAuthEmail(env, user.email, "Reset your BASNY password", url, "Reset password");
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      storage: "database",
      modelName: "rateLimit",
      customRules: {
        "/sign-up/email": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/forget-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendAuthEmail(env, user.email, "Verify your BASNY account", url, "Verify email");
      },
    },
    user: { additionalFields: { phone: { type: "string", required: false, input: false } } },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

async function sendAuthEmail(env: AuthConfig, to: string, subject: string, url: string, action: string) {
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Authentication email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.");
  const safeUrl = escapeAttribute(url);
  const text = `${action}: ${url}\n\nIf you did not request this, you can ignore this email.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#211d19"><p style="letter-spacing:.2em;font-size:12px;color:#755137">BASNY ENTERPRISE</p><h1 style="font-family:Georgia,serif;font-weight:400">${action}</h1><p><a href="${safeUrl}" style="display:inline-block;padding:14px 20px;background:#755137;color:white;text-decoration:none">${action}</a></p><p style="color:#6c655d;font-size:13px">If you did not request this, you can ignore this email.</p></div>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text, html }),
  });
  if (!response.ok) throw new Error(`Unable to send authentication email (${response.status}).`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
