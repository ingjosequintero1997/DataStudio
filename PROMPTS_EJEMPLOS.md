# 💡 EJEMPLOS DE PROMPTS PARA EL AGENTE

Copia estos ejemplos al chat y prueba con tus datos.

## Consultas Básicas

### 1. Listar datos simples
```
Muestra los primeros 10 registros de clientes
```

### 2. Filtros
```
Muestra todas las ventas mayores a 1000 en 2024
```

### 3. Agregaciones
```
¿Cuál es el total de ventas por región?
```

### 4. Ranking
```
¿Cuál es el producto más vendido?
```

### 5. Fechas
```
Muestra el promedio de ventas por mes en el último año
```

---

## Cruces (JOINs)

### 6. Cruce simple
```
Cruza clientes con órdenes
```

### 7. Cruce específico
```
Une la tabla usuarios con la tabla pedidos por el ID
```

### 8. Cruce triple
```
Consolida clientes, órdenes y productos
```

### 9. Cruce con filtro
```
Muestra clientes que compraron en los últimos 30 días
```

---

## Análisis Avanzado

### 10. Cohort analysis
```
¿Cuántos clientes se registraron cada mes? Muéstrame la tendencia
```

### 11. Top N
```
Top 5 mejores clientes por monto gastado
```

### 12. Distribuciones
```
¿Cómo se distribuyen las compras por rango de precio?
```

### 13. Comparativas
```
Compara ventas de este mes vs mes anterior
```

### 14. Tendencias
```
¿Cuál es la tendencia de crecimiento trimestral?
```

---

## Consultas Complejas

### 15. Con múltiples condiciones
```
Muestra clientes activos (con compras en 90 días) que gastaron más de $500
```

### 16. Combinación de datos
```
¿Cuál es el promedio de compra por región y categoría?
```

### 17. Con cálculos
```
Calcula el margen bruto por producto
```

### 18. Segmentación
```
Segmenta clientes en: VIP (>$10k), Regular (1k-10k), Nuevo (<1k)
```

---

## Dashboards

### 19. Pide dashboard
```
Crea un dashboard con las métricas principales del negocio
```

### 20. Dashboard específico
```
Genera visualizaciones de: total de ventas, clientes activos, productos top 5
```

---

## Útiles para Testing

### 21. Contar registros
```
¿Cuántos registros hay en total?
```

### 22. Ver estructura
```
Muéstrame las columnas de la tabla usuarios
```

### 23. Primeros registros
```
Muestra 5 registros de ejemplo
```

### 24. Valores únicos
```
¿Cuántas regiones diferentes hay?
```

---

## Si Algo No Funciona

```
Ayuda, no entiendo tu última respuesta
```

El agente intentará aclarar o sugerir una consulta alternativa.

---

## Tips Importantes

✅ **SÉ ESPECÍFICO**
```
❌ "Muestra datos"
✅ "Muestra ventas totales por región en Q1 2024"
```

✅ **USA NOMBRES DE COLUMNAS**
```
❌ "¿Cuál es el más grande?"
✅ "¿Cuál es el producto con mayor cantidad_vendida?"
```

✅ **CONTEXTO TEMPORAL**
```
❌ "Tendencia de ventas"
✅ "Tendencia de ventas de los últimos 12 meses"
```

✅ **ESPECIFICA EL FORMATO**
```
❌ "Agrupa por región"
✅ "Agrupa por región y muestra el total de ventas y la cantidad de transacciones"
```

---

## Errores Comunes

| Error | Causa | Solución |
|---|---|---|
| "No tengo datos de..." | Tabla no existe | Verifica nombre de tabla |
| "No entiendo..." | Prompt muy vago | Sé más específico |
| "Connection error" | Backend no corre | `npm run dev` en /backend |
| "No tables found" | PostgreSQL no configurada | Instala PG y carga datos |

---

## Ejemplos con Datos Reales

Si tienes una tabla `ventas` con:
- id, fecha, monto, región, producto

Puedes preguntar:
```
1. Muestra el monto total por región
2. ¿Cuál es el producto más vendido en Norte?
3. Tendencia de ventas del último trimestre
4. Top 10 productos por monto
5. Compara ventas de Este vs Oeste
6. ¿Cuántos productos diferentes se vendieron?
7. Promedio de precio por región
8. ¿En qué mes hubo más ingresos?
```

---

Prueba ahora y cuéntame cómo funciona! 🚀
