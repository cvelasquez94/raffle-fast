# Guía del Estado "Pagado" (Paid)

## Resumen

Se ha implementado un **estado intermedio "paid"** para números que fueron pagados con Mercado Pago pero que **esperan confirmación manual del vendedor** antes de ser marcados como "sold" (vendidos).

## Flujo de Estados

```
available → reserved → paid → sold
   ↓                     ↓
   └─────────────────────┘
   (puede volver a disponible si el owner rechaza)
```

### Estados Explicados

1. **available** (verde): Número disponible para reservar/comprar
2. **reserved** (amarillo): Número reservado por 24 horas
3. **paid** (azul): Número **pagado con Mercado Pago, esperando confirmación del owner**
4. **sold** (gris): Número vendido y confirmado

## ¿Por Qué Este Flujo?

### Ventajas del Estado "Paid"

✅ **Control del vendedor**: Puedes verificar que recibiste el dinero antes de liberar el número
✅ **Protección contra fraude**: Si hay un contracargo o problema, el número no se entrega hasta confirmar
✅ **Acreditación bancaria**: Mercado Pago puede tardar en acreditar, esto te da tiempo
✅ **Transparencia**: El comprador sabe que su pago fue verificado

### Diferencia vs Marcar Automáticamente como "Sold"

| Aspecto | Estado "Paid" (actual) | Automático a "Sold" |
|---------|----------------------|---------------------|
| Control del vendedor | ✅ Total | ❌ Ninguno |
| Protección vs fraude | ✅ Alta | ⚠️ Baja |
| Experiencia del comprador | ⚠️ Debe esperar confirmación | ✅ Instantáneo |
| Trabajo del vendedor | ⚠️ Debe revisar y confirmar | ✅ Ninguno |

## Cómo Funciona

### Para el Comprador

1. **Selecciona un número** disponible (verde)
2. **Hace clic en "Pagar con Mercado Pago"**
3. Completa el pago en Mercado Pago
4. **Regresa al raffle** (automático en producción, manual en localhost)
5. Ve el número en **azul** con mensaje: "Tu pago fue procesado exitosamente. El vendedor confirmará la venta cuando reciba el dinero."
6. **Espera confirmación del vendedor**
7. Una vez confirmado, el número se marca como **vendido** (gris)

### Para el Vendedor (Owner)

#### Paso 1: Ver Números Pagados

Los números pagados aparecen:
- En el **grid**: Color azul con borde resaltado
- En las **estadísticas**: Contador "Pagados"
- Claramente **diferenciados** de reservados (amarillo) y vendidos (gris)

#### Paso 2: Verificar Acreditación

1. **Ingresa a tu cuenta de Mercado Pago**
2. Ve a "Dinero en cuenta" o "Actividad"
3. **Verifica que el pago aparezca** y esté acreditado
4. Confirma el monto correcto

#### Paso 3: Confirmar la Venta

1. **Haz clic en el número azul** (paid)
2. Verás un diálogo con:
   - Badge "Pago Verificado" con ícono de tarjeta
   - Información del comprador (nombre, email, teléfono)
   - Mensaje: "Verifica que recibiste el dinero en tu cuenta de Mercado Pago"
3. Opciones:
   - **"Confirmar Venta"** (verde): Marca el número como vendido
   - **"Rechazar"**: Devuelve el número a disponible (si hubo un problema)

#### Paso 4: Número Vendido

Una vez confirmado:
- El número cambia a **gris** (sold)
- Se registra `sold_at` con la fecha/hora
- El comprador ya puede ver que su número está vendido

## Interfaz Visual

### Grid de Números

- **Verde**: Disponible
- **Amarillo**: Reservado
- **Azul con borde brillante**: Pagado (resaltado para llamar tu atención)
- **Gris**: Vendido

### Estadísticas

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ Disponibles  │  Reservados  │   Pagados    │   Vendidos   │
│     25       │      10      │      3       │     12       │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

### Diálogo de Número Pagado

```
┌─────────────────────────────────────────────┐
│  Número 7                                    │
│  Este número fue pagado y espera confirmación│
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐  │
│  │ 💳 Pago Verificado                    │  │
│  │                                       │  │
│  │ Este número fue pagado con Mercado    │  │
│  │ Pago.                                 │  │
│  │                                       │  │
│  │ Comprador: Juan Pérez                 │  │
│  │ Email: juan@email.com                 │  │
│  │ Teléfono: +54 9 11 1234-5678          │  │
│  └───────────────────────────────────────┘  │
│                                              │
│  Verifica que recibiste el dinero en tu      │
│  cuenta de Mercado Pago                      │
│                                              │
│  ┌──────────────┐  ┌──────────────────┐    │
│  │ ✓ Confirmar  │  │ ✕ Rechazar       │    │
│  │   Venta      │  │   (devolver)     │    │
│  └──────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────┘
```

## Migración de Base de Datos

### Ejecutar la Migración

1. Ve a **Supabase Dashboard** → SQL Editor
2. Ejecuta el archivo `supabase/add_paid_status.sql`
3. Esto agregará:
   - El estado "paid" al constraint CHECK
   - Índices para búsquedas rápidas

```sql
-- Script ya incluido en add_paid_status.sql
ALTER TABLE raffle_numbers
DROP CONSTRAINT IF EXISTS raffle_numbers_status_check;

ALTER TABLE raffle_numbers
ADD CONSTRAINT raffle_numbers_status_check
CHECK (status IN ('available', 'reserved', 'paid', 'sold'));
```

## Escenarios Comunes

### ✅ Escenario Normal (Pago Exitoso)

1. Comprador paga → Estado: **paid**
2. Vendedor verifica acreditación
3. Vendedor confirma → Estado: **sold**
4. ✅ Proceso completado

### ⚠️ Escenario: Pago Pendiente de Acreditar

1. Comprador paga → Estado: **paid**
2. Vendedor no ve el dinero aún
3. **Espera** 24-48 horas (tiempo de acreditación)
4. Vendedor confirma cuando se acredita → Estado: **sold**

### ❌ Escenario: Problema con el Pago

1. Comprador paga → Estado: **paid**
2. Mercado Pago rechaza/revierte el pago
3. Vendedor ve que no llegó el dinero
4. Vendedor hace clic en **"Rechazar"** → Estado: **available**
5. El número vuelve a estar disponible

### 🔄 Escenario: Cambio de Opinión del Comprador

1. Comprador paga → Estado: **paid**
2. Comprador pide cancelación
3. Vendedor reembolsa en Mercado Pago
4. Vendedor hace clic en **"Rechazar"** → Estado: **available**

## Buenas Prácticas

### Para Vendedores

✅ **Revisa diariamente** los números en estado "paid"
✅ **Verifica primero** la acreditación en Mercado Pago
✅ **Confirma rápido** cuando veas el dinero (buena experiencia del comprador)
⚠️ **No confirmes** si no ves el dinero acreditado
⚠️ **Espera 24-48h** si el pago está "en proceso" en MP

### Para Compradores

✅ **Guarda el comprobante** de Mercado Pago
✅ **Sé paciente** si el vendedor no confirma inmediatamente
✅ **Contacta al vendedor** si pasan más de 48 horas sin confirmación
⚠️ **No te preocupes** si ves "paid" - significa que tu pago fue verificado

## Preguntas Frecuentes

### ¿Cuánto tarda en acreditarse el dinero?

- **Tarjeta de crédito**: 14 días hábiles
- **Tarjeta de débito**: 1-2 días hábiles
- **Mercado Pago**: Instantáneo (si el comprador tiene saldo)
- **Rapipago/Pago Fácil**: 1-2 días hábiles

### ¿Qué pasa si el comprador hace un contracargo?

Si hay un contracargo (dispute):
1. El número estará en estado "paid"
2. Mercado Pago te notificará
3. **NO confirmes** la venta hasta resolver el dispute
4. Si pierdes el dispute, haz clic en "Rechazar"

### ¿Puedo cambiar un número "paid" directamente a "available"?

Sí, como owner puedes:
1. Hacer clic en el número
2. Usar el selector de estado manual
3. Cambiar de "paid" a "available"

### ¿El comprador puede ver mi número si está "paid"?

Sí, el número aparecerá como **no disponible** para otros compradores. Muestra un mensaje: "El vendedor confirmará la venta cuando reciba el dinero".

## Diferencias con el Flujo Anterior

| Aspecto | Antes (automático) | Ahora (con "paid") |
|---------|-------------------|-------------------|
| Estado después del pago | sold | paid |
| Confirmación manual | ❌ No | ✅ Sí |
| Control del vendedor | ❌ No | ✅ Sí |
| Protección vs fraude | ⚠️ Baja | ✅ Alta |
| Comprador puede ver número inmediatamente | ✅ Sí | ⚠️ Después de confirmación |

## Soporte Técnico

Si tienes problemas:
1. Verifica que ejecutaste la migración SQL
2. Revisa que los números "paid" aparezcan en azul
3. Verifica que el botón "Confirmar Venta" aparezca
4. Revisa la consola del navegador para errores

## Próximos Pasos Opcionales

Mejoras que podrías implementar:

1. **Notificaciones automáticas** cuando hay pagos pendientes de confirmar
2. **Dashboard de pagos** con filtros por estado
3. **Webhook de Mercado Pago** para marcar automáticamente como "paid"
4. **Recordatorios** si un pago lleva más de 48h sin confirmar
5. **Estadísticas** de tiempo promedio de confirmación
