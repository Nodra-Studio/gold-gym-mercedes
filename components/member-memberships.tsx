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
  const existing = (data.memberships ?? []).filter(
      (m) => m.member_id === member.id,
    ),
    available = data.plans.filter(
      (p) =>
        p.id !== member.plan_id && !existing.some((m) => m.plan_id === p.id),
    );
  const [selected, setSelected] = useState(""),
    [planId, setPlan] = useState(available[0]?.id ?? ""),
    [expires, setExpires] = useState(data.today),
    [status, setStatus] = useState("active");
  const current = existing.find((m) => m.id === selected);
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
        <label className="field full">
          Membresía
          <select
            value={selected}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value,
                m = existing.find((m) => m.id === v);
              setSelected(v);
              setExpires(m?.expires ?? data.today);
              setStatus(m?.status ?? "active");
            }}
          >
            <option value="">Agregar otro plan</option>
            {existing.map((m) => (
              <option key={m.id} value={m.id}>
                {m.plan_name} · {dateLabel(m.expires)}
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
