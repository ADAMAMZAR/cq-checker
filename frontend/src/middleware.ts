import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isInternalModulesEnabled = process.env.NEXT_PUBLIC_ENABLE_INTERNAL_MODULES !== "false";

  if (!isInternalModulesEnabled) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/assistant/:path*",
    "/audit/:path*",
    "/registry/:path*",
    "/editor/:path*",
  ],
};
