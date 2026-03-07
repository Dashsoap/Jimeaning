import { NextRequest, NextResponse } from "next/server";
import { apiHandler, ApiError } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// GET: List global locations
export const GET = apiHandler(async (_req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const locations = await prisma.location.findMany({
    where: { userId: auth.user.id, projectId: null },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(locations);
});

// POST: Create a global location
export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const body = await req.json();
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    throw new ApiError("INVALID_PARAMS", "name is required", 400);
  }

  const location = await prisma.location.create({
    data: {
      userId: auth.user.id,
      projectId: null,
      name,
      description: typeof body.description === "string" ? body.description : undefined,
    },
  });

  return NextResponse.json(location, { status: 201 });
});
