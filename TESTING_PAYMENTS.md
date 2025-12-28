# Guía de Pruebas - Verificación de Pagos en Localhost

## Cómo Probar el Flujo de Pago Completo

### Paso 1: Preparar el Talonario
1. Inicia tu servidor de desarrollo: `npm run dev`
2. Ve a tu raffle en modo edición
3. Asegúrate de tener:
   - ✅ Mercado Pago habilitado (checkbox activado)
   - ✅ Access Token de prueba configurado (empieza con `TEST-`)

### Paso 2: Realizar el Pago de Prueba

1. **Selecciona un número disponible** (verde)
2. **Ingresa tus datos** en el formulario:
   - Nombre: Tu nombre
   - Email: tu@email.com (opcional)
   - Teléfono: tu teléfono (opcional)

3. **Haz clic en "Pagar $[precio]"** (botón con ícono de tarjeta)

4. **Verás una notificación**: "¡Redirigiendo a Mercado Pago!"

5. **Serás redirigido a Mercado Pago**. El número ahora aparecerá como "Reservado" (amarillo)

### Paso 3: Completar el Pago en Mercado Pago

1. En la página de Mercado Pago, usa estos datos de tarjeta de prueba:
   ```
   Número de tarjeta: 4509 9535 6623 3704
   Vencimiento: Cualquier fecha futura (ej: 12/25)
   CVV: 123
   Nombre del titular: APRO
   DNI: 12345678
   ```

2. **Completa el pago**

3. Mercado Pago te mostrará "Pago aprobado"

### Paso 4: Verificar el Pago (EN LOCALHOST)

⚠️ **IMPORTANTE**: En localhost, Mercado Pago NO puede redirigirte automáticamente.

Tienes **DOS OPCIONES**:

#### Opción A: Verificación Automática (Recomendada)
1. **Cierra la pestaña de Mercado Pago**
2. **Vuelve a la pestaña del raffle** (o navega manualmente a la URL del raffle)
3. La página debería:
   - Mostrar un banner azul que dice "Hay un pago pendiente de verificación"
   - Verificar automáticamente el pago al cargar
   - Mostrar notificación: "¡Pago confirmado!"
   - Marcar el número como "Vendido" (gris)

#### Opción B: Verificación Manual
1. Si el banner azul aparece pero el pago no se verifica automáticamente:
2. **Haz clic en "Verificar estado del pago"**
3. El sistema consultará a Mercado Pago y actualizará el estado

### Paso 5: Verificar en la Base de Datos

Puedes verificar en Supabase que el número se actualizó:

```sql
SELECT
  number,
  status,
  payment_status,
  payment_id,
  buyer_name,
  sold_at
FROM raffle_numbers
WHERE raffle_id = 'TU_RAFFLE_ID'
ORDER BY number;
```

Deberías ver:
- `status`: "sold"
- `payment_status`: "approved"
- `payment_id`: El ID de la preferencia de Mercado Pago
- `sold_at`: Timestamp de cuando se marcó como vendido

## Debugging

### Abrir la Consola del Navegador

Presiona `F12` o `Cmd+Option+I` (Mac) y ve a la pestaña "Console".

Deberías ver logs como:

```
Datos de pagos de Mercado Pago: {results: [...], paging: {...}}
Preferencia ID: 1234567-abcd-...
Pago aprobado encontrado: {id: 123456789, status: "approved", ...}
```

### Si no se encuentra el pago aprobado

Si ves:
```
Pago aprobado encontrado: undefined
```

Verifica en la consola el objeto `paymentsData.results`. Debería contener un array con al menos un pago con `status: "approved"`.

Si el array está vacío o no existe:
1. Verifica que el Access Token sea correcto
2. Verifica que el pago se haya completado en Mercado Pago
3. Espera unos segundos y vuelve a intentar (a veces Mercado Pago tarda)

### Si hay errores en la actualización

Si ves en consola:
```
Errores al actualizar números: [...]
```

Verifica:
1. Permisos RLS en Supabase para la tabla `raffle_numbers`
2. Que el número no haya sido vendido por otro comprador simultáneamente
3. Que el ID del número en localStorage coincida con el de la base de datos

## Diferencias: Localhost vs Producción

| Característica | Localhost | Producción |
|----------------|-----------|------------|
| Redirección automática | ❌ No (debes volver manualmente) | ✅ Sí (Mercado Pago redirige) |
| Verificación de pago | ✅ Manual + Automática al volver | ✅ Automática al redirigir |
| Banner de verificación | ✅ Visible | ⚠️ Solo si falla la redirección |
| Botón "Verificar pago" | ✅ Disponible | ✅ Disponible (backup) |

## Tarjetas de Prueba Adicionales

### Pago Aprobado
- **Titular**: APRO
- **Tarjeta**: 4509 9535 6623 3704

### Pago Rechazado
- **Titular**: OTHE
- **Tarjeta**: 4509 9535 6623 3704

### Fondos Insuficientes
- **Titular**: FUND
- **Tarjeta**: 4509 9535 6623 3704

Más tarjetas: https://www.mercadopago.com.ar/developers/es/docs/testing/test-cards

## Solución de Problemas Comunes

### El número no se marca como vendido

1. **Verifica localStorage**:
   - Abre DevTools → Application → Local Storage
   - Busca la key `pending_payment`
   - Debe contener: `{raffleId, numberId/numberIds, preferenceId, timestamp}`

2. **Verifica que el raffle tenga Access Token**:
   ```javascript
   // En la consola del navegador
   localStorage.getItem('pending_payment')
   ```

3. **Fuerza la verificación**:
   - Haz clic en "Verificar estado del pago"
   - Recarga la página completamente (Cmd+R o Ctrl+R)

### El banner no aparece

1. Verifica que haya un pago pendiente:
   ```javascript
   localStorage.getItem('pending_payment')
   ```

2. Si devuelve `null`, el pago ya fue procesado o expiró (>24h)

3. Si existe pero no aparece el banner, recarga la página

### Error de CORS

Si ves errores de CORS al consultar Mercado Pago:
- Esto es normal en algunos navegadores
- El Access Token tiene permisos limitados
- Intenta desde otro navegador o usa el token de producción

## Próximos Pasos para Producción

Cuando despliegues a producción (Vercel, etc.):

1. ✅ Usa Access Token de producción (empieza con `APP_USR-`)
2. ✅ Las redirecciones funcionarán automáticamente
3. ✅ Considera implementar webhooks para confirmación instantánea
4. ✅ Mueve el Access Token a variables de entorno de servidor (Edge Functions)

## Notas de Seguridad

⚠️ **IMPORTANTE**:
- El Access Token de Mercado Pago está en el frontend
- Esto es aceptable para MVPs y prototipos
- Para producción seria, considera mover la lógica a Supabase Edge Functions
- Nunca compartas tu Access Token de producción públicamente
