# 🚀 Guía de Deployment - Vercel

Esta guía te ayudará a desplegar tu aplicación de rifas en Vercel correctamente.

## 📋 Pre-requisitos

- [ ] Cuenta en [Vercel](https://vercel.com)
- [ ] Proyecto de Supabase configurado y funcionando
- [ ] Código en GitHub (recomendado) o listo para deployment

## ⚙️ Configuración de Variables de Entorno en Vercel

### Paso 1: Acceder a la configuración

1. Ve a tu proyecto en [Vercel Dashboard](https://vercel.com/dashboard)
2. Click en **Settings**
3. Click en **Environment Variables**

### Paso 2: Agregar variables de entorno

Agrega estas 3 variables (una por una):

| Variable | Valor | Descripción |
|----------|-------|-------------|
| `VITE_SUPABASE_URL` | `https://zaykbpbmuyxxzkrrfiap.supabase.co` | URL de tu proyecto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | Tu anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | `zaykbpbmuyxxzkrrfiap` | ID del proyecto (opcional) |

**IMPORTANTE**:
- Asegúrate de seleccionar **Production**, **Preview**, y **Development**
- Usa exactamente los mismos nombres que en tu `.env` local

### Paso 3: Verificar variables

En la sección Environment Variables deberías ver:
- ✅ 3 variables configuradas
- ✅ Todas marcadas para Production, Preview, Development

## 🔧 Configuración del Build

Vercel debería detectar automáticamente tu configuración de Vite gracias al archivo `vercel.json`, pero verifica:

### En Settings > General:

- **Framework Preset**: `Vite`
- **Build Command**: `npm run build` (o déjalo vacío para usar el default)
- **Output Directory**: `dist`
- **Install Command**: `npm install`
- **Node Version**: 18.x o superior

## 🔄 Re-deployar después de agregar variables

Después de agregar las variables de entorno:

1. Ve a **Deployments**
2. Click en los **3 puntos** (⋮) del último deployment
3. Click en **Redeploy**
4. Asegúrate que **Use existing Build Cache** esté **DESACTIVADO**
5. Click **Redeploy**

## ✅ Verificar que funcione

### Prueba 1: Home Page
1. Abre tu URL de Vercel (ej: `https://tu-app.vercel.app`)
2. ✅ Deberías ver la página de inicio

### Prueba 2: Rutas directas (Fix del 404)
1. Crea una rifa en tu app
2. Copia el link (ej: `https://tu-app.vercel.app/raffle/abc123`)
3. Pega el link en una **nueva pestaña** (o envíalo a alguien)
4. ✅ Deberías ver la rifa, NO un 404

### Prueba 3: Autenticación
1. Intenta registrar un usuario
2. ✅ Debería funcionar igual que en local

### Prueba 4: Reservas públicas
1. Abre la rifa en incógnito
2. Intenta reservar un número
3. ✅ Debería funcionar

## 🐛 Troubleshooting

### Problema: 404 en rutas directas

**Síntoma**: Al acceder a `/raffle/123` directamente, ves un 404.

**Solución**: El archivo `vercel.json` debería solucionar esto automáticamente.

Verifica que `vercel.json` existe en la raíz:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Si el archivo existe, haz un nuevo deployment:
1. Haz un cambio pequeño (ej: agrega un espacio en README)
2. Commit y push
3. Vercel re-desplegará automáticamente

### Problema: Variables de entorno no funcionan

**Síntoma**: Errores de conexión a Supabase, "Invalid API key".

**Diagnóstico**:
1. Abre DevTools (F12) en tu app de Vercel
2. Console > busca errores
3. Network > busca requests fallidas a Supabase

**Solución**:
1. Verifica que las variables estén en **Settings > Environment Variables**
2. Verifica que los nombres sean EXACTOS (case-sensitive)
3. Re-deploy SIN cache:
   - Deployments > ⋮ > Redeploy
   - Desmarca "Use existing Build Cache"

### Problema: Build falla en Vercel

**Síntoma**: El deployment dice "Build failed".

**Solución**:
1. Lee el log de error en Vercel
2. Usualmente es por:
   - Dependencias faltantes → Verifica `package.json`
   - Errores de TypeScript → Corre `npm run build` localmente
   - Node version incorrecta → Cambia a 18.x en Settings

**Para ver el error completo**:
1. Ve al deployment fallido
2. Click en **View Build Logs**
3. Busca líneas con `ERROR` en rojo

### Problema: App funciona pero las reservas públicas no

**Causa**: Políticas RLS de Supabase no están configuradas.

**Solución**:
1. Ve a tu Supabase Dashboard
2. SQL Editor
3. Ejecuta `supabase/FIX_REGISTRATION_ERROR.sql`
4. Ejecuta `supabase/public_reservations_policy.sql`

## 🔒 Configurar dominio personalizado (Opcional)

### Paso 1: Agregar dominio en Vercel

1. Settings > Domains
2. Agrega tu dominio (ej: `misrifas.com`)
3. Vercel te dará registros DNS para configurar

### Paso 2: Configurar DNS

En tu proveedor de dominios (GoDaddy, Namecheap, etc.):

**Tipo A**:
```
Type: A
Name: @
Value: 76.76.21.21
```

**Tipo CNAME** (para www):
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### Paso 3: Esperar propagación

- DNS puede tardar hasta 48 horas (usualmente 10-30 min)
- Vercel te avisará cuando esté listo

### Paso 4: Actualizar Supabase

En Supabase Dashboard > Authentication > URL Configuration:

- **Site URL**: `https://tudominio.com`
- **Redirect URLs**: Agrega `https://tudominio.com/**`

## 📊 Monitoreo

### Ver Analytics

1. Vercel Dashboard > Tu proyecto > Analytics
2. Verás:
   - Visitantes
   - Páginas más visitadas
   - Performance

### Ver Logs en tiempo real

1. Vercel Dashboard > Tu proyecto > Logs
2. Filtra por:
   - Runtime (errores en producción)
   - Build (errores al compilar)

## 🚀 Deployment automático con Git

Si conectaste Vercel con GitHub:

✅ **Push a `main`** → Deployment a Producción
✅ **Push a otra rama** → Preview deployment
✅ **Pull Request** → Preview automático

### Deshabilitar auto-deploy (opcional)

Settings > Git > Production Branch
- Desmarca "Automatically deploy changes"

## 📝 Checklist Final

Antes de compartir tu app:

- [ ] Variables de entorno configuradas en Vercel
- [ ] Rutas directas funcionan (no 404)
- [ ] Autenticación funciona
- [ ] Reservas públicas funcionan
- [ ] Base de datos Supabase tiene políticas RLS
- [ ] No hay errores en la consola del navegador
- [ ] App funciona en móvil
- [ ] Email confirmations configurado (si lo usas)

## 🆘 Soporte

Si algo no funciona:

1. **Vercel Support**: https://vercel.com/support
2. **Documentación Vercel**: https://vercel.com/docs
3. **Supabase Docs**: https://supabase.com/docs

## 🔗 Links Útiles

- [Vercel Dashboard](https://vercel.com/dashboard)
- [Supabase Dashboard](https://supabase.com/dashboard)
- [Vercel + Vite Guide](https://vercel.com/docs/frameworks/vite)
