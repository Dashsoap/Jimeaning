import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-errors";
import { requireAuth, isErrorResponse } from "@/lib/api-auth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const WordExtractor = require("word-extractor");

/**
 * POST /api/scripts/parse-doc
 * Parse a .doc (old Word binary format) file and return extracted text.
 * mammoth only supports .docx — this endpoint handles legacy .doc files.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const auth = await requireAuth();
  if (isErrorResponse(auth)) return auth;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const extractor = new WordExtractor();
  const doc = await extractor.extract(buffer);
  const text = doc.getBody();

  if (!text.trim()) {
    return NextResponse.json({ error: "File content is empty" }, { status: 400 });
  }

  return NextResponse.json({ text });
});
