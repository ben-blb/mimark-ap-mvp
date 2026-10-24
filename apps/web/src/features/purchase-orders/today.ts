/** Hoy en el equipo del usuario como 'AAAA-MM-DD' (valor inicial de fechas; la API valida con su reloj). */
export function localToday(): string {
  return new Date().toLocaleDateString('en-CA');
}
