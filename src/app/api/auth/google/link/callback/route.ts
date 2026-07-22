import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/request-security";
import { authenticateWithGoogleCallback } from "@/modules/identity-access/google-authentication";
import {
  isGoogleOidcEnabled,
  requireGoogleOidcSettings,
} from "@/modules/identity-access/google-oidc-config";
import {
  GOOGLE_LINK_CONFIRMATION_COOKIE,
  GOOGLE_LINK_STATE_COOKIE,
} from "@/modules/identity-access/google-oidc-state";

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
  const safeOrigin = new URL(settings.linkRedirectUri).origin;
  const requestUrl = new URL(request.url);
  const cookieStore = await cookies();
  const state = requestUrl.searchParams.get("state");
  const expectedState = cookieStore.get(GOOGLE_LINK_STATE_COOKIE)?.value;
  const failureUrl = new URL("/admin/akses?googleLink=error", safeOrigin);

  let destination = failureUrl;
  let confirmationToken: string | null = null;
  if (state && expectedState === state) {
    const result = await authenticateWithGoogleCallback(request, "LINK");
    if (result.ok && result.purpose === "LINK") {
      destination = new URL(result.returnPath, safeOrigin);
      destination.searchParams.set("googleLink", "confirm");
      confirmationToken = result.confirmationToken;
    }
  }

  const response = NextResponse.redirect(destination, {
    status: 303,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
  response.cookies.set(GOOGLE_LINK_STATE_COOKIE, "", {
    httpOnly: true,
    secure: await shouldUseSecureCookies(),
    sameSite: "lax",
    path: "/api/auth/google/link",
    maxAge: 0,
  });
  if (confirmationToken) {
    response.cookies.set(GOOGLE_LINK_CONFIRMATION_COOKIE, confirmationToken, {
      httpOnly: true,
      secure: await shouldUseSecureCookies(),
      sameSite: "lax",
      path: "/admin/akses",
      maxAge: 10 * 60,
      priority: "high",
    });
  }
  return response;
}
