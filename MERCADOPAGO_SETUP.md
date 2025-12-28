# Integración de Mercado Pago

Esta guía te ayudará a configurar Mercado Pago en tu aplicación de rifas.

## Paso 1: Ejecutar la migración de base de datos

1. Ve a tu proyecto en Supabase Dashboard
2. Navega a SQL Editor
3. Crea una nueva query
4. Copia y pega el contenido de `supabase/mercadopago_integration.sql`
5. Ejecuta el script

Esto creará:
- Campos `mercadopago_access_token` y `mercadopago_enabled` en la tabla `raffles`
- Campos de pago en `raffle_numbers`
- Tabla `payment_transactions` para registrar pagos
- Función `confirm_payment` para confirmar pagos automáticamente

## Paso 2: Obtener credenciales de Mercado Pago

### Para pruebas (recomendado primero):

1. Ve a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers)
2. Crea una cuenta de desarrollador
3. En "Tus integraciones" > Crea una aplicación de prueba
4. Ve a "Credenciales" > "Credenciales de prueba"
5. Copia tu **Access Token de prueba** (comienza con `TEST-`)
6. Guarda este token de forma segura

### Tarjetas de prueba:
- **Visa aprobada**: 4509 9535 6623 3704
- **CVV**: 123
- **Fecha**: Cualquier fecha futura
- **Titular**: APRO (para aprobado)
- **DNI**: 12345678

Más tarjetas de prueba: https://www.mercadopago.com.ar/developers/es/docs/testing/test-cards

### Nota sobre pruebas en localhost:
- En localhost, Mercado Pago no puede redirigir automáticamente de vuelta a tu aplicación
- Después de completar el pago en Mercado Pago, debes volver manualmente al raffle
- La aplicación detectará automáticamente el pago pendiente y verificará su estado
- Para pruebas más realistas (con redirección automática), considera usar:
  - ngrok u otra herramienta de tunneling para exponer tu localhost
  - Desplegar a un entorno de staging/preview (como Vercel)

### Para producción:

1. Ve a "Credenciales" > "Credenciales de producción"
2. Completa el formulario de homologación de Mercado Pago
3. Una vez aprobado, copia tu **Access Token de producción** (comienza con `APP_USR-`)
4. Úsalo en tus raffles de producción

⚠️ **Importante**: Nunca mezcles credenciales de prueba con producción

## Paso 3: Configurar Mercado Pago en tu raffle

1. Ve a tu raffle en modo edición
2. Pega tu Access Token de Mercado Pago
3. Activa "Habilitar pagos con Mercado Pago"
4. Guarda los cambios

## Paso 4: Flujo de pago para compradores

Cuando Mercado Pago está habilitado en un raffle:

1. El comprador selecciona un número
2. En el diálogo de reserva, aparecerá un botón "Pagar ahora con Mercado Pago"
3. Al hacer click:
   - Se genera un link de pago único en Mercado Pago
   - El número se reserva temporalmente con el ID de la preferencia
   - La información del pago se guarda en localStorage
   - El comprador es redirigido a Mercado Pago para completar el pago
4. Después del pago:
   - **En producción (con back_urls configuradas)**: Mercado Pago redirige automáticamente al raffle con parámetros de estado
   - **En desarrollo (localhost)**: El usuario debe volver manualmente al raffle
   - Al regresar al raffle, se verifica automáticamente el estado del pago:
     - Si es exitoso: el número se marca como "vendido" automáticamente
     - Si falla o se cancela: el número permanece reservado por 24 horas
     - La verificación se hace consultando la API de Mercado Pago por el ID de preferencia

## Paso 5: Webhooks (Opcional - Avanzado)

Para confirmar pagos automáticamente:

1. Crea un endpoint en tu backend o usa Supabase Edge Functions
2. Configura el webhook en Mercado Pago apuntando a tu endpoint
3. El webhook recibirá notificaciones cuando un pago cambie de estado
4. Usa la función `confirm_payment` para actualizar el estado del número

### Ejemplo de Edge Function para Webhook:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { type, data } = await req.json()

    // Solo procesar pagos aprobados
    if (type === "payment" && data.id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Buscar el número con este payment_id
      const { data: number } = await supabase
        .from('raffle_numbers')
        .select('id')
        .eq('payment_id', data.id)
        .single()

      if (number) {
        // Confirmar el pago
        await supabase.rpc('confirm_payment', {
          p_payment_id: data.id,
          p_raffle_number_id: number.id
        })
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
```

## Seguridad

⚠️ **IMPORTANTE**:
- El Access Token de Mercado Pago es sensible - nunca lo expongas en el frontend
- En una implementación de producción, deberías mover la generación de links de pago a una Cloud Function o Edge Function
- Los webhooks deben validar la firma de Mercado Pago

## Limitaciones de esta implementación

Esta es una implementación básica que:
- Genera links de pago desde el frontend (no recomendado para producción)
- No valida webhooks con firma digital
- No maneja reembolsos automáticamente
- No implementa pagos en cuotas

Para una implementación en producción, considera:
- Mover la lógica de pago a Supabase Edge Functions
- Implementar validación de webhooks con firma
- Agregar manejo de errores más robusto
- Implementar logs y auditoría de transacciones

## Próximos pasos

Una vez ejecutada la migración, la UI ya está lista para:
1. Configurar el Access Token en cada raffle
2. Generar links de pago automáticamente
3. Mostrar la opción de pago a los compradores

Los cambios en la UI ya están implementados en los componentes NumberGrid y RaffleView.
