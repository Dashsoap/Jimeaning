import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "@/lib/auth";

type RouteParams = { params: Promise<{ panelId: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { panelId } = await params;

  const panel = await prisma.panel.findUnique({
    where: { id: panelId },
    select: { imageUrl: true },
  });

  if (!panel?.imageUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // If it's a base64 data URL, decode and serve as binary
  const match = panel.imageUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (match) {
    const contentType = match[1];
    const buffer = Buffer.from(match[2], "base64");
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // If it's a regular URL, redirect
  return NextResponse.redirect(panel.imageUrl);
}
