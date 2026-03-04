import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

/**
 * Legacy preferences endpoint.
 * Returns basic user preferences (non-provider config).
 */
export const GET = apiHandler(async () => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const pref = await prisma.userPreference.findUnique({
    where: { userId: auth.user.id },
  });

  return NextResponse.json({
    defaults: {
      aspectRatio: pref?.defaultAspectRatio ?? "16:9",
      style: pref?.defaultStyle ?? "realistic",
      locale: pref?.locale ?? "zh",
      ttsVoice: pref?.ttsVoice ?? "alloy",
    },
  });
});

export const PUT = apiHandler(async (req: Request) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const data: Record<string, string> = {};

  if (body.defaults) {
    if (body.defaults.aspectRatio) data.defaultAspectRatio = body.defaults.aspectRatio;
    if (body.defaults.style) data.defaultStyle = body.defaults.style;
    if (body.defaults.locale) data.locale = body.defaults.locale;
    if (body.defaults.ttsVoice) data.ttsVoice = body.defaults.ttsVoice;
  }

  await prisma.userPreference.upsert({
    where: { userId: auth.user.id },
    update: data,
    create: { userId: auth.user.id, ...data },
  });

  return NextResponse.json({ success: true });
});
