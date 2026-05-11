# INSTRUCCIONES RÁPIDAS DE SETUP

## 🔴 PASO 1: Obtén API Key de Anthropic (CRÍTICO)

1. Ve a: https://console.anthropic.com/keys
2. Crea una cuenta o inicia sesión con Google/Email
3. Haz clic en "Create Key"
4. Copia la key (comienza con "sk-ant-")
5. Pega en `backend/.env` → CLAUDE_API_KEY=sk-ant-xxx

⚠️ SIN ESTA KEY, EL SISTEMA NO FUNCIONA

---

## 🟡 PASO 2: Instala PostgreSQL

### Windows (Recomendado: Docker)
```bash
# Si tienes Docker instalado:
docker run --name dsk-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15

# Verifica que corre:
docker ps
```

### Windows (Sin Docker)
- Descarga: https://www.postgresql.org/download/windows/
- Instala con contraseña `postgres`
- Crea base de datos: psql > CREATE DATABASE dsk_data;

---

## 🟢 PASO 3: Setup Backend

```bash
cd backend
npm install
```

Crea `backend/.env`:
```
CLAUDE_API_KEY=sk-ant-YOUR-KEY-HERE
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dsk_data
DB_USER=postgres
DB_PASSWORD=postgres
PORT=5000
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
```

Inicia:
```bash
npm run dev
```

Debería ver:
```
✓ Base de datos inicializada
✓ Servidor escuchando en http://localhost:5000
✓ Modelo IA: claude-3-5-haiku-20241022
```

---

## 🔵 PASO 4: Setup Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre: http://localhost:5173

---

## ✅ TEST

En el chat, escribe:
```
Hola, ¿cuáles son las tablas disponibles?
```

Si responde, ¡TODO FUNCIONA! 🎉

---

## 💰 Costos de IA

- Claude Haiku 3.5: ~$0.80 por millón de tokens
- 1 consulta promedio: 0.0005 tokens
- **Puedes hacer 2,000,000 consultas con $1**

¡Prácticamente gratis! 💸

---

## 🚀 Próximos Pasos

1. Sube tus CSV/Excel en el chat
2. Haz consultas en lenguaje natural
3. El agente genera SQL automáticamente
4. Visualiza resultados con dashboards

¡Listo para usar!
