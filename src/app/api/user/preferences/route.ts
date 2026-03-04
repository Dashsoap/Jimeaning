import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Legacy preferences endpoint.
 * Returns basic user preferences (non-provider config).
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
    defaults: {
      aspectRatio: pref?.defaultAspectRatio ?? "16:9",
      style: pref?.defaultStyle ?? "realistic",
      locale: pref?.locale ?? "zh",
      ttsVoice: pref?.ttsVoice ?? "alloy",
    },
  });
}

export async function PUT(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, string> = {};

  if (body.defaults) {
    if (body.defaults.aspectRatio) data.defaultAspectRatio = body.defaults.aspectRatio;
    if (body.defaults.style) data.defaultStyle = body.defaults.style;
    if (body.defaults.locale) data.locale = body.defaults.locale;
    if (body.defaults.ttsVoice) data.ttsVoice = body.defaults.ttsVoice;
  }

  await prisma.userPreference.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });

  return NextResponse.json({ success: true });
}
