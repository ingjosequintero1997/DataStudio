# CSV SQL Studio — Backend

Este proyecto es **100% client-side**. No se requiere backend.

Todo el procesamiento SQL ocurre en el navegador del usuario usando **DuckDB-Wasm**.
Los archivos CSV se almacenan localmente en **IndexedDB** del navegador.
La autenticación usa **Firebase Authentication** (servicio externo).

## ¿Por qué no hay backend?

- Sin costos de servidor
- Apto para despliegue estático (Vercel / Netlify)
- Los archivos CSV nunca salen del dispositivo del usuario
- El motor SQL DuckDB-Wasm procesa hasta 500,000+ filas directamente en el navegador

## Despliegue del frontend

Ver `../frontend/README.md`.
