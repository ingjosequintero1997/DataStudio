# ⚡ SETUP ULTRA RÁPIDO - OLLAMA (100% GRATIS)

## En 5 pasos

### 1️⃣ Descarga Ollama
https://ollama.ai → Descarga e instala

### 2️⃣ Descarga un modelo (elige uno)
```bash
# Opción A - Mejor calidad (recomendado)
ollama pull llama2

# Opción B - Más rápido
ollama pull mistral

# Opción C - Ultra rápido (menos calidad)
ollama pull neural-chat
```

Tarda 5-10 minutos la primera vez (descarga ~5GB).

### 3️⃣ PostgreSQL
```bash
# Con Docker (más fácil):
docker run --name dsk-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15

# Sin Docker: descarga desde https://www.postgresql.org/download
```

### 4️⃣ Backend
```bash
cd backend
npm install

# Crea backend/.env con esto:
OLLAMA_API=http://localhost:11434/api/generate
OLLAMA_MODEL=llama2
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dsk_data
DB_USER=postgres
DB_PASSWORD=postgres
PORT=5000
FRONTEND_URL=http://localhost:5173

npm run dev
```

### 5️⃣ Frontend
```bash
cd frontend
npm install
npm run dev
```

## ✅ Listo!

Abre: http://localhost:5173

Escribe en el chat: "¿Qué tablas tenemos?"

---

## Troubleshooting

| Problema | Solución |
|---|---|
| "Cannot reach Ollama" | Abre otra terminal y corre: `ollama serve` |
| "Cannot reach PostgreSQL" | Si usas Docker: `docker start dsk-postgres` |
| "CORS error" | Reinicia backend con: `npm run dev` |
| "Lento" | Normal (5-10s). Usa `mistral` si quieres más rápido |

---

## ¿Necesitas ayuda?

Abre terminal en el directorio del proyecto:

```bash
# Ver si Ollama corre:
curl http://localhost:11434/api/generate

# Ver si PG corre:
docker ps | grep postgres

# Ver logs backend:
cd backend && npm run dev

# Ver logs frontend:
cd frontend && npm run dev
```

---

**¡Eso es! Todo es completamente gratis** 💸
