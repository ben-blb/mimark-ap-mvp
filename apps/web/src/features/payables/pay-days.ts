/**
 * Los próximos `count` miércoles y viernes desde `from` ('AAAA-MM-DD', inclusive). Es solo para llenar el
 * selector de "Programar pago" (así no se puede elegir un día inválido); la API valida de todos modos.
 */
export function nextPayDays(from: string, count = 12): string[] {
  const days: string[] = [];
  const day = new Date(`${from}T00:00:00Z`);
  while (days.length < count) {
    const weekday = day.getUTCDay();
    if (weekday === 3 || weekday === 5) days.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return days;
}
