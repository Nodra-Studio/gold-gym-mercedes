export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Bounded requests: failed services must not leave the interface loading forever. */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit & { responseType?: "json" | "csv" } = {},
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("Timeout", "TimeoutError")),
    20000,
  );
  try {
    const { responseType = "json", ...requestInit } = init;
    const response = await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });
    const body = await response.arrayBuffer();
    const json = response.headers
      .get("content-type")
      ?.includes("application/json");
    if (!response.ok) {
      if (response.status === 401 && !String(input).startsWith("/api/auth"))
        throw new ApiError(
          "Tu sesión terminó. Iniciá sesión para continuar.",
          401,
        );
      if (response.status === 403)
        throw new Error(
          "Tu cuenta no tiene permiso para esta acción. Consultá en recepción.",
        );
      if (response.status >= 500)
        throw new Error(
          "No pudimos conectar con el sistema del club. Volvé a intentar en unos instantes.",
        );
      if (!json)
        throw new Error("El servicio no está disponible. Volvé a intentar.");
    }
    const csv = response.headers.get("content-type")?.includes("text/csv");
    if (!json && !(response.ok && responseType === "csv" && csv))
      throw new Error(
        "El servidor no devolvió los datos esperados. Volvé a intentar.",
      );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      const read = !init.method || init.method.toUpperCase() === "GET";
      throw new Error(
        read
          ? "La conexión tardó demasiado. Podés volver a cargar los datos."
          : "La conexión tardó demasiado. Revisá si la operación quedó registrada antes de repetirla.",
      );
    }
    if (error instanceof TypeError)
      throw new Error(
        !init.method || init.method.toUpperCase() === "GET"
          ? "No hay conexión con el servidor. Revisá tu conexión e intentá de nuevo."
          : "Se interrumpió la conexión. Revisá si la operación quedó registrada antes de repetirla.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
