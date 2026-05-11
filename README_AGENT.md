# 🚀 DSK - Data Analysis Agent

Sistema de análisis de datos inteligente con **IA Claude Haiku 3.5** + **PostgreSQL**.

## Arquitectura

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  React Frontend │ ──API──▶ │  Node.js Backend │ ──SQL──▶ │  PostgreSQL  │
│  (Chat, UI)     │         │  + Claude Haiku  │         │  (Datos)     │
└─────────────────┘         └──────────────────┘         └──────────────┘
```

## Características

✅ **Consultas en Lenguaje Natural** - Habla con tus datos como si fuera una persona
✅ **Cruces Inteligentes** - El agente sugiere JOINs automáticamente
✅ **Dashboards Dinámicos** - Visualizaciones generadas por IA
✅ **Económico** - Claude Haiku cuesta ~$0.80 por millón de tokens
✅ **Sin límites de datos** - Almacena en PostgreSQL (no en navegador)

## Setup

### 1️⃣ Backend

```bash
cd backend
npm install
```

Crea `.env`:
```env
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxx
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dsk_data
DB_USER=postgres
DB_PASSWORD=postgres
PORT=5000
FRONTEND_URL=http://localhost:5173
```

**Obtén tu API Key:**
1. Ve a https://console.anthropic.com
2. Crea una cuenta o inicia sesión
3. Genera una API key
4. Copia en `.env`

### 2️⃣ PostgreSQL

**Windows con Docker:**
```bash
docker run --name dsk-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

**Sin Docker:**
- Descarga PostgreSQL desde https://www.postgresql.org/download/
- Crea base de datos `dsk_data`

### 3️⃣ Inicia el Backend

```bash
npm run dev
```

✓ El servidor estará en `http://localhost:5000`

### 4️⃣ Frontend

```bash
cd frontend
npm install
npm run dev
```

✓ La app estará en `http://localhost:5173`

---

## Uso

### Chat Principal

Escribe consultas naturales:
- "Muestra todas las ventas de enero"
- "¿Cuál es el producto más vendido?"
- "Consolida clientes con sus órdenes"

### Cruces

Usa el botón **⋈ Cruzar** o escribe:
- "Cruza tabla_a con tabla_b"

### Dashboards

Usa el botón **📊 Dashboard** para visualizaciones automáticas.

---

## API Endpoints

### POST `/api/query`
Procesa consulta en lenguaje natural.

```bash
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Muestra el total de ventas", "userId": "user123"}'
```

**Respuesta:**
```json
{
  "action": "query",
  "sql": "SELECT SUM(amount) FROM sales",
  "rows": [...],
  "rowCount": 1,
  "duration": "0.234"
}
```

### GET `/api/tables`
Lista todas las tablas disponibles.

```bash
curl http://localhost:5000/api/tables
```

### POST `/api/cross`
Ejecuta un cruce entre dos tablas.

```bash
curl -X POST http://localhost:5000/api/cross \
  -H "Content-Type: application/json" \
  -d '{"tableLeft": "users", "tableRight": "orders"}'
```

### POST `/api/dashboard`
Genera widgets de dashboard.

```bash
curl -X POST http://localhost:5000/api/dashboard \
  -H "Content-Type: application/json" \
  -d '{"tableNames": ["sales", "customers"]}'
```

---

## Optimización de Tokens

El sistema incluye:

✓ **Caché de Esquema** (5 min) - No pregunta por estructura repetida
✓ **Prompts Optimizados** - Contexto mínimo, máxima eficiencia
✓ **Respuestas JSON** - Parsing automático, sin tokens extra
✓ **Límite de Resultados** - LIMIT 1000 en queries (ahorra tokens)

**Costo estimado:**
- 1000 queries = ~$0.50
- Capaz de hacer 2M+ queries con $1

---

## Estructura del Proyecto

```
backend/
├── src/
│   ├── server.js           # Servidor Express
│   ├── agent/
│   │   └── agent.js        # Lógica del agente Claude
│   ├── db/
│   │   ├── connection.js   # Conexión PostgreSQL
│   │   └── migrations.js   # Setup de tablas
│   └── routes/
│       └── queries.js      # Endpoints API
└── package.json

frontend/
├── src/
│   ├── components/
│   │   ├── ChatAgent.jsx   # Chat principal con agente
│   │   └── LayoutAgent.jsx # Layout nuevo
│   ├── lib/
│   │   └── agentApi.js     # Cliente para consumir API
│   └── ...
└── package.json
```

---

## Troubleshooting

### ❌ Error: "CLAUDE_API_KEY not set"
```bash
# Verifica que esté en .env
echo $CLAUDE_API_KEY
```

### ❌ Error: "Cannot connect to PostgreSQL"
```bash
# Verifica que PostgreSQL esté corriendo
# Windows: busca "PostgreSQL" en servicios
# Linux: sudo systemctl status postgresql
```

### ❌ "Agente no responde"
- Verifica API key válida
- Comprueba conexión a internet
- Revisa logs del backend: `npm run dev`

### ❌ CORS error desde frontend
- Verifica `FRONTEND_URL` en `.env` backend
- Debe ser exactamente la URL del frontend

---

## Deploy

### Frontend → Vercel

```bash
cd frontend
vercel deploy --prod
```

### Backend → Railway/Render

1. Crea cuenta en https://railway.app
2. Conecta tu repo GitHub
3. Agrega variables de entorno (`CLAUDE_API_KEY`, etc.)
4. Deploy automático

---

## ¿Preguntas?

Revisa los logs:
```bash
# Backend
npm run dev

# Frontend
npm run dev
```

¡El sistema está listo! 🎉
