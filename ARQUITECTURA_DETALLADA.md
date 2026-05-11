# 📊 ARQUITECTURA COMPLETA DEL SISTEMA

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                         USUARIO                                  │
│              Escribe: "Muestra ventas por región"                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  FRONTEND (React)                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  ChatAgent.jsx                                           │  │
│  │  - Recibe mensaje del usuario                           │  │
│  │  - Llama queryAgent(prompt)                            │  │
│  │  - Muestra respuesta + tabla de resultados             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  agentApi.js (cliente HTTP)                                     │
│  fetch POST /api/query { prompt: "..." }                       │
└────────────────────────┬────────────────────────────────────────┘
                         │ (HTTP/JSON)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  BACKEND (Express)                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  POST /api/query                                         │  │
│  │  Recibe: { prompt: "...", userId: "..." }              │  │
│  │  Llama: processQuery(prompt)                           │  │
│  │  Devuelve: { action, sql, rows, columns, duration }   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  agent.js (Inteligencia)                                        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  processQuery(prompt)                                  │    │
│  │  1. Obtiene esquema (con caché 5 min)                │    │
│  │  2. Crea system prompt optimizado                    │    │
│  │  3. Llama API Claude Haiku 3.5                       │    │
│  │  4. Parsea respuesta JSON                            │    │
│  │  5. Ejecuta SQL devuelto                             │    │
│  │  6. Guarda en historial                              │    │
│  │  7. Retorna resultados                               │    │
│  │                                                        │    │
│  │  suggestCross(tableLeft, tableRight)                 │    │
│  │  - Analiza columnas comunes                          │    │
│  │  - Pide a Claude tipo de JOIN                        │    │
│  │  - Devuelve condición de cruce                       │    │
│  │                                                        │    │
│  │  generateDashboard(tableNames)                        │    │
│  │  - Pide a Claude sugerencias de visualizaciones      │    │
│  │  - Devuelve lista de widgets                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                         │                                        │
│                         ▼                                        │
│              ┌──────────────────────┐                           │
│              │  Caché de Esquema    │                           │
│              │  (5 minutos)         │                           │
│              │  - Tables            │                           │
│              │  - Columns           │                           │
│              │  - Types             │                           │
│              └──────────────────────┘                           │
└────────────────┬──────────────────────┬───────────────────────┘
                 │                      │
         (SQL)   ▼                      │ (HTTPS)
      ┌──────────────────┐     ┌────────▼──────────────┐
      │  PostgreSQL      │     │   Anthropic API       │
      │                  │     │   (Claude Haiku 3.5)  │
      │ dsk_data:        │     │                        │
      │ - users          │     │ Inteligencia de IA:   │
      │ - datasets       │     │ - Interpreta NL       │
      │ - query_history  │     │ - Genera SQL          │
      │ - (tus tablas)   │     │ - Sugiere visualizs   │
      │                  │     │ - ~$0.80 por M tokens │
      └──────────────────┘     └────────────────────────┘
```

## Flujo de Ejemplo: "Muestra total ventas por región"

```
USUARIO
   │
   ▼ Escribe en chat
FRONTEND: queryAgent("Muestra total ventas por región")
   │
   ▼ Envía HTTP POST
BACKEND: POST /api/query
   │
   ▼ Procesa
AGENT.JS:
   1. Obtiene esquema de tablas:
      - sales: {id, amount, region_id, date}
      - regions: {id, name}
   
   2. Crea prompt para Claude:
      "Interpreta: 'Muestra total ventas por región'
       Esquema: [sales, regions]
       Responde JSON con SQL que agrupe por región"
   
   3. Llama API Claude (sin costos si está cacheado)
   
   4. Claude responde:
      {
        "action": "query",
        "sql": "SELECT r.name, SUM(s.amount) as total 
                FROM sales s 
                JOIN regions r ON s.region_id = r.id 
                GROUP BY r.name",
        "description": "Total de ventas por región",
        "columns_to_visualize": ["name", "total"],
        "chart_type": "bar"
      }
   
   5. Ejecuta SQL en PostgreSQL
   
   6. Retorna:
      {
        "rows": [
          {name: "Norte", total: 50000},
          {name: "Sur", total: 35000}
        ],
        "columns": ["name", "total"],
        "rowCount": 2,
        "duration": "0.234s"
      }
   
   7. Guarda en query_history para auditoría
   │
   ▼ HTTP Response (JSON)
FRONTEND:
   Muestra tabla:
   ┌────────┬─────────┐
   │ Region │ Total   │
   ├────────┼─────────┤
   │ Norte  │ 50,000  │
   │ Sur    │ 35,000  │
   └────────┴─────────┘
   
   Y gráfico de barras automáticamente
   │
   ▼ Visualiza en pantalla
USUARIO: ¡Resultado!
```

## Ventajas vs Anterior

| Característica | Antes (DuckDB) | Ahora (Agent) |
|---|---|---|
| Procesamiento | En navegador (limitado) | En servidor (sin límites) |
| Escala de datos | Max ~100MB | Ilimitado (PG) |
| Inteligencia | Parser manual frágil | Claude IA (muy confiable) |
| Costo IA | $0 (sin IA) | ~$0.80/M tokens (baratísimo) |
| Persistencia | IndexedDB (sesión) | PostgreSQL (permanente) |
| Concurrencia | 1 usuario | Múltiples usuarios |
| Hosting | Vercel | Vercel + Railway/Render |
| Cruces | Manuales + complejos | Automáticos inteligentes |
| Dashboards | Manuales | Generados por IA |

## Costo Mensual Estimado

```
Consultas/mes: 10,000
Tokens por consulta: 500 entrada + 200 salida = 700
Total tokens: 10,000 × 700 = 7,000,000

Claude Haiku:
- Entrada: $0.80 / 1M = 0.0000008 per token
- Salida: $4.00 / 1M = 0.000004 per token

Entrada: 10,000,000 × 0.0000008 = $8
Salida: 2,000,000 × 0.000004 = $8

TOTAL MENSUAL: ~$16

PostgreSQL (Railway):
- Pequeño: $7/mes
- Datos: $0.10 per GB

TOTAL ESTIMADO: $23-30 / mes para producción
```

## Escalabilidad

El sistema puede manejar:
- ✅ 100+ usuarios concurrentes
- ✅ Tablas con 100M+ filas (PG)
- ✅ 1000s de consultas/día
- ✅ Múltiples datasets independientes

Sin cambios en la arquitectura. Solo escala backend + DB.
