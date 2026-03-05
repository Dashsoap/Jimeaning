import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest, notFound } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".srt"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return badRequest("Invalid request format. Expected multipart/form-data.");
  }

  const scriptId = formData.get("scriptId") as string | null;
  const file = formData.get("file") as File | null;
  const prompt = formData.get("prompt") as string | null;
  const modelKey = formData.get("modelKey") as string | null;

  if (!prompt?.trim()) {
    return badRequest("prompt is required");
  }

  if (!scriptId && !file) {
    return badRequest("Either scriptId or file is required");
  }

  if (scriptId && file) {
    return badRequest("Cannot provide both scriptId and file");
  }

  let resolvedScriptId: string;

  if (scriptId) {
    // Existing script — verify ownership
    const script = await prisma.script.findFirst({
      where: { id: scriptId, userId: auth.user.id },
    });
    if (!script) return notFound("Script");
    resolvedScriptId = scriptId;
  } else {
    // File upload — validate and create script
    const fileName = file!.name.toLowerCase();
    const ext = fileName.substring(fileName.lastIndexOf("."));

    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return badRequest(`Unsupported file type. Supported: ${ACCEPTED_EXTENSIONS.join(", ")}`);
    }

    if (file!.size > MAX_FILE_SIZE) {
      return badRequest("File too large (max 5MB)");
    }

    const text = await file!.text();
    if (!text.trim()) {
      return badRequest("File is empty");
    }

    // Create a script from the uploaded file
    const title = fileName.replace(/\.[^.]+$/, "") || "Uploaded Script";
    const newScript = await prisma.script.create({
      data: {
        userId: auth.user.id,
        title,
        content: text,
        sourceType: "manual",
      },
    });

    resolvedScriptId = newScript.id;
  }

  // Create task
  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.REWRITE_SCRIPT,
    totalSteps: 100,
    data: {
      scriptId: resolvedScriptId,
      rewritePrompt: prompt.trim(),
      ...(modelKey ? { modelKey } : {}),
    },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
