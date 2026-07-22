import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/request-security";
import {
  isGoogleOidcEnabled,
  requireGoogleOidcSettings,
} from "@/modules/identity-access/google-oidc-config";
import { authenticateWithGoogleCallback } from "@/modules/identity-access/google-authentication";

const GOOGLE_STATE_COOKIE = "ejls_google_oidc_state";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  if (!isGoogleOidcEnabled()) {
    return NextResponse.json({ message: "Google Workspace belum diaktifkan." }, { status: 404, headers });
  }

  const settings = requireGoogleOidcSettings();
  const safeOrigin = new URL(settings.redirectUri).origin;
  const incomingState = new URL(request.url).searchParams.get("state");
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;

  let destination = "/login?error=google";
  if (settings && incomingState && cookieState === incomingState) {
    const result = await authenticateWithGoogleCallback(request, "LOGIN");
    destination = result.ok ? result.returnPath : destination;
  }

  const response = NextResponse.redirect(new URL(destination, safeOrigin), {
    status: 303,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
  response.cookies.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: await shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 0,
  });
  return response;
}
