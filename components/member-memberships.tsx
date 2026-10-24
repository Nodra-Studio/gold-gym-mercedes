"use client";
import { useState } from "react";
import { type ClubData, type Member, dateLabel, money } from "@/lib/club";
export default function MemberMemberships({
  member,
  data,
  busy,
  submit,
}: {
  member: Member;
  data: ClubData;
  busy: boolean;
  submit: (p: Record<string, unknown>) => void;
}) {
  const canCombined = data.role === "owner" || data.activity_scope === "all" && data.branch_scope === "all";
  const existing = (data.memberships ?? []).filter(
      (m) => m.member_id === member.id,
    ),
    available = data.plans.filter(
      (p) =>
        (canCombined || p.access_scope !== "all") && p.id !== member.plan_id && !existing.some((m) => m.plan_id === p.id),
    );
  const [selected, setSelected] = useState<(typeof existing)[number] | null>(null),
    [planId, setPlan] = useState(available[0]?.id ?? ""),
    [expires, setExpires] = useState(data.today),
    [status, setStatus] = useState("active"),
    [reason,setReason]=useState("");
  // Background refreshes must not replace the version this form is editing.
  const current = selected;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit({
          action: "membership",
          memberId: member.id,
          planId: current?.plan_id ?? planId,
          expires,
          status,
          ...(current
            ? {
                id: current.id,
                reason,
                expectedExpires: current.expires,
                expectedStatus: current.status,
              }
            : {}),
        });
      }}
    >
      <p>
        <strong>{member.name}</strong> · Plan principal: {member.plan_name},
        hasta {dateLabel(member.expires)}.
      </p>
      <p className="muted">
        Cada membresía tiene su vencimiento. Agregar o editar una membresía no
        registra un cobro. Usá “Registrar cobro” para cobrar y renovar el plan
        elegido.
      </p>
      <div className="form-grid">
        {current&&<label className="field full">Motivo del cambio<textarea required minLength={3} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
        <label className="field full">
          Membresía
          <select
            value={selected?.id ?? ""}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value,
                m = existing.find((m) => m.id === v);
              setSelected(m ? { ...m } : null);
              setReason("");
              setExpires(m?.expires ?? data.today);
              setStatus(m?.status ?? "active");
            }}
          >
            <option value="">Agregar otro plan</option>
            {existing.map((m) => (
              <option key={m.id} value={m.id} disabled={!canCombined&&m.access_scope==="all"}>
                {m.plan_name} · {dateLabel(m.expires)}{!canCombined&&m.access_scope==="all"?" · Acceso general":""}
              </option>
            ))}
          </select>
        </label>
        {!current && (
          <label className="field full">
            Plan
            <select
              required
              value={planId}
              disabled={busy}
              onChange={(e) => setPlan(e.target.value)}
            >
              <option value="">Elegí un plan</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {money(p.price)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="field">
          Vigente hasta
          <input
            type="date"
            required
            value={expires}
            disabled={busy}
            onChange={(e) => setExpires(e.target.value)}
          />
        </label>
        <label className="field">
          Estado de esta membresía
          <select
            value={status}
            disabled={busy}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="active">Activa</option>
            <option value="paused">Pausada</option>
          </select>
        </label>
      </div>
      {member.status === "paused" && (
        <p className="notice">
          El socio está pausado. Sus accesos seguirán bloqueados hasta
          reactivarlo desde su ficha.
        </p>
      )}
      <div className="form-actions">
        <button
          className="button gold"
          disabled={busy || (!current && !planId)}
        >
          {busy ? "Guardando…" : "Guardar membresía"}
        </button>
      </div>
    </form>
  );
}
