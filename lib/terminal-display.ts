export type TerminalResult = {
  allowed: boolean;
  reason: string;
  warning?: string | null;
  daysRemaining?: number;
  name: string | null;
};

export function terminalDisplay(result: TerminalResult) {
  if (!result.allowed) return { tone: 'stop' as const, title: 'Pasá por recepción', detail: result.reason };
  if (result.warning || (result.daysRemaining !== undefined && result.daysRemaining <= 7)) {
    const days = result.daysRemaining;
    return {
      tone: 'warning' as const,
      title: 'Podés ingresar',
      detail: days === 0 ? 'Tu cuota vence hoy' : days !== undefined
        ? `Tu cuota vence en ${days} ${days === 1 ? 'día' : 'días'}`
        : 'Tu cuota está por vencer',
    };
  }
  return { tone: 'ready' as const, title: 'Podés ingresar', detail: 'Buen entrenamiento' };
}
