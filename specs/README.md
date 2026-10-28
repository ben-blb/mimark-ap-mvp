# Specs · desarrollo guiado por especificaciones

**La spec manda.** Todo comportamiento nuevo o distinto empieza aquí, no en el código. El código y las
pruebas implementan lo que la spec dice; si algo no cuadra, se corrige primero la spec.

## Ciclo de una spec

```
borrador ──(humano aprueba)──> lista ──(agente empieza)──> en-progreso ──(spec:check verde)──> hecha
```

| Estado        | Lo mueve        | Significa                                                                |
| ------------- | --------------- | ------------------------------------------------------------------------ |
| `borrador`    | agente o humano | En redacción. Puede cambiar todo.                                        |
| `lista`       | humano          | Revisada y aprobada: se implementa tal cual.                             |
| `en-progreso` | agente          | Se está implementando, tarea por tarea.                                  |
| `hecha`       | agente          | Tareas marcadas y cada criterio con prueba (`pnpm spec:check` lo exige). |

## Comandos (Claude Code)

| Comando                  | Qué hace                                                                      |
| ------------------------ | ----------------------------------------------------------------------------- |
| `/spec-nueva <qué>`      | Redacta una spec en `borrador` a partir de una petición. No escribe código.   |
| `/spec-implementar <id>` | Implementa una spec `lista`: tarea por tarea, prueba primero, check en verde. |
| `/spec-revisar <id>`     | Revisión independiente (subagente) de la implementación contra la spec.       |
| `pnpm spec:check`        | Tablero de estado y trazabilidad criterio ↔ prueba.                           |

Sin Claude Code se siguen los mismos pasos a mano: están escritos en `.claude/skills/*/SKILL.md`.

## Reglas

1. **Un archivo por spec:** `specs/NNN-nombre.md`, número consecutivo que nunca se reutiliza. Copia `_plantilla.md`.
2. **Criterios con ID:** `- **AC-NNN-NN** · Dado…, cuando…, entonces…`. Cada uno se puede verificar desde fuera
   (HTTP, UI o base de datos), con datos concretos cuando hay cálculos.
3. **Las pruebas citan su criterio en el nombre:** `it('AC-004-03 …')`. Para una spec `hecha`, cada criterio
   necesita al menos una prueba que lo cite.
4. **`[manual]`** marca un criterio que no se automatiza; la spec dice cómo verificarlo a mano.
5. **Si la spec está mal o incompleta, se detiene la implementación y se corrige la spec** (o se pregunta).
   Nunca se implementa algo distinto a lo escrito.
6. **Una spec `hecha` no se reescribe.** Un cambio posterior es una spec nueva que dice qué modifica
   ("modifica AC-002-04").
7. **Bitácora:** las decisiones y hallazgos de la implementación se anotan al final de la spec, con fecha.

## Mapa del MVP

| Spec                                                    | Entrega                                                    | SRS                                  |
| ------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| [001 Acceso](001-acceso.md)                             | Código de acceso, sesión, errores, auditoría, health       | Acceso, RF-22, RF-23                 |
| [002 Proveedores](002-proveedores.md)                   | Proveedores con días de crédito (módulo plantilla)         | RF-01                                |
| [003 Órdenes de compra](003-ordenes-de-compra.md)       | OC y confirmación de recepción                             | RF-02, RF-03                         |
| [004 Procesamiento](004-procesamiento-de-documentos.md) | Carga, extracción con IA y validación determinista         | RF-04…12, CA-01…05, PS-01…03, PS-06  |
| [005 Revisión y pago](005-revision-y-pago.md)           | Corrección, confirmación, vencimiento, programación y pago | RF-13…19, CA-04, CA-06, PS-04, PS-05 |
| [006 Cartera](006-cartera.md)                           | Tablero 7/15/30 días y filtros                             | RF-17, RF-20, RF-21                  |
| [007 Evidencia de entrega](007-evidencia-de-entrega.md) | Probador, evaluación de IA y documentos del curso          | Entregables                          |
| [008 Asistente](008-asistente.md)                       | Operación en lenguaje natural: consulta y propone          | Extensión (PS-03, regla 6)           |
| [009 Interfaz](009-interfaz.md)                         | Tema claro/oscuro, gráficas y responsive                   | Usabilidad (extensión)               |

El orden es el de implementación: cada spec depende de las anteriores (`depende_de`).
