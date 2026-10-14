import { authConfigured } from "@/lib/auth/config";
import { supportsSitesIdentity } from "@club/runtime";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { contentSecurityPolicy } from "@/lib/security-headers.mjs";

function trustedRequestHeaders(request: NextRequest, nonce = "", policy = "") {
  const headers = new Headers(request.headers);
  headers.delete("x-nonce");
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  if (policy) headers.set("Content-Security-Policy", policy);
  if (nonce) headers.set("x-nonce", nonce);
  return headers;
}

// Only the native Next.js build uses this boundary. Vinext keeps its existing
// authenticated Workers backend. Never forward public identity headers to it.
export async function proxy(request: NextRequest) {
  if (
    ["/api/public-padel", "/api/padel-weather", "/api/public-prices"].includes(
      request.nextUrl.pathname,
    )
  )
    return NextResponse.next();
  if (supportsSitesIdentity) return NextResponse.next();
  if (authConfigured()) {
    const path = request.nextUrl.pathname;
    const nonce = path.startsWith("/api/")
      ? ""
      : btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const policy = nonce
      ? contentSecurityPolicy({ nonce, development: process.env.NODE_ENV !== "production" })
      : "";
    const renderHeaders = () => {
      // Rebuild after each cookies.set(): NextRequest updates its Cookie header.
      // An incoming CSP/nonce must never choose the trusted renderer's policy.
      return trustedRequestHeaders(request, nonce, policy);
    };
    const privateResponse = (response: NextResponse) => {
      if (policy) response.headers.set("Content-Security-Policy", policy);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Robots-Tag", "noindex, nofollow");
      response.headers.set("Referrer-Policy", "no-referrer");
      return response;
    };
    const continueRequest = () => privateResponse(NextResponse.next({ request: { headers: renderHeaders() } }));
    if (request.nextUrl.pathname === "/signin-with-chatgpt")
      return privateResponse(NextResponse.redirect(new URL("/acceso", request.url)));
    let response = continueRequest();
    const client = createServerClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        cookieOptions: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
        },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: (values) => {
            for (const { name, value } of values)
              request.cookies.set(name, value);
            const previousCookies = response.cookies.getAll();
            response = continueRequest();
            for (const cookie of previousCookies) response.cookies.set(cookie);
            for (const { name, value, options } of values)
              response.cookies.set(name, value, options);
          },
        },
      },
    );
    // Refresh before Server Components read cookies. Roles remain checked by principal().
    const claims = await client.auth.getClaims();
    const accountRoute = ['/acceso', '/crear-cuenta', '/recuperar', '/actualizar-clave', '/verificar', '/api/auth', '/api/mfa'].includes(path) || path.startsWith('/auth/');
    if (!accountRoute && !claims.error && claims.data?.claims.sub && claims.data.claims.aal !== 'aal2') {
      const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      let blocked: NextResponse | null = null;
      if (assurance.error || !assurance.data?.currentLevel) {
        blocked = path.startsWith('/api/')
          ? NextResponse.json({ error: 'No pudimos verificar la seguridad de la sesión. Volvé a intentar.' }, { status: 503 })
          : NextResponse.redirect(new URL('/verificar?next=' + encodeURIComponent(path + request.nextUrl.search), request.url));
      } else if (assurance.data.nextLevel === 'aal2' && assurance.data.currentLevel !== 'aal2') {
        blocked = path.startsWith('/api/')
          ? NextResponse.json({ error: 'Completá la verificación en dos pasos para abrir la gestión.', code: 'MFA_REQUIRED', next: '/verificar' }, { status: 403 })
          : NextResponse.redirect(new URL('/verificar?next=' + encodeURIComponent(path + request.nextUrl.search), request.url));
      }
      if (blocked) {
        for (const cookie of response.cookies.getAll()) blocked.cookies.set(cookie);
        return privateResponse(blocked);
      }
    }
    return response;
  }
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "La gestión todavía no está habilitada en este alojamiento." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "3600" },
      },
    );
  }
  const fallbackPolicy = contentSecurityPolicy({ development: process.env.NODE_ENV !== "production" });
  return NextResponse.rewrite(new URL("/sistema-no-disponible", request.url), {
    request: { headers: trustedRequestHeaders(request, "", fallbackPolicy) },
    headers: {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Content-Security-Policy": fallbackPolicy,
      "Referrer-Policy": "no-referrer",
    },
  });
}
export const config = {
  matcher: [
    "/tarifas/:path*",
    "/portal/:path*",
    "/cuenta/:path*",
    "/acceso/:path*",
    "/crear-cuenta/:path*",
    "/recuperar/:path*",
    "/actualizar-clave/:path*",
    "/verificar/:path*",
    "/auth/:path*",
    "/caja/:path*",
    "/api/:path*",
    "/gestion/:path*",
    "/ingreso/:path*",
    "/reservas/:path*",
    "/jugar/:path*",
    "/configuracion/:path*",
    "/equipo/:path*",
    "/datos/:path*",
    "/datos-fiscales/:path*",
    "/reportes/:path*",
    "/signin-with-chatgpt/:path*",
    "/signout-with-chatgpt/:path*",
    "/callback/:path*",
  ],
};
