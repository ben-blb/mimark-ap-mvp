# Referencia de la prueba de concepto (n8n)

Material histórico de la PoC que dio origen al MVP. **No forma parte del sistema** ni se ejecuta, y el MVP no
depende de él.

| Archivo                    | Qué es                                                  |
| -------------------------- | ------------------------------------------------------- |
| `N8-B-MIMARK.json`         | Workflow de n8n de la PoC (Extraer → Validar → Derivar) |
| `registro_pruebas_poc.csv` | Registro de las pruebas de la PoC con su veredicto      |

Revisión de contenido sensible: el CSV no trae datos personales (el único identificador es el UUID de ejemplo
`550e8400-…`). El JSON no contiene llaves ni tokens; solo una referencia a la credencial de n8n (`id` y nombre
«OpenRouter account»), que no sirve sin la instancia de n8n. En este repositorio solo se guardan datos sintéticos.
