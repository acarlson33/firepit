import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    endpoint: process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "missing",
    projectId: process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || "missing",
    hasServerEndpoint: !!process.env.APPWRITE_ENDPOINT,
    hasServerProjectId: !!process.env.APPWRITE_PROJECT_ID,
  });
}
