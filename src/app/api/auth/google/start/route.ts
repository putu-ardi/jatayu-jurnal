import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/request-security";
import { isGoogleOidcEnabled } from "@/modules/identity-access/google-oidc-config";
import { createGoogleAuthorizationRequest } from "@/modules/identity-access/google-authentication";

const GOOGLE_STATE_COOKIE = "ejls_google_oidc_state";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
  };

  if (!isGoogleOidcEnabled()) {
    return NextResponse.json({ message: "Google Workspace belum diaktifkan." }, { status: 404, headers });
  }

  try {
    const { url, state } = await createGoogleAuthorizationRequest();
    const response = NextResponse.redirect(url, { headers });
    response.cookies.set(GOOGLE_STATE_COOKIE, state, {
      httpOnly: true,
      secure: await shouldUseSecureCookies(),
      sameSite: "lax",
      path: "/api/auth/google",
      maxAge: 10 * 60,
    });
    return response;
  } catch {
    return NextResponse.json(
      { message: "Login Google Workspace belum dapat digunakan." },
      { status: 503, headers },
    );
  }
}
