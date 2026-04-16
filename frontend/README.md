# CSV SQL Studio

Motor SQL en el navegador estilo SSMS. Procesa archivos CSV pesados (500k+ filas) con DuckDB-Wasm, sin servidor.

## Stack

- **React 18** + **Tailwind CSS** — UI/UX
- **DuckDB-Wasm** — Motor SQL cliente
- **Monaco Editor** — Editor de código con resaltado SQL
- **PapaParse** — Lectura de CSV en chunks
- **IndexedDB** (`idb`) — Persistencia local de tablas
- **Firebase Auth** — Autenticación email/password

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
