import sharp from "sharp";
import { getCaptchaExpression, renderCaptchaSvg } from "@/modules/identity-access/captcha";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const expression = await getCaptchaExpression(id);
  if (!expression) {
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }

  try {
    const image = await sharp(Buffer.from(renderCaptchaSvg(expression)))
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();

    return new Response(new Uint8Array(image), {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Type": "image/png",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Image unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  }
}
