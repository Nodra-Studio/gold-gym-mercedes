"use client";
import { useState } from "react";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseMembersCsv, type ImportMember } from "@/lib/import-members";
import { requestId } from "@/lib/club";
import {
  ErrorNotice,
  SaveButton,
  useClub,
  Loading,
} from "@/components/club-client";
type Preview = {
  valid: boolean;
  count: number;
  errors: { row: number; message: string }[];
};
type BackupCheck = {
  valid: boolean;
  counts: Record<string, number>;
  total: number;
  exportedAt: string;
};
async function send(path: string, payload: unknown) {
  const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    j = (await r.json()) as Record<string, unknown>;
  if (!r.ok)
    throw Error(String(j.error ?? "No se pudo completar la operación."));
  return j;
}
export default function DataClient() {
  const { data, loading, error: loadError, refresh } = useClub();
  const [rows, setRows] = useState<ImportMember[]>([]),
    [preview, setPreview] = useState<Preview | null>(null),
    [backup, setBackup] = useState<unknown>(null),
    [check, setCheck] = useState<BackupCheck | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [importKey, setImportKey] = useState(""),
    [restoreKey, setRestoreKey] = useState(""),
    [confirm, setConfirm] = useState(false);
  async function run(action: () => Promise<void>) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  }
  function template() {
    const text =
      "Nombre;DNI;Teléfono;Plan;Estado;Vencimiento\nPersona de ejemplo;99888777;;Musculación libre;activo;2026-12-31\n";
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-socios-gold-gym.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (loading && !data)
    return (
      <main className="workspace">
        <Loading />
      </main>
    );
  if (!data || data.role !== "owner")
    return (
      <main className="workspace">
        <Link href="/gestion">← Gestión</Link>
        <ErrorNotice
          error={
            loadError || "Sólo administración puede importar y respaldar datos."
          }
        />
      </main>
    );
  return (
    <main className="workspace">
      <Link className="text-link" href="/gestion">
        ← Volver a gestión
      </Link>
      <header className="work-header">
        <div>
          <p className="eyebrow">GOLD GYM / DATOS</p>
          <h1>Datos que podés llevarte.</h1>
          <p>Importación validada y copias completas del club.</p>
        </div>
      </header>
      <ErrorNotice error={error} />
      {notice && (
        <p className="success-box" role="status">
          {notice}
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Importar socios</h2>
          <button className="button small" onClick={template}>
            Descargar plantilla CSV
          </button>
        </div>
        <p className="muted">
          Hasta 200 socios por lote. Columnas: Nombre, DNI, Teléfono, Plan,
          Estado, Vencimiento. El plan debe existir y el vencimiento debe tener
          formato AAAA-MM-DD. Se agregan socios nuevos; no se reemplazan los
          existentes.
        </p>
        <label className="field" style={{ display: "block", margin: "20px 0" }}>
          Archivo CSV
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              setPreview(null);
              setRows([]);
              if (file)
                void run(async () => {
                  if (file.size > 160000) throw Error("El CSV supera 160 KB.");
                  const parsed = parseMembersCsv(await file.text()),
                    key = requestId();
                  setRows(parsed);
                  setImportKey(key);
                  setPreview(
                    (await send("/api/import-members", {
                      action: "preview",
                      rows: parsed,
                      requestKey: key,
                    })) as Preview,
                  );
                });
            }}
          />
        </label>
        {preview && (
          <>
            <p>
              <strong>
                {preview.count}{" "}
                {preview.count === 1
                  ? "socio encontrado"
                  : "socios encontrados"}
              </strong>{" "}
              ·{" "}
              {preview.valid
                ? "Archivo listo para importar"
                : "Revisá los errores antes de importar"}
            </p>
            <div style={{ maxHeight: 320, overflow: "auto", marginTop: 18 }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["Nombre", "DNI", "Plan", "Estado", "Vencimiento"].map(
                      (h) => (
                        <TableHead key={h}>{h}</TableHead>
                      ),
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.dni}</TableCell>
                      <TableCell>{r.plan}</TableCell>
                      <TableCell>
                        {r.status === "active" ? "Activo" : "Pausado"}
                      </TableCell>
                      <TableCell>{r.expires}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {preview.errors.length > 0 && (
              <ul className="error-box" style={{ marginTop: 16 }}>
                {preview.errors.map((e, i) => (
                  <li key={i}>
                    Fila {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
            {preview.valid && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const result = await send("/api/import-members", {
                      action: "commit",
                      rows,
                      requestKey: importKey,
                    });
                    setNotice(
                      `${result.count} ${result.count === 1 ? "socio importado" : "socios importados"}.`,
                    );
                    setPreview(null);
                    setRows([]);
                    await refresh();
                  });
                }}
              >
                <p className="muted" style={{ margin: "18px 0" }}>
                  Se revisará otra vez al confirmar. Ante un conflicto no se
                  guarda ningún socio del lote.
                </p>
                <SaveButton busy={busy}>
                  Confirmar importación de {preview.count}{" "}
                  {preview.count === 1 ? "socio" : "socios"}
                </SaveButton>
              </form>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>Descargar respaldo</h2>
          <a className="button gold small" href="/api/export" download>
            Descargar JSON completo
          </a>
        </div>
        <p>
          Incluye planes, socios, cobros, ingresos, reservas, clases,
          inscripciones, caja, productos, stock y auditoría.
        </p>
        <p className="muted" style={{ marginTop: 16 }}>
          Guardá la copia en un lugar privado. Puede contener DNI y teléfonos.
          Los permisos del personal no se exportan ni se restauran: se vuelven a
          asignar desde Equipo. Esta descarga manual no reemplaza un respaldo
          automático del alojamiento.
        </p>
      </section>
      <section className="panel">
        <h2>Comprobar y restaurar una copia</h2>
        <p className="muted" style={{ marginTop: 18 }}>
          Primero comprobamos formato, relaciones, cupos y duplicados. La
          restauración exige un espacio vacío y admite hasta 5.000 registros en
          un archivo de 1,5 MB. Conserva los datos de negocio y asigna nuevos
          identificadores internos.
        </p>
        <label className="field" style={{ display: "block", margin: "20px 0" }}>
          Respaldo JSON
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setCheck(null);
              setConfirm(false);
              setBackup(null);
              if (f)
                void run(async () => {
                  if (f.size > 1500000)
                    throw Error("El archivo supera 1,5 MB.");
                  const value = JSON.parse(await f.text()),
                    key = requestId();
                  setBackup(value);
                  setRestoreKey(key);
                  setCheck(
                    (await send("/api/backup", {
                      action: "check",
                      backup: value,
                      requestKey: key,
                    })) as BackupCheck,
                  );
                });
            }}
          />
        </label>
        {check && (
          <>
            <p className="success-box">
              Copia válida · {check.total} registros ·{" "}
              {new Date(check.exportedAt).toLocaleString("es-AR")}
            </p>
            <div className="stats">
              {Object.entries(check.counts).map(([name, count]) => (
                <div className="stat" key={name}>
                  <span>
                    {{
                      plans: "Planes",
                      members: "Socios",
                      payments: "Cobros",
                      accesses: "Ingresos",
                      bookings: "Reservas",
                      sessions: "Clases",
                      enrollments: "Inscripciones",
                      audit: "Auditoría",
                      booking_payments: "Cobros de pádel",
                      products: "Productos",
                      cash_entries: "Caja",
                      stock_moves: "Movimientos de stock",
                      product_changes: "Historial de productos",
                    }[name] ?? name}
                  </span>
                  <strong>{count}</strong>
                </div>
              ))}
            </div>
            {data.plans.length ||
            data.members.length ||
            data.bookings.length ? (
              <p className="notice">
                La copia pasó la comprobación. Este espacio tiene datos, por lo
                que no se habilita la restauración aquí.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!confirm) return;
                  void run(async () => {
                    const r = await send("/api/backup", {
                      action: "restore",
                      backup,
                      requestKey: restoreKey,
                    });
                    setNotice(`Restauración completada: ${r.total} registros.`);
                    setCheck(null);
                    await refresh();
                  });
                }}
              >
                <label
                  style={{
                    display: "flex",
                    gap: 12,
                    alignItems: "center",
                    margin: "20px 0",
                  }}
                >
                  <Checkbox
                    required
                    checked={confirm}
                    onCheckedChange={(value) => setConfirm(value === true)}
                  />
                  Confirmo que quiero restaurar esta copia en mi espacio vacío.
                </label>
                <SaveButton busy={busy}>Restaurar copia</SaveButton>
              </form>
            )}
          </>
        )}
      </section>
    </main>
  );
}

