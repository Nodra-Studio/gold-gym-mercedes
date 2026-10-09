"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { branches, branchName, expenseCategories } from "@/lib/branches";
import CashReconciliation from "@/components/cash-reconciliation";
import { localDay, money, requestId } from "@/lib/club";
import { WorkspaceHeader, Field } from "@/components/club-client";
import "./cash.css";
type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  active: number;
  revision: number;
};
type Entry = {
  id: string;
  venue: string | null;
  kind: string;
  category: string;
  concept: string;
  amount: number;
  method: string;
  day: string;
  created_at: string;
  actor: string | null;
  reversed: boolean;
  reverses: string | null;
};
type ProductChange = {
  id: string;
  product_id: string;
  before_state: string;
  after_state: string;
  created_at: string;
  actor: string;
  name: string;
};
type Breakdown = {
  venue: string | null;
  method: string | null;
  count: number;
  incoming: number;
  outgoing: number;
  balance: number;
};
type Data = {
  byVenue: Breakdown[];
  byMethod: Breakdown[];
  productChanges: ProductChange[];
  role: string;
  products: Product[];
  stock: { product_id: string; venue: string; quantity: number }[];
  entries: Entry[];
  summary: {
    count: number;
    incoming: number;
    outgoing: number;
    balance: number;
  };
  stockMoves: {
    id: string;
    venue: string;
    kind: string;
    transfer_id: string | null;
    quantity: number;
    note: string;
    created_at: string;
    actor: string;
    name: string;
  }[];
};
type Action =
  | "sale"
  | "expense"
  | "receive"
  | "product"
  | "reverse"
  | "transfer"
  | "adjust"
  | "editProduct";
const movementNames: Record<string, string> = {
  receive: "Ingreso",
  sale: "Venta",
  reversal: "Devolución",
  transfer_out: "Traslado · salida",
  transfer_in: "Traslado · entrada",
  adjustment: "Ajuste",
};
const methods = ["Efectivo", "Transferencia", "Tarjeta"];
export function CashClient() {
  const [from, setFrom] = useState(() => localDay().slice(0, 7) + "-01"),
    [to, setTo] = useState(localDay),
    [venue, setVenue] = useState(""),
    [category, setCategory] = useState(""),
    [offset, setOffset] = useState(0);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [exporting, setExporting] = useState(false);
  const [action, setAction] = useState<Action | null>(null),
    [target, setTarget] = useState<Entry | null>(null),
    [key, setKey] = useState(""),
    [editing, setEditing] = useState<Product | null>(null);
  const formPanel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (action) {
      formPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formPanel.current?.focus({ preventScroll: true });
    }
  }, [action, key]);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0),
    saving = useRef(false);
  const load = useCallback(async () => {
    const ticket = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const r = await apiFetch(
          "/api/cash?" +
            new URLSearchParams({
              from,
              to,
              venue,
              category,
              offset: String(offset),
            }),
          { cache: "no-store", signal: controller.signal },
        ),
        j = (await r.json()) as Data & { error?: string };
      if (!r.ok) throw Error(j.error);
      if (ticket === sequence.current) {
        setData(j);
        setError("");
      }
    } catch (e) {
      if (ticket === sequence.current && !controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : "No se pudieron cargar los datos.",
        );
    } finally {
      if (ticket === sequence.current) {
        setLoading(false);
        pending.current = null;
      }
    }
  }, [from, to, venue, category, offset]);
  useEffect(() => {
    setLoading(true);
    setData(null);
    void load();
    const sync = () => {
      if (
        document.visibilityState === "visible" &&
        !saving.current &&
        !pending.current
      )
        void load();
    };
    const timer = setInterval(sync, 30000);
    window.addEventListener("focus", sync);
    return () => {
      sequence.current++;
      pending.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [load]);
  function open(
    a: Action,
    e: Entry | null = null,
    product: Product | null = null,
  ) {
    setEditing(product);
    setAction(a);
    setTarget(e);
    setKey(requestId());
    setNotice("");
    setError("");
  }
  async function submit(payload: Record<string, unknown>) {
    if (saving.current) return;
    saving.current = true;
    sequence.current++;
    pending.current?.abort();
    pending.current = null;
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/api/cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, requestKey: key }),
        }),
        j = (await r.json()) as { error?: string; replayed?: boolean };
      if (!r.ok) throw Error(j.error);
      setAction(null);
      setNotice(
        j.replayed
          ? "El movimiento ya estaba guardado; no se duplicó."
          : "Movimiento guardado.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo guardar. Podés reintentar sin duplicar el movimiento.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  async function download() {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const r = await apiFetch(
        "/api/cash?" +
          new URLSearchParams({ from, to, venue, category, format: "csv" }),
        { cache: "no-store", responseType: "csv" },
      );
      if (!r.ok) {
        const j = (await r.json()) as { error?: string };
        throw Error(j.error);
      }
      const csv = await r.text(),
        url = URL.createObjectURL(
          new Blob(["\ufeff" + csv.replace(/^\ufeff/, "")], {
            type: "text/csv;charset=utf-8;",
          }),
        );
      const a = document.createElement("a");
      a.href = url;
      a.download = `caja-${from}-${to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo exportar el período.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <main className="workspace cash-workspace">
      <WorkspaceHeader
        active="caja"
        title="Caja y stock"
        subtitle="Cobros, gastos y productos de las cuatro sedes."
      />
      <div className="cash-actions">
        <button
          className="button gold"
          onClick={() => open("sale")}
          disabled={!data}
        >
          Registrar venta
        </button>
        <button
          className="button outline"
          onClick={() => open("expense")}
          disabled={!data}
        >
          Cargar gasto
        </button>
        <button
          className="button outline"
          onClick={() => open("receive")}
          disabled={!data}
        >
          Ingresar stock
        </button>
        {data?.role === "owner" && (
          <button className="button outline" onClick={() => open("product")}>
            Nuevo producto
          </button>
        )}
        <button
          className="button outline"
          disabled={!data}
          onClick={() => open("transfer")}
        >
          Trasladar stock
        </button>
        {data?.role === "owner" && (
          <button className="button outline" onClick={() => open("adjust")}>
            Ajustar stock
          </button>
        )}
      </div>
      {error && (
        <p className="cash-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {action && data && (
        <section
          className="cash-panel"
          aria-label="Registrar movimiento"
          ref={formPanel}
          tabIndex={-1}
        >
          <div className="cash-heading">
            <h2>
              {
                {
                  sale: "Venta de productos",
                  expense: "Nuevo gasto",
                  receive: "Ingreso de mercadería",
                  product: "Nuevo producto",
                  reverse: "Anular movimiento",
                  transfer: "Trasladar entre sedes",
                  adjust: "Ajustar existencias",
                  editProduct: "Editar producto",
                }[action]
              }
            </h2>
            <button
              className="button outline"
              onClick={() => setAction(null)}
              disabled={busy}
            >
              Cerrar
            </button>
          </div>
          <CashForm
            key={key}
            action={action}
            data={data}
            defaultVenue={venue === "unknown" ? "" : venue}
            target={target}
            editing={editing}
            busy={busy}
            submit={submit}
          />
        </section>
      )}
      <section className="cash-panel">
        <div className="cash-filters">
          <Field label="Desde">
            <input
              type="date"
              disabled={busy}
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              disabled={busy}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
            />
          </Field>
          <Field label="Sede">
            <select
              disabled={busy}
              value={venue}
              onChange={(e) => {
                setVenue(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas las sedes</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
              <option value="unknown">Sin sede registrada</option>
            </select>
          </Field>
          <Field label="Categoría">
            <select
              disabled={busy}
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas las categorías</option>
              {["Cuotas", "Pádel", "Productos", ...expenseCategories].map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
          </Field>
        </div>
        {loading && <p role="status">Cargando caja…</p>}
        {data && (
          <>
            <div className="cash-summary">
              {[
                ["Entradas", data.summary.incoming],
                ["Salidas", data.summary.outgoing],
                ["Neto del período", data.summary.balance],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{money(Number(value))}</strong>
                </div>
              ))}
            </div>
            <p className="muted cash-help">
              Importes en pesos argentinos. Incluye cuotas, pádel, ventas,
              gastos y anulaciones. El neto refleja los movimientos registrados;
              no es un arqueo de efectivo. Las anulaciones se registran en la
              fecha actual.
            </p>
            <CashReconciliation
              key={`${from}:${to}:${venue}:${category}`}
              enabled={
                from === to && branches.some((b) => b.id === venue) && !category
              }
              rows={data.byMethod}
              day={from}
              venue={branchName(venue)}
            />
            <div className="cash-breakdowns">
              <CashBreakdown
                title="Por sede"
                rows={data.byVenue.map((r) => ({
                  ...r,
                  label: branchName(r.venue),
                }))}
              />
              <CashBreakdown
                title="Por medio de pago"
                rows={data.byMethod.map((r) => ({
                  ...r,
                  label: r.method ?? "No informado",
                }))}
              />
            </div>
            <div className="cash-heading">
              <h2>
                Movimientos <small>({data.summary.count})</small>
              </h2>
              <button
                className="button outline"
                onClick={download}
                disabled={exporting || !data.entries.length}
              >
                {exporting ? "Exportando…" : "Exportar período CSV"}
              </button>
            </div>
            <div className="cash-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / sede</th>
                    <th>Concepto</th>
                    <th>Medio</th>
                    <th>Importe</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.day}
                        <small>{branchName(e.venue)}</small>
                      </td>
                      <td>
                        {e.concept}
                        <small>{e.category}</small>
                        {e.actor && (
                          <small title={e.actor}>Operador: {e.actor}</small>
                        )}
                      </td>
                      <td>{e.method}</td>
                      <td
                        className={
                          e.amount < 0 ? "cash-negative" : "cash-positive"
                        }
                      >
                        {money(e.amount)}
                      </td>
                      <td>
                        {e.reversed ? (
                          "Anulado"
                        ) : e.kind === "reversal" ? (
                          "Anulación"
                        ) : data.role === "owner" &&
                          ["sale", "expense"].includes(e.kind) ? (
                          <button
                            className="text-link"
                            onClick={() => open("reverse", e)}
                          >
                            Anular
                          </button>
                        ) : (
                          "Registrado"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.entries.length && (
              <p className="cash-empty">
                No hay movimientos en este período y sede.
              </p>
            )}
            <div className="cash-actions">
              <button
                className="button outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 100))}
              >
                Anterior
              </button>
              <span>Página {offset / 100 + 1}</span>
              <button
                className="button outline"
                disabled={offset + 100 >= data.summary.count}
                onClick={() => setOffset(offset + 100)}
              >
                Siguiente
              </button>
            </div>
          </>
        )}
      </section>
      {data && (
        <section className="cash-panel">
          <h2>Stock actual por sede</h2>
          <p className="muted cash-help">
            El stock es actual y no depende del período de caja. Registrar
            mercadería no registra su costo: cargá la compra como gasto de
            Mercadería.
          </p>
          <div className="cash-table">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Precio</th>
                  {branches.map((b) => (
                    <th key={b.id}>{b.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      <small>{p.category}</small>
                    </td>
                    <td>
                      {money(p.price)}
                      <small>{p.active === 1 ? "Activo" : "Inactivo"}</small>
                      {data.role === "owner" && (
                        <button
                          className="text-link"
                          onClick={() => open("editProduct", null, p)}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                    {branches.map((b) => (
                      <td key={b.id}>
                        {data.stock.find(
                          (s) => s.product_id === p.id && s.venue === b.id,
                        )?.quantity ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!data.products.length && (
            <p className="cash-empty">
              El dueño puede crear el primer producto. Después, recepción carga
              las existencias de cada sede.
            </p>
          )}
          <details>
            <summary>Últimos 50 movimientos de stock</summary>
            <div className="cash-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Producto / sede</th>
                    <th>Unidades</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stockMoves.map((m) => (
                    <tr key={m.id}>
                      <td>
                        {new Date(m.created_at).toLocaleString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                      </td>
                      <td>
                        {m.name}
                        <small>{branchName(m.venue)}</small>
                      </td>
                      <td>
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity}
                      </td>
                      <td>
                        <strong>{movementNames[m.kind] ?? m.kind}</strong>
                        <small>{m.note}</small>
                        {m.transfer_id && (
                          <small>Traslado: {m.transfer_id}</small>
                        )}
                        <small>{m.actor}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details>
            <summary>Últimos 50 cambios de productos y precios</summary>
            <div className="cash-table">
              <table>
                <thead>
                  <tr>
                    <th>Fecha / producto</th>
                    <th>Antes</th>
                    <th>Después</th>
                    <th>Operador</th>
                  </tr>
                </thead>
                <tbody>
                  {data.productChanges.map((c) => (
                    <tr key={c.id}>
                      <td>
                        {new Date(c.created_at).toLocaleString("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                        })}
                        <small>{c.name}</small>
                      </td>
                      <td>{describeProduct(c.before_state)}</td>
                      <td>{describeProduct(c.after_state)}</td>
                      <td>{c.actor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.productChanges.length && (
                <p className="cash-empty">
                  No hay cambios de catálogo registrados.
                </p>
              )}
            </div>
          </details>
        </section>
      )}
    </main>
  );
}
function CashBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: (Breakdown & { label: string })[];
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="cash-table">
        <table>
          <thead>
            <tr>
              <th>Detalle</th>
              <th>Entradas</th>
              <th>Salidas</th>
              <th>Neto</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => a.label.localeCompare(b.label, "es"))
              .map((r) => (
                <tr key={r.label}>
                  <td>
                    {r.label}
                    <small>{r.count} movimientos</small>
                  </td>
                  <td>{money(r.incoming)}</td>
                  <td>{money(r.outgoing)}</td>
                  <td>{money(r.balance)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="cash-empty">Sin movimientos en el filtro actual.</p>
        )}
      </div>
    </section>
  );
}
function describeProduct(raw: string) {
  try {
    const p = JSON.parse(raw) as Product;
    return `${p.name} · ${p.category} · ${money(p.price)} · ${p.active === 1 ? "Activo" : "Inactivo"}`;
  } catch {
    return "Detalle no disponible";
  }
}
function CashForm({
  action,
  data,
  defaultVenue,
  target,
  editing,
  busy,
  submit,
}: {
  action: Action;
  data: Data;
  defaultVenue: string;
  target: Entry | null;
  editing: Product | null;
  busy: boolean;
  submit: (p: Record<string, unknown>) => Promise<void>;
}) {
  const [productId, setProduct] = useState(""),
    [selectedProduct, setSelectedProduct] = useState<Product | null>(null),
    [destination, setDestination] = useState(""),
    [units, setUnits] = useState(1),
    [branch, setBranch] = useState(defaultVenue);
  const product = selectedProduct,
    stock =
      data.stock.find((s) => s.product_id === productId && s.venue === branch)
        ?.quantity ?? 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          p: Record<string, unknown> = { action };
        for (const [k, v] of f.entries())
          p[k] = ["quantity", "price", "amount", "active"].includes(k)
            ? Number(v)
            : v;
        if (action === "sale") p.expectedPrice = product?.price;
        if (action === "reverse") p.id = target?.id;
        if (action === "editProduct") {
          p.productId = editing?.id;
          p.expectedRevision = editing?.revision;
        }
        void submit(p);
      }}
    >
      <fieldset disabled={busy}>
        <div className="cash-filters">
          {["sale", "receive", "expense", "transfer", "adjust"].includes(
            action,
          ) && (
            <Field
              label={
                action === "transfer"
                  ? "Sede de origen"
                  : "Sede de la operación"
              }
            >
              <select
                name="venue"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                required
              >
                <option value="">Elegí una sede</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {["sale", "receive", "transfer", "adjust"].includes(action) && (
            <>
              <Field label="Producto">
                <select
                  name="productId"
                  value={productId}
                  onChange={(e) => {
                    setProduct(e.target.value);
                    setSelectedProduct(
                      data.products.find((p) => p.id === e.target.value) ??
                        null,
                    );
                  }}
                  required
                >
                  <option value="">Elegí un producto</option>
                  {data.products
                    .filter(
                      (p) =>
                        ["transfer", "adjust"].includes(action) ||
                        p.active === 1,
                    )
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field
                label={
                  action === "adjust"
                    ? "Unidades a sumar (+) o restar (−)"
                    : "Unidades"
                }
              >
                <input
                  name="quantity"
                  type="number"
                  min={action === "adjust" ? "-10000" : "1"}
                  max="10000"
                  step="1"
                  value={units}
                  onChange={(e) => setUnits(Number(e.target.value))}
                  required
                />
              </Field>
            </>
          )}
          {action === "transfer" && (
            <Field label="Sede de destino">
              <select
                name="destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                required
              >
                <option value="">Elegí otra sede</option>
                {branches
                  .filter((b) => b.id !== branch)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {["product", "editProduct"].includes(action) && (
            <>
              <Field label="Nombre">
                <input
                  defaultValue={editing?.name}
                  name="name"
                  maxLength={120}
                  required
                  placeholder="Ej. Monster 473 ml"
                />
              </Field>
              <Field label="Categoría">
                <input
                  defaultValue={editing?.category}
                  name="category"
                  maxLength={60}
                  required
                  placeholder="Ej. Bebidas"
                />
              </Field>
              <Field label="Precio de venta (ARS)">
                <input
                  defaultValue={editing?.price}
                  name="price"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  required
                />
              </Field>
            </>
          )}
          {action === "editProduct" && (
            <Field label="Estado">
              <select name="active" defaultValue={editing?.active ?? 1}>
                <option value={1}>Activo</option>
                <option value={0}>Inactivo · no permite nuevas ventas</option>
              </select>
            </Field>
          )}
          {action === "expense" && (
            <>
              <Field label="Categoría">
                <select name="category" required>
                  {expenseCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Concepto / comprobante">
                <input
                  name="concept"
                  minLength={3}
                  maxLength={300}
                  placeholder="Ej. Limpieza · factura 0001-123"
                  required
                />
              </Field>
              <Field label="Importe (ARS)">
                <input
                  name="amount"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  required
                />
              </Field>
              <Field label="Fecha del gasto">
                <input
                  name="day"
                  type="date"
                  defaultValue={localDay()}
                  max={localDay()}
                  required
                />
              </Field>
            </>
          )}
          {["sale", "expense"].includes(action) && (
            <Field label="Medio de pago">
              <select name="method">
                {methods.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
          )}
          {["receive", "transfer", "adjust"].includes(action) && (
            <Field
              label={action === "receive" ? "Detalle / proveedor" : "Motivo"}
            >
              <input
                name="note"
                minLength={3}
                maxLength={300}
                placeholder={
                  action === "receive"
                    ? "Compra o carga inicial"
                    : action === "adjust"
                      ? "Ej. Rotura, vencimiento o diferencia de conteo"
                      : "Ej. Reposición para la otra sede"
                }
                required
              />
            </Field>
          )}
          {action === "reverse" && (
            <Field label="Motivo de anulación">
              <input name="reason" minLength={3} maxLength={300} required />
            </Field>
          )}
        </div>
        {action === "sale" && product && (
          <p className="notice">
            Disponible en esta sede: <strong>{stock}</strong> · Total:{" "}
            <strong>{money(product.price * units)}</strong>
          </p>
        )}
        {["transfer", "adjust"].includes(action) && product && (
          <p className="notice">
            Disponible en origen: <strong>{stock}</strong> · Quedará:{" "}
            <strong>{stock + (action === "adjust" ? units : -units)}</strong>.
            Esta operación cambia existencias; no registra un cobro ni un gasto.
          </p>
        )}
        {action === "editProduct" && (
          <p className="notice">
            El nuevo precio se usará en ventas futuras. Las ventas anteriores
            conservan su importe. Desactivar conserva el historial y las
            existencias.
          </p>
        )}
        {action === "reverse" && target && (
          <p className="notice">
            {target.concept} · {money(target.amount)}. Se registrará un
            movimiento por el importe opuesto.
            {target.kind === "sale"
              ? " Las unidades volverán al stock; usá esta opción cuando la mercadería también se devuelve."
              : ""}
          </p>
        )}
        <button
          className="button gold"
          type="submit"
          disabled={
            busy ||
            (["sale", "transfer"].includes(action) &&
              (!product || stock < units || units < 1)) ||
            (action === "transfer" &&
              (!destination || destination === branch)) ||
            (action === "adjust" &&
              (!product || units === 0 || stock + units < 0))
          }
        >
          {busy
            ? "Guardando…"
            : action === "reverse"
              ? "Confirmar anulación"
              : "Guardar movimiento"}
        </button>
      </fieldset>
    </form>
  );
}
