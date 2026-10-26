# Evaluación de exactitud de la IA

- URL: https://mimark-ap-mvp.vercel.app
- Fecha: 2026-10-26T03:26:46.932Z
- Modelo: claude-haiku-5-5
- Prompt: extract-invoice@1
- Documentos: 30

## Exactitud por campo

| Campo         | Aciertos | Esperados | Exactitud |
| ------------- | -------- | --------- | --------- |
| supplierName  | 27       | 27        | 100.0 %   |
| supplierTaxId | 27       | 27        | 100.0 %   |
| invoiceNumber | 27       | 27        | 100.0 %   |
| issueDate     | 27       | 27        | 100.0 %   |
| poNumber      | 23       | 23        | 100.0 %   |
| subtotal      | 27       | 27        | 100.0 %   |
| taxes         | 27       | 27        | 100.0 %   |
| total         | 27       | 27        | 100.0 %   |
| currency      | 27       | 27        | 100.0 %   |
| taxUuid       | 25       | 25        | 100.0 %   |

Exactitud global: 100.0 %

## Valores inventados

Valores inventados: 0

## Documentos fuera de alcance

Fuera de alcance detectados: 3 de 3

## Meta de calidad

≥ 95 % de exactitud por campo, 0 valores inventados y 100 % de documentos fuera de alcance detectados.

**Resultado: cumple la meta.**
