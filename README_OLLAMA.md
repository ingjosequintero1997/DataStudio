# 🚀 DSK - Data Analysis Agent (100% GRATIS)

Sistema de análisis de datos inteligente con **Ollama (IA Local)** + **PostgreSQL**.

## Arquitectura

```
┌─────────────────┐         ┌──────────────────┐         ┌──────────────┐
│  React Frontend │ ──API──▶ │  Node.js Backend │ ──SQL──▶ │  PostgreSQL  │
│  (Chat, UI)     │         │  + Ollama (IA)   │         │  (Datos)     │
└─────────────────┘         └──────────────────┘         └──────────────┘
```

## Características

✅ **Consultas en Lenguaje Natural** - Habla con tus datos
✅ **Cruces Inteligentes** - El agente sugiere JOINs automáticamente
✅ **Dashboards Dinámicos** - Visualizaciones generadas por IA
✅ **100% GRATIS** - Sin tarjeta de crédito, sin pagos
✅ **Offline** - Funciona sin internet
✅ **Sin límites** - Consultas ilimitadas

## ¿Qué es Ollama?

Ollama permite ejecutar modelos de IA directamente en tu PC:
- **Llama 2** (recomendado): 7B parámetros, buena calidad
- **Mistral**: Más rápido, 7B parámetros
- **Neural Chat**: Especializado en conversación

Una vez descargado (~5GB), funciona **completamente offline**, sin internet.

## Setup (20 minutos)

### 1️⃣ Instala Ollama

**Windows:**
- Ve a: https://ollama.ai
- Descarga "Ollama for Windows"
- Instala normalmente

**Linux/Mac:**
```bash
curl https://ollama.ai/install.sh | sh
```

### 2️⃣ Descarga un modelo

```bash
# Abre terminal y ejecuta:
ollama pull llama2

# O si quieres algo más rápido:
ollama pull mistral
```

Esto descarga ~5GB. La primera vez tarda (luego usa caché).

**Verifica que funciona:**
```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama2",
  "prompt": "Hola"
}'
```

### 3️⃣ PostgreSQL

**Con Docker (recomendado):**
```bash
docker run --name dsk-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

**Sin Docker:**
- Descarga: https://www.postgresql.org/download
- Instala normalmente
- Crea base de datos `dsk_data`

### 4️⃣ Backend

```bash
cd backend
npm install

# Crear backend/.env:
OLLAMA_API=http://localhost:11434/api/generate
OLLAMA_MODEL=llama2
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dsk_data
DB_USER=postgres
DB_PASSWORD=postgres
PORT=5000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# Iniciar:
npm run dev
```

Debería ver:
```
✓ Base de datos inicializada
✓ Servidor escuchando en http://localhost:5000
✓ Ollama listo en http://localhost:11434
```

### 5️⃣ Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre: http://localhost:5173

### ✅ Test

En el chat escribe:
```
Hola, ¿qué tablas tenemos?
```

Si responde → ¡TODO FUNCIONA! 🎉

---

## Modelos Disponibles

| Modelo | Tamaño | Velocidad | Calidad | Comando |
|---|---|---|---|---|
| Llama 2 | 5GB | Media | 85% | `ollama pull llama2` |
| Mistral | 5GB | Rápido | 80% | `ollama pull mistral` |
| Neural Chat | 4GB | Muy rápido | 75% | `ollama pull neural-chat` |
| Orca | 3GB | Rápido | 85% | `ollama pull orca-mini` |

**Recomendación:** Llama 2 es el mejor balance.

---

## API Endpoints

### POST `/api/query`
```bash
curl -X POST http://localhost:5000/api/query \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Muestra el total de ventas", "userId": "user123"}'
```

### GET `/api/tables`
```bash
curl http://localhost:5000/api/tables
```

### POST `/api/cross`
```bash
curl -X POST http://localhost:5000/api/cross \
  -H "Content-Type: application/json" \
  -d '{"tableLeft": "users", "tableRight": "orders"}'
```

---

## Troubleshooting

### ❌ "Cannot connect to Ollama"
```bash
# Verifica que Ollama corre:
ps aux | grep ollama

# Si no ves nada, inicia Ollama:
ollama serve
```

### ❌ "Cannot connect to PostgreSQL"
```bash
# Verifica PG:
psql -U postgres -c "SELECT 1"

# Con Docker:
docker ps | grep postgres
```

### ❌ "Agente responde lentamente"
- Normal: Llama 2 tarda 5-10s
- Si quieres más rápido: usa `ollama pull mistral`
- O aumenta RAM asignada a Docker

### ❌ CORS error
- Verifica `FRONTEND_URL` en `.env` backend
- Debe ser exactamente `http://localhost:5173`

---

## Ejemplos de Consultas

```
1. Muestra los primeros 10 registros
2. ¿Cuál es el total de ventas por región?
3. Cruza clientes con órdenes
4. ¿Cuántos productos diferentes tenemos?
5. Tendencia de ventas del último trimestre
6. Top 5 mejores clientes por monto gastado
7. Crea un dashboard con las métricas principales
```

---

## Estructura del Proyecto

```
backend/
├── src/
│   ├── server.js           # Express server
│   ├── agent/
│   │   └── agent.js        # Llamadas a Ollama
│   ├── db/
│   │   ├── connection.js   # PostgreSQL
│   │   └── migrations.js   # Setup tablas
│   └── routes/
│       └── queries.js      # Endpoints
└── package.json

frontend/
├── src/
│   ├── components/
│   │   ├── ChatAgent.jsx   # Chat principal
│   │   └── LayoutAgent.jsx # Layout
│   ├── lib/
│   │   └── agentApi.js     # Cliente API
│   └── ...
└── package.json
```

---

## Costo

```
OLLAMA:       $0 (descarga local, sin límites)
PostgreSQL:   $0 (gratis localmente)
Node.js:      $0 (código abierto)
React:        $0 (código abierto)
─────────────────────────────────
TOTAL:        $0
```

¡100% GRATIS! 🎉

---

## Deploy

### Frontend → Vercel
```bash
cd frontend
vercel deploy --prod
```

### Backend → Railway/Render
1. En Railway.app o Render.com
2. Conecta tu repo
3. Agrega variables de entorno
4. Deploy automático

**Nota:** Necesitarás PostgreSQL externa (Railway incluye).
Ollama debe estar en tu máquina o servidor con GPU.

---

## ¿Preguntas?

Revisa los logs:
```bash
# Backend
npm run dev

# Frontend
npm run dev
```

¡El sistema está completamente funcional! 🚀
