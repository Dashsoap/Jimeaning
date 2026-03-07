import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ locationId: string }> };

export const GET = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { locationId } = await params;

  const location = await prisma.location.findFirst({
    where: { id: locationId, userId: auth.user.id, projectId: null },
  });
  if (!location) throw new ApiError("NOT_FOUND", "Location not found", 404);

  return NextResponse.json(location);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { locationId } = await params;

  const existing = await prisma.location.findFirst({
    where: { id: locationId, userId: auth.user.id, projectId: null },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Location not found", 404);

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.imageUrl === "string") data.imageUrl = body.imageUrl;

  const location = await prisma.location.update({
    where: { id: locationId },
    data,
  });

  return NextResponse.json(location);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: RouteParams) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;
  const { locationId } = await params;

  const existing = await prisma.location.findFirst({
    where: { id: locationId, userId: auth.user.id, projectId: null },
  });
  if (!existing) throw new ApiError("NOT_FOUND", "Location not found", 404);

  await prisma.location.delete({ where: { id: locationId } });
  return NextResponse.json({ success: true });
});
