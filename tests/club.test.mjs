import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  folder = mkdtempSync(join(tmpdir(), "gold-gym-test-"));
const compile = (file, replacements) => {
  let text = readFileSync(resolve(file), "utf8");
  for (const [from, to] of replacements) {
    text = text.replaceAll(from, to);
    if (from === "'zod'") text = text.replaceAll('"zod"', to);
  }
  return ts.transpileModule(text, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
};
writeFileSync(
  join(folder, "runtime.mjs"),
  `export const env={}; export const supportsSitesIdentity=true; export async function independentUserId(){return null} export function ownerAccount(){return false} export let currentUser=null; export function setUser(id){currentUser=id?{userId:id}:null} export async function getChatGPTUser(){return currentUser}`,
);
writeFileSync(join(folder, "club.mjs"), compile("lib/club.ts", []));
writeFileSync(
  join(folder, "server.mjs"),
  compile("lib/server.ts", [
    ["@club/runtime", "./runtime.mjs"],
    ["@/app/chatgpt-auth", "./runtime.mjs"],
  ]),
);
writeFileSync(
  join(folder, "route.mjs"),
  compile("app/api/club/route.ts", [
    ["'zod'", JSON.stringify(pathToFileURL(require.resolve("zod")).href)],
    ["@/lib/server", "./server.mjs"],
    ["@/lib/club", "./club.mjs"],
  ]),
);
writeFileSync(
  join(folder, "export.mjs"),
  compile("app/api/export/route.ts", [["@/lib/server", "./server.mjs"]]),
);
writeFileSync(
  join(folder, "backup-lib.mjs"),
  compile("lib/backup.ts", [
    ["'zod'", JSON.stringify(pathToFileURL(require.resolve("zod")).href)],
    ["./club", "./club.mjs"],
  ]),
);
writeFileSync(join(folder, "csv.mjs"), compile("lib/import-members.ts", []));
writeFileSync(
  join(folder, "padel-settings.mjs"),
  compile("lib/padel-settings.ts", [["@/lib/server", "./server.mjs"]]),
);
for (const endpoint of [
  "team",
  "import-members",
  "backup",
  "player",
  "settings",
  "booking-payments",
])
  writeFileSync(
    join(folder, endpoint + ".mjs"),
    compile("app/api/" + endpoint + "/route.ts", [
      ["'zod'", JSON.stringify(pathToFileURL(require.resolve("zod")).href)],
      ["@/lib/server", "./server.mjs"],
      ["@club/runtime", "./runtime.mjs"],
      ["@/lib/club", "./club.mjs"],
      ["@/lib/backup", "./backup-lib.mjs"],
      ["@/lib/padel-settings", "./padel-settings.mjs"],
    ]),
  );
writeFileSync(join(folder, "safe-csv.mjs"), compile("lib/csv.ts", []));
writeFileSync(
  join(folder, "reports.mjs"),
  compile("app/api/reports/route.ts", [
    ["@/lib/server", "./server.mjs"],
    ["@/lib/club", "./club.mjs"],
    ["@/lib/csv", "./safe-csv.mjs"],
  ]),
);
const reportsApi = await import(pathToFileURL(join(folder, "reports.mjs"))),
  safeCsv = await import(pathToFileURL(join(folder, "safe-csv.mjs")));
const bookingPaymentsApi=await import(pathToFileURL(join(folder,"booking-payments.mjs")));
const playerApi = await import(pathToFileURL(join(folder, "player.mjs"))),
  settingsApi = await import(pathToFileURL(join(folder, "settings.mjs")));
const teamApi = await import(pathToFileURL(join(folder, "team.mjs"))),
  importApi = await import(pathToFileURL(join(folder, "import-members.mjs"))),
  backupApi = await import(pathToFileURL(join(folder, "backup.mjs"))),
  csv = await import(pathToFileURL(join(folder, "csv.mjs")));
async function call(endpoint, payload) {
  const r = await endpoint.POST(
    new Request("https://test.local/api/test", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://test.local",
      },
      body: JSON.stringify(payload),
    }),
  );
  return { status: r.status, ...(await r.json()) };
}
const exporter = await import(pathToFileURL(join(folder, "export.mjs")));
const runtime = await import(pathToFileURL(join(folder, "runtime.mjs"))),
  api = await import(pathToFileURL(join(folder, "route.mjs"))),
  logic = await import(pathToFileURL(join(folder, "club.mjs")));
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
for (const migration of readdirSync("drizzle")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  db.exec(
    readFileSync("drizzle/" + migration, "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );
class Statement {
  constructor(sql, args = []) {
    this.sql = sql;
    this.args = args;
  }
  bind(...args) {
    return new Statement(this.sql, args);
  }
  async first() {
    return db.prepare(this.sql).get(...this.args) ?? null;
  }
  async run() {
    const r = db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(r.changes) } };
  }
  async all() {
    return { results: db.prepare(this.sql).all(...this.args) };
  }
}
runtime.env.DB = {
  prepare: (sql) => new Statement(sql),
  async batch(statements) {
    db.exec("BEGIN");
    try {
      const out = [];
      for (const s of statements)
        out.push(/^\s*SELECT/i.test(s.sql) ? await s.all() : await s.run());
      db.exec("COMMIT");
      return out;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  },
};
async function post(body, origin = "https://test.local") {
  const response = await api.POST(
    new Request("https://test.local/api/club", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, ...(await response.json()) };
}
async function get() {
  const r = await api.GET();
  return { status: r.status, ...(await r.json()) };
}
const key = () => crypto.randomUUID();
try {
  await test("Flujos de club, aislamiento y transacciones", async (t) => {
    await t.test("Rechaza solicitudes sin identidad", async () => {
      runtime.setUser(null);
      assert.equal((await get()).status, 401);
      assert.equal((await post({ action: "seed" })).status, 401);
    });
    runtime.setUser("owner-a");
    await t.test("No permite escrituras cross-origin", async () =>
      assert.equal(
        (await post({ action: "seed" }, "https://other.test")).status,
        403,
      ),
    );
    await t.test("Crea datos ficticios una sola vez", async () => {
      assert.equal((await post({ action: "seed" })).status, 200);
      assert.equal((await get()).members.length, 6);
      assert.equal((await post({ action: "seed" })).status, 409);
    });
    const first = await get(),
      ana = first.members.find((m) => m.dni === "99000001"),
      bruno = first.members.find((m) => m.dni === "99000002");
    await t.test(
      "Valida vigente, vencido, pausado y DNI desconocido",
      async () => {
        for (const [dni, allowed, reason] of [
          ["99000001", true, "Membresía vigente"],
          ["99000002", false, "Cuota vencida"],
          ["99000003", false, "Membresía pausada"],
          ["99999999", false, "DNI no registrado"],
        ]) {
          const r = await post({ action: "access", dni, venue: "Calle 30" });
          assert.equal(r.status, 200);
          assert.equal(r.allowed, allowed);
          assert.equal(r.reason, reason);
          assert.equal(r.hardware, "simulated");
        }
      },
    );
    await t.test("La terminal exige sede y registra la sede validada", async () => {
      const result = await post({ action: "access", dni: "99000001", venue: "Calle 30" });
      assert.equal(result.status, 200);
      assert.equal(result.allowed, true);
      const state = await get();
      assert.ok(state.accesses.some(a => a.venue === "Calle 30"));
      assert.equal((await post({action:"access",dni:"99000001"})).status,400);
    });
    await t.test(
      "Un cobro repetido no duplica pago ni extiende dos veces",
      async () => {
        const p = {
          action: "payment", venue:"calle30",
          memberId: ana.id,
          method: "Efectivo",
          expectedPrice: 30000,
          requestKey: key(),
        };
        assert.equal((await post(p)).status, 200);
        assert.equal((await post(p)).replayed, true);
        const d = await get();
        assert.equal(d.payments.length, 1);
        assert.equal(
          d.members.find((m) => m.id === ana.id).expires,
          logic.addDays(ana.expires, 30),
        );
      },
    );
    await t.test("Cobro de vencido renueva desde hoy", async () => {
      assert.equal(
        (
          await post({
            action: "payment", venue:"calle30",
            memberId: bruno.id,
            method: "Transferencia",
            expectedPrice: 42000,
            requestKey: key(),
          })
        ).status,
        200,
      );
      assert.equal(
        (await get()).members.find((m) => m.id === bruno.id).expires,
        logic.addDays(first.today, 30),
      );
    });
    const booking = {
      action: "booking",
      court: 1,
      day: logic.addDays(first.today, 2),
      start: 480,
      name: "Reserva de prueba",
      phone: "",
      kind: "booking",
      amount: 20000,
      deposit: 5000,
      weeks: 1,
      requestKey: key(),
    };
    await t.test("Crea reserva y maneja reintento idempotente", async () => {
      assert.equal((await post(booking)).status, 200);
      assert.equal((await post(booking)).replayed, true);
    });
    await t.test("Impide dos reservas en el mismo turno", async () =>
      assert.equal((await post({ ...booking, requestKey: key() })).status, 409),
    );
    await t.test(
      "Si una serie choca, revierte todos los turnos de la serie",
      async () => {
        const later = {
          ...booking,
          day: logic.addDays(first.today, 16),
          court: 3,
          requestKey: key(),
        };
        assert.equal((await post(later)).status, 200);
        const count = (await get()).bookings.length;
        assert.equal(
          (await post({ ...booking, court: 3, weeks: 4, requestKey: key() }))
            .status,
          409,
        );
        assert.equal((await get()).bookings.length, count);
      },
    );
    await t.test(
      "Serie válida guarda cuatro turnos y una sola seña",
      async () => {
        assert.equal(
          (await post({ ...booking, court: 4, weeks: 4, requestKey: key() }))
            .status,
          200,
        );
        const b = (await get()).bookings.filter((b) => b.court === 4);
        assert.equal(b.length, 4);
        assert.equal(
          b.reduce((n, b) => n + b.deposit, 0),
          5000,
        );
      },
    );
    await t.test("Cancelar libera el turno sin borrar historial", async () => {
      const b = (await get()).bookings.find((b) => b.court === 1);
      assert.equal(
        (await post({ action: "cancelBooking", id: b.id })).status,
        200,
      );
      assert.equal((await post({ ...booking, requestKey: key() })).status, 200);
      assert.equal(
        (await get()).bookings.find((x) => x.id === b.id).status,
        "cancelled",
      );
    });
    await t.test(
      "Rechaza fechas imposibles, pasadas y señas excesivas",
      async () => {
        for (const p of [
          { day: "2026-02-31" },
          { day: "2000-01-01" },
          { deposit: 30000 },
          { court: 5 },
          { start: 490 },
        ])
          assert.equal(
            (await post({ ...booking, ...p, requestKey: key() })).status,
            400,
          );
      },
    );
    await t.test(
      "Clases: capacidad, membresía y liberación de cupo",
      async () => {
        assert.equal(
          (
            await post({
              action: "session",
              name: "Clase de prueba",
              day: logic.addDays(first.today, 1),
              time: "18:00",
              capacity: 1,
              venue: "Calle 30",
            })
          ).status,
          200,
        );
        const s = (await get()).sessions.find(
          (s) => s.name === "Clase de prueba",
        );
        assert.equal(
          (await post({ action: "enroll", sessionId: s.id, memberId: ana.id }))
            .status,
          200,
        );
        assert.equal(
          (
            await post({
              action: "enroll",
              sessionId: s.id,
              memberId: bruno.id,
            })
          ).status,
          409,
        );
        const e = (await get()).enrollments.find((e) => e.session_id === s.id);
        assert.equal(
          (await post({ action: "cancelEnrollment", id: e.id })).status,
          200,
        );
        assert.equal(
          (
            await post({
              action: "enroll",
              sessionId: s.id,
              memberId: bruno.id,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "Aislamiento entre usuarios también al modificar IDs",
      async () => {
        runtime.setUser("owner-b");
        const d = await get();
        assert.equal(d.members.length, 0);
        assert.equal(d.bookings.length, 0);
        assert.equal(
          (
            await post({
              action: "payment", venue:"calle30",
              memberId: ana.id,
              method: "Efectivo",
              expectedPrice: 30000,
              requestKey: key(),
            })
          ).status,
          404,
        );
        runtime.setUser("owner-a");
      },
    );
    await t.test("DNI único y contenido validado en servidor", async () => {
      const p = {
        action: "member",
        name: "Otra persona",
        dni: ana.dni,
        phone: "",
        planId: ana.plan_id,
        expires: first.today,
        status: "active",
      };
      assert.equal((await post(p)).status, 409);
      assert.equal((await post({ ...p, dni: "INVALID" })).status, 400);
    });
    await t.test("Exportación completa, autenticada y aislada", async () => {
      runtime.setUser(null);
      assert.equal((await exporter.GET()).status, 401);
      runtime.setUser("owner-b");
      assert.equal(
        (await (await exporter.GET()).json()).records.members.length,
        0,
      );
      runtime.setUser("owner-a");
      const r = await exporter.GET(),
        d = await r.json();
      assert.equal(r.headers.get("cache-control"), "no-store");
      assert.equal(d.records.members.length, 6);
      assert.equal(d.records.members[0].owner, undefined);
      assert.equal(d.records.bookings.length, (await get()).bookings.length);
    });
    await t.test(
      "Precio nuevo conserva pagos y vencimientos previos; rechaza cambios obsoletos",
      async () => {
        const before = await get(),
          p = before.plans.find((p) => p.id === ana.plan_id),
          m = before.members.find((m) => m.id === ana.id);
        assert.equal(
          (
            await post({
              action: "planPrice",
              id: p.id,
              expectedPrice: p.price,
              price: 35000,
            })
          ).status,
          200,
        );
        const after = await get();
        assert.deepEqual(after.payments, before.payments);
        assert.equal(
          after.members.find((x) => x.id === ana.id).expires,
          m.expires,
        );
        assert.equal(
          (
            await post({
              action: "planPrice",
              id: p.id,
              expectedPrice: p.price,
              price: 36000,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await post({
              action: "payment", venue:"calle30",
              memberId: ana.id,
              method: "Efectivo",
              expectedPrice: 30000,
              requestKey: key(),
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await post({
              action: "payment", venue:"calle30",
              memberId: ana.id,
              method: "Efectivo",
              expectedPrice: 35000,
              requestKey: key(),
            })
          ).status,
          200,
        );
        assert.ok(
          (await get()).payments.some(
            (x) => x.member_id === ana.id && x.amount === 35000,
          ),
        );
        runtime.setUser("owner-b");
        assert.equal(
          (
            await post({
              action: "planPrice",
              id: p.id,
              expectedPrice: 35000,
              price: 1,
            })
          ).status,
          404,
        );
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "Saldo de pádel: cobro, reintento, cancelaciones y aislamiento",
      async () => {
        const b = (await get()).bookings.find(
          (b) => b.status === "confirmed" && b.court === 1,
        );
        runtime.setUser("owner-b");
        assert.equal(
          (
            await post({
              action: "settleBooking",
              id: b.id,
              expectedDeposit: b.deposit,
              method: "Efectivo",
            })
          ).status,
          404,
        );
        runtime.setUser("owner-a");
        assert.equal(
          (
            await post({
              action: "settleBooking",
              id: b.id,
              expectedDeposit: 1,
              method: "Efectivo",
            })
          ).status,
          409,
        );
        const payload = {
          action: "settleBooking",
          id: b.id,
          expectedDeposit: b.deposit,
          method: "Transferencia",
        };
        assert.equal((await post(payload)).status, 200);
        assert.equal((await post(payload)).replayed, true);
        const d = await get();
        assert.equal(d.bookings.find((x) => x.id === b.id).deposit, b.amount);
        assert.equal(
          d.audit.filter((a) => a.action === "Saldo de pádel cobrado").length,
          1,
        );
        await post({ action: "cancelBooking", id: b.id });
        assert.equal((await post(payload)).status, 409);
      },
    );
    await t.test(
      "Roles: recepción comparte datos, pero no precios, equipo ni exportaciones",
      async () => {
        assert.equal(
          (
            await call(teamApi, {
              userId: "staff-a",
              name: "Recepción de prueba",
              role: "reception",
              status: "active",
            })
          ).status,
          200,
        );
        runtime.setUser("staff-a");
        assert.equal((await get()).members.length, 6);
        assert.equal((await get()).role, "reception");
        assert.equal(
          (
            await post({
              action: "plan",
              name: "Prohibido",
              price: 1,
              days: 30,
            })
          ).status,
          403,
        );
        assert.equal((await exporter.GET()).status, 403);
        assert.equal(
          (
            await call(teamApi, {
              userId: "other",
              name: "Otro",
              role: "gate",
              status: "active",
            })
          ).status,
          403,
        );
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "Terminal sólo valida accesos; revocación se aplica inmediatamente",
      async () => {
        assert.equal(
          (
            await call(teamApi, {
              userId: "gate-a",
              name: "Terminal de prueba",
              role: "gate",
              status: "active",
            })
          ).status,
          200,
        );
        runtime.setUser("gate-a");
        assert.equal((await get()).status, 403);
        assert.equal(
          (await post({ action: "access", dni: "99000001", venue: "Calle 30" }))
            .allowed,
          true,
        );
        assert.equal((await exporter.GET()).status, 403);
        assert.equal(
          (await post({ action: "booking", ...booking })).status,
          403,
        );
        runtime.setUser("owner-a");
        assert.equal(
          (
            await call(teamApi, {
              userId: "gate-a",
              name: "Terminal de prueba",
              role: "gate",
              status: "revoked",
            })
          ).status,
          200,
        );
        runtime.setUser("gate-a");
        assert.equal(
          (await post({ action: "access", dni: "99000001", venue: "Calle 30" }))
            .status,
          403,
        );
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "No permite apropiarse del personal de otro club ni modificar al propietario",
      async () => {
        runtime.setUser("owner-b");
        assert.equal(
          (
            await call(teamApi, {
              userId: "staff-a",
              name: "Otro club",
              role: "gate",
              status: "active",
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(teamApi, {
              userId: "owner-a",
              name: "Propietario",
              role: "gate",
              status: "active",
            })
          ).status,
          409,
        );
        runtime.setUser("owner-a");
        assert.equal(
          (
            await call(teamApi, {
              userId: "owner-a",
              name: "Propietario",
              role: "gate",
              status: "revoked",
            })
          ).status,
          400,
        );
      },
    );
    await t.test("CSV maneja BOM, delimitadores, comillas y estados", () => {
      const rows = csv.parseMembersCsv(
        '\ufeffNombre;DNI;Teléfono;Plan;Estado;Vencimiento\n"Apellido; Nombre";99888777;;Musculación libre;activo;2027-01-01',
      );
      assert.equal(rows[0].name, "Apellido; Nombre");
      assert.equal(rows[0].status, "active");
      assert.throws(() => csv.parseMembersCsv("Nombre;DNI\na;2"));
      assert.throws(() =>
        csv.parseMembersCsv(
          'Nombre;DNI;Teléfono;Plan;Estado;Vencimiento\n"mal',
        ),
      );
    });
    const importPayload = {
      action: "preview",
      requestKey: key(),
      rows: [
        {
          name: "Importado Uno",
          dni: "99888111",
          phone: "",
          plan: "Musculación libre",
          status: "active",
          expires: logic.addDays(first.today, 30),
        },
        {
          name: "Importado Dos",
          dni: "99888222",
          phone: "",
          plan: "Pilates",
          status: "paused",
          expires: logic.addDays(first.today, 60),
        },
      ],
    };
    await t.test(
      "Importación comprueba datos sin escribir; confirma lote y reintenta sin duplicar",
      async () => {
        const before = (await get()).members.length;
        assert.equal((await call(importApi, importPayload)).valid, true);
        assert.equal((await get()).members.length, before);
        assert.equal(
          (await call(importApi, { ...importPayload, action: "commit" })).count,
          2,
        );
        assert.equal(
          (await call(importApi, { ...importPayload, action: "commit" }))
            .replayed,
          true,
        );
        assert.equal((await get()).members.length, before + 2);
      },
    );
    await t.test(
      "Importación rechaza duplicados y datos inválidos sin altas parciales",
      async () => {
        const before = (await get()).members.length;
        const bad = {
          ...importPayload,
          requestKey: key(),
          rows: [
            ...importPayload.rows,
            {
              name: "Incorrecto",
              dni: "99888333",
              phone: "",
              plan: "Inexistente",
              status: "active",
              expires: "2026-02-31",
            },
          ],
        };
        assert.equal((await call(importApi, bad)).valid, false);
        assert.equal(
          (await call(importApi, { ...bad, action: "commit" })).status,
          409,
        );
        assert.equal((await get()).members.length, before);
        runtime.setUser("staff-a");
        assert.equal((await call(importApi, importPayload)).status, 403);
        runtime.setUser("owner-a");
      },
    );
    let snapshot;
    await t.test(
      "Respaldo comprueba relaciones y no sobrescribe un club con datos",
      async () => {
        snapshot = await (await exporter.GET()).json();
        const request = {
          action: "check",
          requestKey: key(),
          backup: snapshot,
        };
        assert.equal((await call(backupApi, request)).valid, true);
        assert.equal(
          (await call(backupApi, { ...request, action: "restore" })).status,
          409,
        );
        const malformed = structuredClone(snapshot);
        malformed.records.members[0].plan_id = "missing";
        assert.equal(
          (await call(backupApi, { ...request, backup: malformed })).status,
          400,
        );
        runtime.setUser("staff-a");
        assert.equal((await call(backupApi, request)).status, 403);
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "Restauración conserva datos y relaciones en espacio vacío, sin copiar permisos",
      async () => {
        runtime.setUser("restored-owner");
        const payload = {
          action: "restore",
          requestKey: key(),
          backup: snapshot,
        };
        const r = await call(backupApi, payload);
        assert.equal(r.status, 200);
        assert.equal((await call(backupApi, payload)).replayed, true);
        const d = await get();
        assert.equal(d.members.length, snapshot.records.members.length);
        assert.equal(d.payments.length, snapshot.records.payments.length);
        assert.equal(d.bookings.length, snapshot.records.bookings.length);
        assert.notEqual(d.members[0].id, snapshot.records.members[0].id);
        const team = await (await teamApi.GET()).json();
        assert.equal(team.members.length, 0);
        assert.equal(
          (await call(backupApi, { ...payload, requestKey: key() })).status,
          409,
        );
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "Portal: sólo muestra ocupación sin datos de terceros y reservas propias",
      async () => {
        assert.equal(
          (
            await call(teamApi, {
              userId: "player-a",
              name: "Jugador Uno",
              role: "player",
              status: "active",
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(teamApi, {
              userId: "player-b",
              name: "Jugador Dos",
              role: "player",
              status: "active",
            })
          ).status,
          200,
        );
        runtime.setUser("player-a");
        assert.equal((await get()).status, 403);
        assert.equal((await exporter.GET()).status, 403);
        const r = await playerApi.GET(
            new Request(
              "https://test.local/api/player?day=" +
                logic.addDays(first.today, 2),
            ),
          ),
          d = await r.json();
        assert.equal(r.status, 200);
        assert.ok(
          d.occupied.every(
            (x) => Object.keys(x).sort().join(",") === "court,start",
          ),
        );
        assert.equal(d.mine.length, 0);
        runtime.setUser("owner-a");
      },
    );
    const playerBooking = {
      action: "book",
      day: logic.addDays(first.today, 5),
      court: 1,
      start: 480,
      expectedPrice: 24000,
      requestKey: key(),
    };
    let playerReservation;
    await t.test(
      "Jugador reserva, reintenta sin duplicar y no accede a la reserva ajena",
      async () => {
        runtime.setUser("player-a");
        assert.equal((await call(playerApi, playerBooking)).status, 200);
        assert.equal((await call(playerApi, playerBooking)).replayed, true);
        const d = await (
          await playerApi.GET(new Request("https://test.local/api/player"))
        ).json();
        playerReservation = d.mine[0];
        assert.equal(d.mine.length, 1);
        runtime.setUser("player-b");
        assert.equal(
          (await call(playerApi, { ...playerBooking, requestKey: key() }))
            .status,
          409,
        );
        assert.equal(
          (
            await call(playerApi, {
              action: "cancel",
              id: playerReservation.id,
            })
          ).status,
          404,
        );
        const other = await (
          await playerApi.GET(new Request("https://test.local/api/player"))
        ).json();
        assert.equal(other.mine.length, 0);
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "Portal respeta precios actuales, plazo, permisos y pagos para cancelar",
      async () => {
        assert.equal(
          (
            await call(settingsApi, {
              padel_price: 28000,
              booking_days: 14,
              cancel_hours: 24,
            })
          ).status,
          200,
        );
        runtime.setUser("player-a");
        assert.equal(
          (
            await call(settingsApi, {
              padel_price: 1,
              booking_days: 14,
              cancel_hours: 24,
            })
          ).status,
          403,
        );
        assert.equal(
          (
            await call(playerApi, {
              ...playerBooking,
              court: 2,
              requestKey: key(),
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(playerApi, {
              ...playerBooking,
              court: 2,
              day: logic.addDays(first.today, 20),
              expectedPrice: 28000,
              requestKey: key(),
            })
          ).status,
          400,
        );
        assert.equal(
          (
            await call(playerApi, {
              action: "cancel",
              id: playerReservation.id,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(playerApi, {
              action: "cancel",
              id: playerReservation.id,
            })
          ).replayed,
          true,
        );
        assert.equal(
          (
            await call(playerApi, {
              ...playerBooking,
              court: 2,
              expectedPrice: 28000,
              requestKey: key(),
            })
          ).status,
          200,
        );
        const d = await (
            await playerApi.GET(new Request("https://test.local/api/player"))
          ).json(),
          b = d.mine.find((x) => x.status === "confirmed");
        runtime.setUser("owner-a");
        assert.equal(
          (
            await post({
              action: "settleBooking",
              id: b.id,
              expectedDeposit: 0,
              method: "Efectivo",
            })
          ).status,
          200,
        );
        runtime.setUser("player-a");
        assert.equal(
          (await call(playerApi, { action: "cancel", id: b.id })).status,
          409,
        );
        runtime.setUser("owner-a");
      },
    );
    await t.test(
      "La inscripción y su auditoría se revierten juntas ante una falla",
      async () => {
        runtime.setUser("owner-a");
        await post({
          action: "session",
          name: "Prueba de recuperación",
          day: logic.addDays(first.today, 3),
          time: "18:00",
          capacity: 2,
          venue: "Calle 30",
        });
        const session = (await get()).sessions.find(
          (s) => s.name === "Prueba de recuperación",
        );
        db.exec(
          "CREATE TRIGGER fail_audit BEFORE INSERT ON audit WHEN NEW.action='Inscripción a clase' BEGIN SELECT RAISE(ABORT,'simulated audit failure'); END",
        );
        try {
          assert.equal(
            (
              await post({
                action: "enroll",
                sessionId: session.id,
                memberId: ana.id,
              })
            ).status,
            503,
          );
          assert.equal(
            (await get()).enrollments.filter((e) => e.session_id === session.id)
              .length,
            0,
          );
        } finally {
          db.exec("DROP TRIGGER fail_audit");
        }
        assert.equal(
          (
            await post({
              action: "enroll",
              sessionId: session.id,
              memberId: ana.id,
            })
          ).status,
          200,
        );
      },
    );
    await t.test(
      "Informes: corte de día argentino, totales completos y páginas sin repetir",
      async () => {
        runtime.setUser("report-owner");
        db.prepare("INSERT INTO plans(id,owner,name,price,days) VALUES (?,?,?,?,?)").run(
          "report-plan",
          "report-owner",
          "Plan",
          100,
          30,
        );
        db.prepare(
          "INSERT INTO members (id,owner,name,dni,phone,plan_id,status,expires,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        ).run(
          "report-member",
          "report-owner",
          "=HYPERLINK(test)",
          "99888888",
          "",
          "report-plan",
          "active",
          "2020-01-01",
          "2026-09-24T00:00:00.000Z",
        );
        const ins = db.prepare("INSERT INTO payments (id,owner,member_id,amount,method,created_at,request_key) VALUES (?,?,?,?,?,?,?)");
        for (let i = 0; i < 510; i++)
          ins.run(
            "report-pay-" + i,
            "report-owner",
            "report-member",
            100,
            "Efectivo",
            "2026-09-24T03:00:00.000Z",
            "report-key-" + i,
          );
        ins.run(
          "report-before",
          "report-owner",
          "report-member",
          999,
          "Tarjeta",
          "2026-09-24T02:59:59.999Z",
          "before",
        );
        ins.run(
          "report-last",
          "report-owner",
          "report-member",
          200,
          "Transferencia",
          "2026-09-25T02:59:59.999Z",
          "last",
        );
        ins.run(
          "report-after",
          "report-owner",
          "report-member",
          999,
          "Tarjeta",
          "2026-09-25T03:00:00.000Z",
          "after",
        );
        const url =
          "https://test.local/api/reports?from=2026-09-24&to=2026-09-24";
        const first = await (await reportsApi.GET(new Request(url))).json(),
          second = await (
            await reportsApi.GET(new Request(url + "&paymentPage=2"))
          ).json();
        assert.equal(
          first.methods.reduce((n, m) => n + m.total, 0),
          51200,
        );
        assert.equal(
          first.methods.reduce((n, m) => n + m.count, 0),
          511,
        );
        assert.equal(first.payments.length, 25);
        assert.equal(second.payments.length, 25);
        assert.equal(
          first.payments.some((p) =>
            second.payments.some((q) => q.id === p.id),
          ),
          false,
        );
        assert.equal(first.members.expired, 1);
        const csv = await reportsApi.GET(new Request(url + "&format=csv"));
        assert.equal(csv.status, 200);
        assert.equal(csv.headers.get("cache-control"), "no-store");
        const text = await csv.text();
        assert.ok(text.includes('"\'=HYPERLINK(test)"'));
        assert.equal(text.split("\r\n").length, 512);
        runtime.setUser("owner-a");
        const other = await (await reportsApi.GET(new Request(url))).json();
        assert.equal(
          other.payments.some((p) => p.id.startsWith("report-")),
          false,
        );
      },
    );
    await t.test(
      "Informes: saldos excluyen bloqueos, cancelaciones y pagos completos",
      async () => {
        runtime.setUser("report-owner");
        const insert = db.prepare(
          "INSERT INTO bookings (id,owner,court,day,start,name,phone,kind,status,amount,deposit,created_at,request_key) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        );
        for (const [i, kind, status, deposit] of [
          [0, "booking", "confirmed", 100],
          [1, "booking", "cancelled", 100],
          [2, "block", "confirmed", 0],
          [3, "booking", "confirmed", 1000],
        ])
          insert.run(
            "report-book-" + i,
            "report-owner",
            i + 1,
            "2026-09-24",
            480,
            "Prueba",
            "",
            kind,
            status,
            1000,
            deposit,
            "2026-09-24T03:00:00.000Z",
            "book-key-" + i,
          );
        const report = await (
          await reportsApi.GET(
            new Request(
              "https://test.local/api/reports?from=2026-09-24&to=2026-09-24",
            ),
          )
        ).json();
        assert.equal(report.balances.total, 900);
        assert.equal(report.balances.count, 1);
        assert.equal(report.bookings.length, 1);
      },
    );
    await t.test("Informes: fechas inválidas y roles sin permiso", async () => {
      runtime.setUser("report-owner");
      for (const query of [
        "from=2026-02-30",
        "from=2026-09-25&to=2026-09-24",
        "from=2020-01-01&to=2026-01-01",
        "paymentPage=-1",
        "bookingPage=1e3",
        "format=html",
      ])
        assert.equal(
          (
            await reportsApi.GET(
              new Request("https://test.local/api/reports?" + query),
            )
          ).status,
          400,
        );
      for (const role of ["reception", "gate", "player"]) {
        const user = "report-" + role;
        db.prepare("INSERT INTO staff VALUES (?,?,?,?,?,?)").run(
          user,
          "report-owner",
          role,
          role,
          "active",
          new Date().toISOString(),
        );
        runtime.setUser(user);
        assert.equal(
          (await reportsApi.GET(new Request("https://test.local/api/reports")))
            .status,
          403,
        );
      }
      runtime.setUser(null);
      assert.equal(
        (await reportsApi.GET(new Request("https://test.local/api/reports")))
          .status,
        401,
      );
      runtime.setUser("owner-a");
    });
    await t.test("Cobros de pádel: seña, saldo, reintentos e informe por fecha de cobro",async()=>{
      runtime.setUser("ledger-owner");
      const payload={action:"booking",day:logic.addDays(logic.localDay(),2),court:1,start:480,name:"Jugador de prueba",phone:"",kind:"booking",amount:3000,deposit:1000,depositMethod:"Transferencia",weeks:4,requestKey:key()};
      assert.equal((await post(payload)).status,200);assert.equal((await post(payload)).replayed,true);
      const booking=(await get()).bookings.find(b=>b.deposit===1000);
      const history=async()=>await(await bookingPaymentsApi.GET(new Request("https://test.local/api/booking-payments?bookingId="+booking.id))).json();
      assert.equal((await history()).payments.length,1);assert.equal((await history()).payments[0].method,"Transferencia");
      assert.equal((await post({action:"settleBooking",id:booking.id,expectedDeposit:999,method:"Efectivo"})).status,409);
      db.exec("CREATE TRIGGER fail_padel_ledger BEFORE INSERT ON booking_payments WHEN NEW.owner='ledger-owner' AND NEW.kind='settlement' BEGIN SELECT RAISE(ABORT,'simulated ledger failure'); END");
      assert.equal((await post({action:"settleBooking",id:booking.id,expectedDeposit:1000,method:"Efectivo"})).status,503);
      assert.equal((await get()).bookings.find(b=>b.id===booking.id).deposit,1000);
      assert.equal((await history()).payments.length,1);db.exec("DROP TRIGGER fail_padel_ledger");
      const settle={action:"settleBooking",id:booking.id,expectedDeposit:1000,method:"Efectivo"};
      assert.equal((await post(settle)).status,200);assert.equal((await post(settle)).replayed,true);
      assert.equal((await history()).payments.length,2);assert.equal((await history()).undocumented,0);
      const today=logic.localDay();const report=await(await reportsApi.GET(new Request(`https://test.local/api/reports?from=${today}&to=${today}`))).json();
      assert.equal(report.methods.filter(m=>m.activity==="Pádel").reduce((s,m)=>s+m.total,0),3000);
      assert.equal(report.payments.length,2);assert.equal(report.balances.total,0);
      await post({action:"cancelBooking",id:booking.id});assert.equal((await history()).payments.length,2);
      runtime.setUser("owner-a");assert.equal((await bookingPaymentsApi.GET(new Request("https://test.local/api/booking-payments?bookingId="+booking.id))).status,404);
      runtime.setUser("player-a");assert.equal((await bookingPaymentsApi.GET(new Request("https://test.local/api/booking-payments?bookingId="+booking.id))).status,403);
    });
    await t.test("Respaldo v2 conserva cobros de pádel; v1 no inventa historial",async()=>{
      runtime.setUser("ledger-owner");const snapshot=await(await exporter.GET()).json();assert.equal(snapshot.schemaVersion,6);assert.equal(snapshot.records.booking_payments.length,2);
      runtime.setUser("ledger-restored");assert.equal((await call(backupApi,{action:"restore",requestKey:key(),backup:snapshot})).status,200);
      const restored=await(await exporter.GET()).json();assert.equal(restored.records.booking_payments.length,2);assert.ok(restored.records.booking_payments.every(p=>restored.records.bookings.some(b=>b.id===p.booking_id)));
      const missing=structuredClone(snapshot);delete missing.records.booking_payments;assert.equal((await call(backupApi,{action:"check",requestKey:key(),backup:missing})).status,400);
      missing.schemaVersion=1;runtime.setUser("ledger-legacy-restored");assert.equal((await call(backupApi,{action:"restore",requestKey:key(),backup:missing})).status,200);
      const legacy=await(await exporter.GET()).json();assert.equal(legacy.records.booking_payments.length,0);assert.equal(legacy.records.bookings.reduce((s,b)=>s+b.deposit,0),3000);
      const corrupt=structuredClone(snapshot);corrupt.records.booking_payments[0].amount=999999;assert.equal((await call(backupApi,{action:"check",requestKey:key(),backup:corrupt})).status,400);
      runtime.setUser("owner-a");
    });
    await t.test(
      "Solicitudes limitadas por bytes incluso sin Content-Length",
      async () => {
        const { body } = await import(
          pathToFileURL(join(folder, "server.mjs"))
        );
        const request = (text) =>
          new Request("https://test.local/api/test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: text,
          });
        await assert.rejects(
          () => body(request(JSON.stringify({ name: "é".repeat(10) })), 25),
          (e) => e.status === 413,
        );
        assert.deepEqual(await body(request('{"name":"Ana"}'), 30), {
          name: "Ana",
        });
        await assert.rejects(
          () => body(request("{bad}"), 30),
          (e) => e.status === 400,
        );
      },
    );
    await t.test(
      "CSV neutraliza fórmulas, espacios y comillas sin romper columnas",
      () => {
        assert.equal(safeCsv.csvCell("  =1+1"), '"\'  =1+1"');
        assert.equal(safeCsv.csvCell('Ana; "A"'), '"Ana; ""A"""');
        assert.equal(safeCsv.csvCell(1200), '"1200"');
        assert.equal(safeCsv.csvCell(-500), '"-500"');
        assert.equal(safeCsv.csvCell("-500"), '"\'-500"');
        assert.equal(safeCsv.csvCell("+5491112345678"), '"\'+5491112345678"');
      },
    );
    await t.test("Terminal: avisos a 7 días, último día y bloqueo al vencer", () => {
      const day = "2026-10-05";
      for (const remaining of [8, 7, 1, 0]) {
        const d = logic.accessDecision({status: "active", expires: logic.addDays(day, remaining)}, day);
        assert.equal(d.allowed, true);
        assert.equal(d.daysRemaining, remaining);
        assert.equal(!!d.warning, remaining <= 7);
      }
      assert.match(logic.accessDecision({status:"active",expires:day}, day).warning, /vence hoy/);
      assert.equal(logic.accessDecision({status:"active",expires:logic.addDays(day,-1)}, day).allowed, false);
      assert.equal(logic.accessDecision({status:"paused",expires:logic.addDays(day,7)}, day).allowed, false);
      assert.equal(logic.accessDecision(null, day).allowed, false);
    });
    await t.test("Dos recepciones no sobrescriben fichas ni renovaciones recientes", async () => {
      runtime.setUser("owner-a");
      const original = (await get()).members[0];
      const payload = {action:"member",id:original.id,name:original.name,dni:original.dni,phone:original.phone,planId:original.plan_id,status:original.status,expires:original.expires,original};
      assert.equal((await post({...payload,phone:"11111111"})).status,200);
      assert.equal((await post({...payload,phone:"22222222"})).status,409);
      const changed = (await get()).members.find(m=>m.id===original.id);
      assert.equal(changed.phone,"11111111");
      const plan = (await get()).plans.find(p=>p.id===changed.plan_id);
      assert.equal((await post({action:"payment",venue:"calle30",memberId:changed.id,expectedPrice:plan.price,method:"Efectivo",requestKey:key()})).status,200);
      assert.equal((await post({...payload,original:changed,phone:"33333333"})).status,409);
      assert.notEqual((await get()).members.find(m=>m.id===changed.id).expires,changed.expires);
      assert.equal((await post({...payload,original:undefined})).status,409);
    });
    await t.test("Edición y auditoría se revierten juntas si falla el guardado", async () => {
      runtime.setUser("owner-a");
      const original = (await get()).members[0];
      const before = db.prepare("SELECT count(*) as n FROM audit").get().n;
      db.exec("CREATE TRIGGER test_member_failure BEFORE UPDATE ON members BEGIN SELECT RAISE(ABORT, 'test failure'); END");
      try {
        assert.equal((await post({action:"member",id:original.id,name:original.name,dni:original.dni,phone:"99999999",planId:original.plan_id,status:original.status,expires:original.expires,original})).status,503);
        assert.equal(db.prepare("SELECT count(*) as n FROM audit").get().n,before);
      } finally { db.exec("DROP TRIGGER test_member_failure"); }
    });
    await t.test("Ingreso registra sede sin exigir una cuenta del socio", async () => {
      runtime.setUser("owner-a");
      const m=(await get()).members[0];
      assert.equal((await post({action:"access",dni:m.dni,venue:"Calle 23"})).status,200);
      assert.equal(db.prepare("SELECT venue FROM accesses ORDER BY created_at DESC LIMIT 1").get().venue,"Calle 23");
    });
    await t.test("Fecha de Argentina y último día de vigencia", () => {
      assert.equal(
        logic.localDay(new Date("2026-09-24T01:00:00Z")),
        "2026-09-23",
      );
      assert.equal(
        logic.accessDecision(
          { status: "active", expires: "2026-09-24" },
          "2026-09-24",
        ).allowed,
        true,
      );
    });
  });
} finally {
  db.close();
  rmSync(folder, { recursive: true, force: true });
}

