import { Suspense } from "react";

import AuthLoading from "@/components/auth-loading";
import AuthExperience from "@/components/auth-experience";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email";

export default function AuthScreen({ mode }: { mode: AuthMode }) {
  return <Suspense fallback={<AuthLoading />}><AuthExperience mode={mode} /></Suspense>;
}
