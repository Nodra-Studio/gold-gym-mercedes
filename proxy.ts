import { authConfigured } from "@/lib/auth/config";
import { supportsSitesIdentity } from "@club/runtime";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Only the native Next.js build uses this boundary. Vinext keeps its existing
// authenticated Workers backend. Never forward public identity headers to it.
export async function proxy(request: NextRequest) {
  if (supportsSitesIdentity) return NextResponse.next();
  if (authConfigured()) {
    if (request.nextUrl.pathname === "/signin-with-chatgpt") return NextResponse.redirect(new URL("/acceso", request.url));
    let response = NextResponse.next({ request });
    const client = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          for (const { name, value } of values) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of values) response.cookies.set(name, value, options);
        },
      },
    });
    // Refresh before Server Components read cookies. Roles remain checked by principal().
    await client.auth.getClaims();
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "La gestión todavía no está habilitada en este alojamiento." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "3600" } },
    );
  }
  return NextResponse.rewrite(new URL("/sistema-no-disponible", request.url), {
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}
export const config = {
  matcher: ["/portal/:path*", "/cuenta/:path*", "/acceso/:path*", "/crear-cuenta/:path*", "/recuperar/:path*", "/actualizar-clave/:path*", "/auth/:path*", "/caja/:path*", "/api/:path*", "/gestion/:path*", "/ingreso/:path*", "/reservas/:path*", "/jugar/:path*", "/configuracion/:path*", "/equipo/:path*", "/datos/:path*", "/reportes/:path*", "/signin-with-chatgpt/:path*", "/signout-with-chatgpt/:path*", "/callback/:path*"],
};
