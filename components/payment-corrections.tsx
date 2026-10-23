"use client";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { money, requestId } from "@/lib/club";
import { branches, branchName } from "@/lib/branches";
import {
  Field,
  ErrorNotice,
  SaveButton,
  FormModal,
} from "@/components/club-client";
export type CorrectablePayment = {
  id: string;
  source: "membership" | "booking";
  amount: number;
  method: string;
  venue: string | null;
  revision: number;
  voided: number;
};
type Change = {
  id: string;
  before_state: string;
  after_state: string;
  reason: string;
  actor: string;
  created_at: string;
};
function snapshotLabel(raw: string) {
  try {
    const p = JSON.parse(raw) as CorrectablePayment;
    return `${p.voided ? "Anulado" : money(Number(p.amount))} · ${p.method} · ${branchName(p.venue)}`;
  } catch {
    return "Estado conservado en el historial";
  }
}
export default function PaymentCorrection({
  payment,
  mode = "edit",
  onSaved,
  onClose,
}: {
  payment: CorrectablePayment;
  mode?: "edit" | "void";
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(payment),
    [changes, setChanges] = useState<Change[]>([]),
    [action, setAction] = useState(mode),
    [amount, setAmount] = useState(String(payment.amount)),
    [method, setMethod] = useState(payment.method),
    [venue, setVenue] = useState(payment.venue ?? ""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(requestId);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch(
      `/api/payment-corrections?source=${payment.source}&id=${encodeURIComponent(payment.id)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const data = (await response.json()) as {
          payment: CorrectablePayment;
          changes: Change[];
          error?: string;
        };
        if (!response.ok)
          throw Error(data.error || "No se pudo cargar el cobro.");
        if (controller.signal.aborted) return;
        setCurrent({ ...data.payment, source: payment.source });
        setChanges(data.changes);
        setAmount(String(data.payment.amount));
        setMethod(data.payment.method);
        setVenue(data.payment.venue ?? "");
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "No se pudo cargar el cobro.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [payment.id, payment.source]);
  const change = (apply: () => void) => {
    apply();
    setKey(requestId());
  };
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch("/api/payment-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          source: payment.source,
          id: payment.id,
          expectedRevision: current.revision,
          reason,
          requestKey: key,
          ...(action === "edit"
            ? { amount: Number(amount), method, venue }
            : {}),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        ok?: boolean;
      };
      if (!response.ok)
        throw Error(result.error || "No se pudo guardar la corrección.");
      onClose();
      void onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la corrección.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormModal
      open
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Revisar cobro"
      description="Cada corrección conserva el importe anterior, el motivo, la fecha y la persona que la realizó."
    >
      <ErrorNotice error={error} />
      {loading ? (
        <p role="status">Cargando cobro e historial…</p>
      ) : (
        <>
          <p>
            Cobro registrado: <strong>{money(current.amount)}</strong> ·{" "}
            {current.method} · {branchName(current.venue)}.
          </p>
          {current.voided ? (
            <p className="notice">
              Este cobro está anulado. Se conserva para consultar su historial.
            </p>
          ) : (
            <form onSubmit={save}>
              <fieldset disabled={busy} className="form-grid">
                <Field label="Operación">
                  <select
                    value={action}
                    onChange={(event) =>
                      change(() =>
                        setAction(event.target.value as "edit" | "void"),
                      )
                    }
                  >
                    <option value="edit">Corregir datos</option>
                    <option value="void">Anular cobro</option>
                  </select>
                </Field>
                {action === "edit" && (
                  <>
                    <Field label="Importe correcto (ARS)">
                      <input
                        type="number"
                        min={payment.source === "booking" ? 1 : 0}
                        max={10000000}
                        step="1"
                        required
                        value={amount}
                        onChange={(event) =>
                          change(() => setAmount(event.target.value))
                        }
                      />
                    </Field>
                    <Field label="Medio correcto">
                      <select
                        value={method}
                        onChange={(event) =>
                          change(() => setMethod(event.target.value))
                        }
                        required
                      >
                        {["Efectivo", "Transferencia", "Tarjeta"].map(
                          (value) => (
                            <option key={value}>{value}</option>
                          ),
                        )}
                      </select>
                    </Field>
                    <Field label="Sede correcta">
                      <select
                        value={venue}
                        onChange={(event) =>
                          change(() => setVenue(event.target.value))
                        }
                        required
                      >
                        <option value="">Elegí la sede</option>
                        {branches
                          .filter(
                            (branch) =>
                              payment.source !== "booking" ||
                              branch.id === "velez",
                          )
                          .map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </>
                )}
                <Field label="Motivo obligatorio">
                  <textarea
                    value={reason}
                    onChange={(event) =>
                      change(() => setReason(event.target.value))
                    }
                    required
                    minLength={3}
                    maxLength={300}
                    placeholder="Explicá qué se registró mal y por qué se corrige."
                  />
                </Field>
              </fieldset>
              <p className="notice">
                {payment.source === "booking"
                  ? "La corrección actualiza lo cobrado y el saldo pendiente de la reserva."
                  : "Esta acción corrige el registro de dinero. La vigencia de la membresía se conserva; si también está equivocada, corregila en la ficha del socio."}{" "}
                {action === "void" &&
                  "El cobro deja de sumar en caja e informes y su historial permanece disponible."}
              </p>
              <div className="form-actions">
                <button
                  type="button"
                  className="button small"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <SaveButton busy={busy}>
                  {action === "void"
                    ? "Anular y conservar historial"
                    : "Guardar corrección"}
                </SaveButton>
              </div>
            </form>
          )}
          <section aria-label="Historial de correcciones">
            <h3>Historial del cobro</h3>
            {!changes.length ? (
              <p>No tiene correcciones registradas.</p>
            ) : (
              <ol>
                {changes.map((change) => (
                  <li key={change.id}>
                    <p>
                      <strong>{change.reason}</strong>
                      <br />
                      Antes: {snapshotLabel(change.before_state)}
                      <br />
                      Después: {snapshotLabel(change.after_state)}
                      <br />
                      <small>
                        {new Intl.DateTimeFormat("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(change.created_at))}{" "}
                        · Operador: {change.actor}
                      </small>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </FormModal>
  );
}
