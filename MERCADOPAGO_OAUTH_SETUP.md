# Integración con Mercado Pago OAuth (Más Fácil para Usuarios)

## Problema Actual

Actualmente los usuarios deben:
1. Ir a Mercado Pago Developers
2. Crear una aplicación
3. Copiar el Access Token manualmente
4. Pegarlo en el campo

**Esto es muy técnico** para usuarios promedio que solo quieren vender rifas.

## Solución: Mercado Pago OAuth

Con OAuth, los usuarios simplemente:
1. Hacen clic en "Conectar con Mercado Pago"
2. Inician sesión en Mercado Pago
3. Autorizan la aplicación
4. ¡Listo! El access token se obtiene automáticamente

## Implementación

### Paso 1: Crear Aplicación en Mercado Pago

1. Ve a [Mercado Pago Developers](https://www.mercadopago.com.ar/developers/panel/app)
2. Crea una nueva aplicación
3. En "Configuración" → "OAuth":
   - **Redirect URI**: `https://tu-dominio.com/mercadopago/callback`
   - Para desarrollo: `http://localhost:8080/mercadopago/callback`
4. Copia tu **Client ID** y **Client Secret**

### Paso 2: Configurar Variables de Entorno

Agrega a tu `.env`:

```env
VITE_MERCADOPAGO_CLIENT_ID=tu_client_id_aqui
VITE_MERCADOPAGO_REDIRECT_URI=https://tu-dominio.com/mercadopago/callback
```

### Paso 3: Implementar el Flujo OAuth

#### 3.1 Crear Helper de OAuth

```typescript
// src/lib/mercadopago-oauth.ts
export function getMercadoPagoAuthUrl(): string {
  const clientId = import.meta.env.VITE_MERCADOPAGO_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_MERCADOPAGO_REDIRECT_URI;

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    redirect_uri: redirectUri,
  });

  return `https://auth.mercadopago.com.ar/authorization?${params}`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  // Este endpoint debe estar en tu backend o Supabase Edge Function
  const response = await fetch('/api/mercadopago/exchange-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  const data = await response.json();
  return data.access_token;
}
```

#### 3.2 Actualizar UI de Configuración

```tsx
// En RaffleView.tsx - Sección de edición
<div className="space-y-4 pt-4 border-t">
  <div className="space-y-2">
    <h3 className="font-semibold text-sm">Pagos con Mercado Pago</h3>
    <p className="text-xs text-muted-foreground">
      Conecta tu cuenta de Mercado Pago para recibir pagos
    </p>
  </div>

  {!editData.mercadopago_access_token ? (
    <Button
      onClick={handleConnectMercadoPago}
      variant="outline"
      className="w-full gap-2"
    >
      <CreditCard className="w-4 h-4" />
      Conectar con Mercado Pago
    </Button>
  ) : (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded">
        <Check className="w-4 h-4 text-green-600" />
        <span className="text-sm text-green-800">Cuenta conectada</span>
      </div>
      <Button
        onClick={handleDisconnectMercadoPago}
        variant="outline"
        size="sm"
      >
        Desconectar
      </Button>
    </div>
  )}
</div>
```

### Paso 4: Crear Supabase Edge Function

```typescript
// supabase/functions/mercadopago-exchange-token/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  try {
    const { code } = await req.json()

    const clientId = Deno.env.get('MERCADOPAGO_CLIENT_ID')
    const clientSecret = Deno.env.get('MERCADOPAGO_CLIENT_SECRET')
    const redirectUri = Deno.env.get('MERCADOPAGO_REDIRECT_URI')

    // Intercambiar código por access token
    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId!,
        client_secret: clientSecret!,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri!,
      }),
    })

    const data = await response.json()

    return new Response(JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    }), {
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

## Alternativa Más Simple: Usar CVU/Alias (Sin Mercado Pago API)

Si quieres algo **aún más simple** sin integración de API:

### Opción 1: Solo CBU/CVU/Alias

```tsx
<div className="space-y-2">
  <Label>Método de Pago</Label>
  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
    <SelectTrigger>
      <SelectValue placeholder="Selecciona un método" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="whatsapp">Solo WhatsApp (manual)</SelectItem>
      <SelectItem value="transfer">Transferencia Bancaria</SelectItem>
      <SelectItem value="mercadopago_manual">Mercado Pago (manual)</SelectItem>
      <SelectItem value="mercadopago_auto">Mercado Pago (automático)</SelectItem>
    </SelectContent>
  </Select>
</div>

{paymentMethod === 'transfer' && (
  <div className="space-y-2">
    <Label>CBU/CVU/Alias</Label>
    <Input
      placeholder="tu.alias.mp o 0000003100010000000001"
      value={cbuAlias}
      onChange={(e) => setCbuAlias(e.target.value)}
    />
    <p className="text-xs text-muted-foreground">
      Los compradores verán estos datos para transferir
    </p>
  </div>
)}

{paymentMethod === 'mercadopago_manual' && (
  <div className="space-y-2">
    <Label>Usuario de Mercado Pago</Label>
    <Input
      placeholder="@tunombre"
      value={mpUsername}
      onChange={(e) => setMpUsername(e.target.value)}
    />
    <p className="text-xs text-muted-foreground">
      Los compradores te transferirán por Mercado Pago manualmente
    </p>
  </div>
)}
```

### Opción 2: Link de Mercado Pago

Mercado Pago permite crear links de pago manuales:

```tsx
<div className="space-y-2">
  <Label>Link de Mercado Pago</Label>
  <Input
    placeholder="https://mpago.la/tulink"
    value={mpLink}
    onChange={(e) => setMpLink(e.target.value)}
  />
  <p className="text-xs text-muted-foreground">
    Crea un link en{" "}
    <a
      href="https://www.mercadopago.com.ar/tools/create"
      target="_blank"
      className="text-primary underline"
    >
      Mercado Pago
    </a>
  </p>
</div>
```

Cuando el comprador reserva un número, se le muestra:
```tsx
<Button onClick={() => window.open(mpLink, '_blank')}>
  Pagar ${price} por Mercado Pago
</Button>
```

## Recomendación según Caso de Uso

### Para MVP/Primeras Ventas:
✅ **Usa CBU/CVU/Alias o Link de MP**
- Más simple
- No requiere configuración técnica
- El vendedor confirma pagos manualmente

### Para Escala/Profesional:
✅ **Usa OAuth de Mercado Pago**
- Experiencia profesional
- Confirmación automática
- Mejor UX para compradores

## Ventajas de Cada Método

| Método | Facilidad Setup | Confirmación Auto | Experiencia Usuario |
|--------|----------------|-------------------|---------------------|
| WhatsApp + Manual | ⭐⭐⭐⭐⭐ | ❌ | ⭐⭐ |
| CBU/Alias | ⭐⭐⭐⭐ | ❌ | ⭐⭐⭐ |
| Link MP Manual | ⭐⭐⭐⭐ | ❌ | ⭐⭐⭐ |
| Access Token Manual | ⭐⭐ | ✅ | ⭐⭐⭐⭐ |
| OAuth MP | ⭐⭐⭐ | ✅ | ⭐⭐⭐⭐⭐ |

## Próximos Pasos

¿Qué método prefieres implementar?

1. **OAuth de Mercado Pago** - Mejor experiencia pero más complejo
2. **CBU/Alias + Confirmación Manual** - Más simple, el vendedor marca como pagado
3. **Híbrido** - Ofrecer ambas opciones según el nivel del usuario
