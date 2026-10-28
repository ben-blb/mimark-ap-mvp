---
id: '012'
titulo: Tutorial de bienvenida
estado: en-progreso # borrador | lista | en-progreso | hecha
depende_de: ['009', '010', '011']
requisitos: Usabilidad (extensión)
---

# 012 · Tutorial de bienvenida

## Objetivo

Que una persona nueva entienda cómo se usa la plataforma con un recorrido corto sobre la pantalla real, que se abre
solo la primera vez que entra y que puede repetir cuando quiera.

## Alcance

**Incluye:** recorrido guiado con globos que resaltan la navegación y explican el flujo (proveedores → órdenes →
factura → revisión y pago → asistente); apertura automática la primera vez por persona; botón "Ver tutorial" para repetirlo
en escritorio y móvil; marca de "ya visto" en `localStorage`.

**No incluye:** cambios de API, base de datos o contratos; marca de "visto" en el servidor (no sigue a la persona entre
navegadores); tutoriales distintos por rol; videos o ilustraciones; dependencias nuevas.

## Criterios de aceptación

- **AC-012-01** · Dado que la persona inicia sesión y no tiene marca de tutorial visto, cuando carga la aplicación,
  entonces el recorrido se abre solo en el primer paso.
- **AC-012-02** · Dado que termina o salta el recorrido, cuando recarga o vuelve a entrar, entonces el recorrido no se
  abre solo.
- **AC-012-03** · Dado que una persona ya vio el tutorial en ese navegador, cuando entra otra persona (otro nombre de
  usuario), entonces a esa otra el recorrido sí se le abre solo.
- **AC-012-04** · Dado que ya vio el tutorial, cuando pulsa "Ver tutorial" (barra lateral en escritorio, menú de cuenta
  en móvil), entonces el recorrido se abre desde el primer paso.
- **AC-012-05** · Dado el recorrido abierto, cuando usa Siguiente, Atrás, Saltar o Esc, entonces avanza, retrocede o lo
  cierra; muestra "Paso n de N"; es un diálogo accesible (`role="dialog"` con título) que mueve el foco al abrir y lo
  devuelve al cerrar; en el último paso Siguiente se llama "Terminar".
- **AC-012-06** · Dado un paso con elemento asociado, cuando se muestra, entonces ese elemento de la navegación real
  (barra lateral o barra inferior en móvil) queda resaltado; si el elemento no está en pantalla, el paso se muestra
  centrado sin error.
- **AC-012-07** · Dado el recorrido completo, cuando se recorren todos los pasos, entonces explica en orden: bienvenida,
  Tablero, Proveedores, Órdenes de compra, Expedientes (subir factura, revisar y registrar el pago; el sistema nunca
  paga), Asistente y cómo repetir el tutorial.
- **AC-012-08** [manual] · El recorrido se ve bien en tema claro y oscuro y en móvil, y sin animación con
  `prefers-reduced-motion`. Cómo verificarlo: `pnpm dev`, abrir con un nombre nuevo, cambiar el tema del sistema,
  estrechar la ventana a 375 px y activar "reducir movimiento".
- **AC-012-09** · Dado que `localStorage` no está disponible (modo privado o bloqueado), cuando se abre y se cierra el
  recorrido, entonces funciona sin lanzar error (volverá a abrirse en la siguiente sesión).

## Diseño

### Datos / Contratos / API

Sin cambios. La marca vive en el navegador: clave `mimark.tour.v1:<actor>` con valor `1` (el `actor` es el nombre de
usuario de la sesión). Es el primer uso de `localStorage` en el repo; se acota a este archivo y se documenta en
`apps/web/AGENTS.md`.

### Reglas

No hay lógica de negocio: la lista de pasos es contenido estático.

### UI

Nueva carpeta `apps/web/src/features/tour/`:

- `tour.steps.ts`: pasos `{ id, title, body, anchor? }` en español; `anchor` es el id de un elemento de navegación.
- `tour.storage.ts`: `hasSeenTour(actor)` y `markTourSeen(actor)`, ambos dentro de `try/catch`.
- `Tour.tsx`: `Dialog` de MUI (foco, Esc, `aria-labelledby`) sin fondo oscuro que tape el resaltado, ubicado cerca del
  elemento, más un contorno sobre el elemento con `data-tour`. Estilos solo con tema y `sx`.
- `AppShell.tsx`: los ítems de `NAV_ITEMS` llevan `data-tour="nav-<ruta>"`; botón "Ver tutorial" (icono de ayuda)
  junto a "Salir" en la barra lateral y `MenuItem` "Ver tutorial" en el menú de cuenta móvil; monta `<Tour />` y
  lo abre solo si `hasSeenTour(actor)` es falso.

### Auditoría

No aplica (no escribe en la base de datos).

## Tareas

- [x] 1. Pruebas y `tour.storage.ts` (AC-012-02, 03, 09).
- [ ] 2. `tour.steps.ts` y `Tour.tsx` con pruebas (AC-012-05, 06, 07).
- [ ] 3. Integrar en `AppShell` (anclas, botón y menú "Ver tutorial", apertura automática) con pruebas (AC-012-01, 04).
- [ ] 4. Documentar la convención `data-tour` y el uso de `localStorage` en `apps/web/AGENTS.md`.
- [ ] 5. Verificación manual (AC-012-08) y `pnpm check` en verde.

## Fuera de alcance y decisiones

- `localStorage` en vez de servidor: no requiere migración ni endpoint; a cambio, otro navegador lo vuelve a mostrar.
- Sin librería de tours: unos 6 pasos no justifican una dependencia; el diálogo de MUI ya da foco y teclado.

## Bitácora

<!-- AAAA-MM-DD · nota -->
