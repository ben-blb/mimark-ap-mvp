---
name: spec-nueva
description: Redacta una spec nueva en estado borrador a partir de una petición de funcionalidad o cambio. Úsala antes de escribir código para cualquier comportamiento nuevo o distinto.
argument-hint: '[qué se quiere lograr]'
disable-model-invocation: true
---

# Redactar una spec nueva

Petición: $ARGUMENTS

No escribas código de producto en esta tarea: el resultado es un archivo en `specs/`.

## Pasos

1. Lee `specs/README.md`, `specs/_plantilla.md` y las specs relacionadas (`pnpm spec:check` lista todas).
   Si la petición cambia algo de una spec `hecha`, la spec nueva dice qué criterios modifica.
2. Revisa el código que la petición toca (módulos, contratos, pantallas) para que el diseño use lo que ya existe.
3. Si falta información que cambia el diseño (reglas de negocio, montos, quién hace qué), pregunta antes de
   escribir. Máximo 3 preguntas, concretas. Si el usuario no está, escribe tu mejor interpretación y márcala en
   "Fuera de alcance y decisiones".
4. Crea `specs/NNN-nombre.md` con el siguiente número libre, copiando la plantilla, con `estado: borrador`.
5. Escribe los criterios primero: cada uno observable (HTTP, UI o base de datos), con datos concretos y un solo
   comportamiento. Incluye los errores importantes. Marca `[manual]` lo que no se pueda automatizar y di cómo
   verificarlo.
6. Diseño mínimo: solo lo que cambia (datos, contratos, API, reglas con tabla de ejemplos, UI, auditoría),
   respetando `docs/ARCHITECTURE.md`. Pregúntate en cada pieza: ¿esto lo hace más difícil de leer, mantener o
   editar? Si sí, necesita un criterio que lo justifique.
7. Tareas pequeñas y ordenadas (contratos → datos → reglas con pruebas → service/controller → pruebas de
   integración → web → verificación). Cada una debe dejar `pnpm check:fast` en verde.
8. Corre `pnpm spec:check` y corrige lo que reporte.
9. Responde con un resumen de 5 líneas: qué entrega la spec, criterios clave y decisiones abiertas. Pide al humano
   que la revise y la cambie a `lista` cuando esté de acuerdo.
