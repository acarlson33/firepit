import { NextResponse } from "next/server";

export async function GET() {
  // Diagnostic endpoint: never expose env config outside development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "missing",
    projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "missing",
  });
}
