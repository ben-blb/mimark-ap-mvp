---
id: 'NNN'
titulo: Nombre corto
estado: borrador # borrador | lista | en-progreso | hecha
depende_de: []
requisitos: RF-xx, CA-xx, PS-xx del SRS
---

# NNN · Nombre corto

## Objetivo

Una o dos frases: qué problema resuelve y para quién.

## Alcance

**Incluye:** …

**No incluye:** … (lo que alguien podría suponer y no está).

## Criterios de aceptación

- **AC-NNN-01** · Dado …, cuando …, entonces …
- **AC-NNN-02** [manual] · … Cómo verificarlo: …

## Diseño

Solo lo que cambia. Sigue `docs/ARCHITECTURE.md` y copia la forma de `modules/suppliers` y `features/suppliers`.

### Datos

Cambios en `apps/api/prisma/schema.prisma` y nombre de la migración.

### Contratos

Esquemas nuevos o cambiados en `packages/contracts/src/<archivo>.ts`, y códigos de error nuevos.

### API

| Método y ruta | Entrada | Salida | Errores |
| ------------- | ------- | ------ | ------- |

### Reglas

Funciones puras en `<módulo>.rules.ts`, con tablas de ejemplos.

### UI

Pantallas, qué muestran y qué acciones ofrecen.

### Auditoría

Acciones que se registran en `audit_events` (`entidad.verbo-en-pasado`).

## Tareas

Pequeñas y en orden. Cada una deja `pnpm check:fast` en verde. Pruebas primero.

- [ ] 1. …

## Fuera de alcance y decisiones

## Bitácora

<!-- El agente anota aquí decisiones y hallazgos: AAAA-MM-DD · nota -->
