# DataStudio AI OS

Plataforma AI-native local-first para analitica avanzada. Procesa CSV/Excel con DuckDB-Wasm y usa una capa de orquestacion IA para consultas, reparacion SQL e insights.

## Stack

- **React 18** + **Tailwind CSS** — UI/UX
- **DuckDB-Wasm** — Motor SQL cliente
- **Monaco Editor** — Editor de código con resaltado SQL
- **PapaParse** — Lectura de CSV en chunks
- **IndexedDB** (`idb`) — Persistencia local de tablas
- **Firebase Auth** — Autenticación email/password
- **Zustand** — Estado global modular
- **AI Orchestrator Client** — Routing de tareas IA (orchestrator-first)

## Configuración inicial

### 1. Instalar dependencias

```bash
cd frontend
npm install
```

### 2. Configurar Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Activa **Authentication > Email/Password**
3. Copia `.env.example` a `.env`:

```bash
cp .env.example .env
```

4. Rellena las variables con los valores de tu proyecto Firebase.

5. Configura runtime IA en `.env`:

```bash
VITE_AI_ORCHESTRATOR_URL=http://localhost:8787
VITE_AI_ORCHESTRATOR_TOKEN=
VITE_GROQ_API_KEY=
```

- `VITE_AI_ORCHESTRATOR_URL`: endpoint del backend de orquestacion (recomendado).
- `VITE_GROQ_API_KEY`: fallback temporal si el orchestrator aun no esta desplegado.

### 3. Ejecutar en desarrollo

```bash
npm run dev
```

> **Nota:** DuckDB-Wasm requiere los headers HTTP `COOP` y `COEP` para usar `SharedArrayBuffer`.
> El servidor de Vite los agrega automáticamente en desarrollo.

### 4. Build de producción

```bash
npm run build
```

## Despliegue

### Netlify
Importa el repositorio. El archivo `netlify.toml` ya configura los headers requeridos.

### Vercel
Importa el repositorio. El archivo `vercel.json` ya configura los headers requeridos.
Directorio de salida: `dist`.

## Uso

1. **Login** — Inicia sesión con tu cuenta Firebase.
2. **Cargar CSV** — Clic en "Cargar CSV" o usa el botón `+` en el Object Explorer.
3. **Escribir SQL** — El editor soporta autocompletado de tablas/columnas.
4. **Ejecutar** — `F5` o `Ctrl+Enter` o el botón "Ejecutar".
5. **Exportar** — El botón "Exportar CSV" descarga el resultado actual.

## Arquitectura IA (base)

- Entrada unica desde frontend: `src/services/ai/aiOrchestratorClient.js`
- Modo preferido: Orchestrator API (`POST /v1/ai/run`)
- Fallback temporal: Groq directo
- Store global enterprise: `src/state/useDataStudioStore.js`
- Tokens de diseno: `src/config/designSystem.js`

Roadmap detallado: `docs/AI_OS_FOUNDATION.md`

## Funcionalidades SQL soportadas

```sql
-- SELECT, JOIN, UNION, GROUP BY, ORDER BY, HAVING
SELECT a.id, b.nombre, COUNT(*) as total
FROM tabla_a a
INNER JOIN tabla_b b ON a.id = b.id
WHERE a.activo = true
GROUP BY a.id, b.nombre
ORDER BY total DESC
LIMIT 500;

-- Funciones de ventana
SELECT nombre, salario,
       RANK() OVER (PARTITION BY depto ORDER BY salario DESC) as ranking
FROM empleados;
```
