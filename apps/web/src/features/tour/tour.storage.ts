/**
 * Marca de «ya vio el tutorial» por persona, en el navegador (spec 012). Es el único uso de `localStorage`
 * del proyecto: si no está disponible (modo privado, bloqueado) el tutorial funciona y solo se repite.
 */
const key = (actor: string) => `mimark.tour.v1:${actor}`;

export function hasSeenTour(actor: string): boolean {
  try {
    return localStorage.getItem(key(actor)) === '1';
  } catch {
    return false;
  }
}

export function markTourSeen(actor: string): void {
  try {
    localStorage.setItem(key(actor), '1');
  } catch {
    // sin almacenamiento: el tutorial volverá a abrirse en la siguiente sesión
  }
}
