import { NextResponse } from "next/server";
import { createCaptchaChallenge } from "@/modules/identity-access/captcha";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const challenge = await createCaptchaChallenge();
    return NextResponse.json(challenge, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Perlindungan verifikasi sedang tidak tersedia." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
