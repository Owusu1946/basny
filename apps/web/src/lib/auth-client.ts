import { getApiBaseUrl } from "@/lib/api-url";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
});
