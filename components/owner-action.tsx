"use client";
import { LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";

export function OwnerAction({ role, onClick, children, className = "button outline", compact = false }: {
  role: string; onClick: () => void; children: ReactNode; className?: string; compact?: boolean;
}) {
  const locked = role !== "owner";
  return <button type="button" className={className + (locked ? " owner-only-action" : "")} disabled={locked}
    onClick={locked ? undefined : onClick} title={locked ? "Solo los dueños pueden realizar esta acción" : undefined}>
    {locked && <LockKeyhole size={14} aria-hidden="true" />}{children}
    {locked && <span className={compact ? "sr-only" : "owner-action-caption"}>Solo dueños</span>}
  </button>;
}
