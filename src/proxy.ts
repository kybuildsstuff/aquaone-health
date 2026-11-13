import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Refreshes the Supabase session cookie on every request and sends signed-out
// visitors on app routes to /sign-in. Membership itself is checked in the
// (app) layout, which can query the database; this is only the optimistic check.
// API routes check sign-in themselves and answer 401, so the proxy lets them through.
// "/r" is the public, read-only vet report behind a share link (one cat per unguessable token).
const PUBLIC = ["/", "/sign-in", "/check-email", "/membership-ended", "/auth", "/api", "/r"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || (p !== "/" && path.startsWith(`${p}/`)));
  if (!data.user && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/sign-in";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch-icon|manifest.webmanifest|.*\\.(?:png|svg|jpg|webp)$).*)"],
};
