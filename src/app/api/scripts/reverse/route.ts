import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse, badRequest } from "@/lib/api-auth";
import { createTask } from "@/lib/task/service";
import { TaskType } from "@/lib/task/types";

const ALLOWED_EXTENSIONS = new Set([
  ".mp4", ".mov", ".avi", ".webm", ".mkv",
  ".mp3", ".wav", ".m4a", ".ogg", ".flac",
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
]);

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

function getMediaType(ext: string): "video" | "audio" | "image" {
  if ([".mp4", ".mov", ".avi", ".webm", ".mkv"].includes(ext)) return "video";
  if ([".mp3", ".wav", ".m4a", ".ogg", ".flac"].includes(ext)) return "audio";
  return "image";
}

export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const customPrompt = formData.get("customPrompt") as string | null;

  if (!file) {
    return badRequest("No file uploaded");
  }

  // Validate extension
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return badRequest(`Unsupported file type: ${ext}`);
  }

  // Validate size
  if (file.size > MAX_FILE_SIZE) {
    return badRequest("File too large (max 500MB)");
  }

  // Save file to data/scripts/
  const uploadDir = path.join(process.cwd(), "data", "scripts");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const filename = `${Date.now()}-${file.name}`;
  const filePath = path.join(uploadDir, filename);
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(filePath, buffer);

  const mediaType = getMediaType(ext);

  // Create task
  const taskId = await createTask({
    userId: auth.user.id,
    type: TaskType.REVERSE_SCRIPT,
    totalSteps: 100,
    data: {
      mediaPath: filePath,
      mediaType,
      customPrompt: customPrompt || undefined,
    },
  });

  return NextResponse.json({ taskId }, { status: 201 });
});
