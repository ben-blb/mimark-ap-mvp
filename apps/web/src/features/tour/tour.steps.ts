/** Pasos del recorrido (spec 012). `anchor` es el valor de `data-tour` del elemento que se resalta. */
export interface TourStep {
  title: string;
  body: string;
  anchor?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'Bienvenida a MIMARK',
    body: 'Aquí subes las facturas de tus proveedores, la IA lee sus datos, el sistema las compara con la orden de compra y tú confirmas y registras el pago. En un minuto te mostramos cómo.',
  },
  {
    anchor: 'tablero',
    title: 'Tablero',
    body: 'Tu punto de partida: lo que vence en 7, 15 y 30 días, y lo que está atrasado. Filtra por proveedor o estado para decidir qué pagar primero.',
  },
  {
    anchor: 'proveedores',
    title: 'Proveedores',
    body: 'Registra a cada proveedor con sus días de crédito. Con eso el sistema calcula la fecha de vencimiento de cada factura.',
  },
  {
    anchor: 'ordenes',
    title: 'Órdenes de compra',
    body: 'Crea la orden de compra y confirma la recepción de lo comprado. Las facturas se validan contra ella.',
  },
  {
    anchor: 'expedientes',
    title: 'Expedientes',
    body: 'Cada factura es un expediente: súbela, revisa lo que extrajo la IA y corrige lo necesario, confírmala, prográmala y registra el pago. El sistema nunca paga por ti: tú lo haces fuera y aquí solo lo registras.',
  },
  {
    anchor: 'asistente',
    title: 'Asistente',
    body: 'Pídele en lenguaje natural que consulte datos o prepare una acción, por ejemplo adjuntar una factura. Solo propone: nada se guarda hasta que tú lo confirmas.',
  },
  {
    anchor: 'ayuda',
    title: 'Cuando quieras repetirlo',
    body: 'Usa «Ver tutorial» para volver a ver este recorrido. En el teléfono está en el menú de tu cuenta, arriba a la derecha.',
  },
];
