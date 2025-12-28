# Flujo de Verificación de Pagos - Mercado Pago

## Resumen del Problema y Solución

### Problema Original
Cuando un usuario completaba un pago en Mercado Pago:
1. En **localhost**: No había redirección automática de vuelta a la aplicación
2. Los números no se marcaban automáticamente como vendidos después del pago
3. No había manera de verificar si el pago fue exitoso

### Solución Implementada
Sistema de verificación automática de pagos que funciona tanto en localhost como en producción, sin necesidad de webhooks.

## Cómo Funciona

### 1. Al Iniciar el Pago (NumberGrid.tsx)

Cuando el usuario hace clic en "Pagar con Mercado Pago":

```typescript
// Se crea la preferencia de pago en Mercado Pago
const result = await createMercadoPagoPaymentLink({...});

// Se guarda el preferenceId en la base de datos
await supabase.from("raffle_numbers").update({
  payment_id: result.preferenceId,  // ID de la preferencia
  payment_link: result.paymentLink,
  status: "reserved"
});

// Se guarda información en localStorage para verificación posterior
localStorage.setItem('pending_payment', JSON.stringify({
  raffleId: raffle.id,
  numberId: selectedNumber.id,  // O numberIds para pagos múltiples
  preferenceId: result.preferenceId,
  timestamp: Date.now()
}));

// Se redirige a Mercado Pago
window.location.href = result.paymentLink;
```

### 2. Al Regresar al Raffle (RaffleView.tsx)

Cuando el usuario regresa al raffle (manualmente en localhost, o automáticamente en producción):

```typescript
useEffect(() => {
  loadData();
  checkPaymentStatus();    // Verifica parámetros URL (producción)
  checkPendingPayment();   // Verifica localStorage (funciona siempre)
}, [id]);
```

### 3. Verificación Automática del Pago

La función `checkPendingPayment()` realiza los siguientes pasos:

1. **Lee localStorage**: Busca información de pagos pendientes
2. **Valida contexto**: Verifica que sea el raffle correcto y no haya expirado (24h)
3. **Consulta Mercado Pago**: Usa la API de búsqueda de pagos por preferencia
4. **Actualiza estado**: Si encuentra un pago aprobado, marca el número como vendido

```typescript
// Buscar pagos asociados a la preferencia
const paymentsData = await searchPaymentsByPreference(
  accessToken,
  preferenceId
);

// Buscar pago aprobado
const approvedPayment = paymentsData.results?.find(
  payment => payment.status === 'approved'
);

if (approvedPayment) {
  // Marcar números como vendidos
  await supabase.from("raffle_numbers").update({
    status: "sold",
    sold_at: new Date().toISOString(),
    payment_status: "approved"
  });
}
```

## Archivos Modificados

### 1. `src/lib/mercadopago.ts`
- ✅ Añadida función `searchPaymentsByPreference()` para buscar pagos por preferencia ID
- ✅ Mantiene detección de localhost para back_urls

### 2. `src/components/NumberGrid.tsx`
- ✅ Guarda `preferenceId` en base de datos al reservar número
- ✅ Guarda información en localStorage antes de redirigir
- ✅ Funciona tanto para pago individual como múltiple

### 3. `src/pages/RaffleView.tsx`
- ✅ Añadida función `checkPendingPayment()` que se ejecuta al cargar la página
- ✅ Verifica automáticamente el estado del pago
- ✅ Marca números como vendidos si el pago fue aprobado
- ✅ Limpia localStorage después de procesar

## Flujo Completo de Usuario

### En Localhost (Desarrollo)

1. Usuario selecciona número(s) y hace clic en "Pagar con Mercado Pago"
2. Sistema reserva número(s) y guarda preferenceId
3. Usuario es redirigido a Mercado Pago
4. Usuario completa el pago en Mercado Pago
5. **Usuario cierra Mercado Pago y navega manualmente de vuelta al raffle**
6. Sistema detecta pago pendiente en localStorage
7. Sistema consulta Mercado Pago API por estado del pago
8. Si está aprobado, marca automáticamente como vendido
9. Muestra notificación de éxito

### En Producción

1. Usuario selecciona número(s) y hace clic en "Pagar con Mercado Pago"
2. Sistema reserva número(s) y guarda preferenceId
3. Usuario es redirigido a Mercado Pago
4. Usuario completa el pago en Mercado Pago
5. **Mercado Pago redirige automáticamente de vuelta al raffle** (con parámetros URL)
6. Sistema detecta pago pendiente en localStorage
7. Sistema consulta Mercado Pago API por estado del pago
8. Si está aprobado, marca automáticamente como vendido
9. Muestra notificación de éxito

## Ventajas de esta Solución

✅ **Funciona sin webhooks**: No requiere configuración de servidor backend
✅ **Funciona en localhost**: Los desarrolladores pueden probar localmente
✅ **Funciona en producción**: También funciona con redirección automática
✅ **Resistente a errores**: Si falla una verificación, se reintenta en la próxima visita (hasta 24h)
✅ **Sin polling constante**: Solo verifica cuando el usuario regresa al raffle
✅ **Seguro**: Verifica contra la API oficial de Mercado Pago, no confía en datos del cliente

## Limitaciones

⚠️ **Requiere que el usuario regrese al raffle**: Si el usuario nunca vuelve a visitar el raffle en las siguientes 24 horas, el número permanece reservado (pero no vendido)

⚠️ **Access Token en frontend**: El token de Mercado Pago está en el frontend. Para producción seria, considera mover esta lógica a Supabase Edge Functions

⚠️ **Sin notificaciones en tiempo real**: El vendedor no ve la venta inmediatamente, solo cuando recarga la página

## Mejoras Futuras (Opcionales)

1. **Implementar webhooks**: Para confirmación inmediata sin que el usuario regrese
2. **Mover a Edge Functions**: Para mayor seguridad del access token
3. **Polling automático**: Verificar estado cada X segundos en la página del raffle
4. **Notificaciones push**: Alertar al vendedor cuando se completa un pago

## Testing

### Cómo Probar en Localhost

1. Configurar Access Token de prueba de Mercado Pago en un raffle
2. Seleccionar un número y hacer clic en "Pagar con Mercado Pago"
3. Completar pago con tarjeta de prueba (APRO)
4. **Cerrar pestaña de Mercado Pago y navegar manualmente de vuelta al raffle**
5. Verificar que el número se marque como vendido automáticamente
6. Verificar notificación de éxito

### Cómo Probar en Producción

1. Mismo proceso que localhost
2. La diferencia: Mercado Pago redirigirá automáticamente de vuelta
3. No es necesario navegar manualmente
