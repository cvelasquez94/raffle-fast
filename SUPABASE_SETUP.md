# Configuración de Supabase para Reservas Públicas

Este documento explica cómo configurar las políticas de seguridad (RLS) en Supabase para permitir que usuarios públicos (sin login) puedan reservar números en las rifas.

## Problema

Por defecto, Supabase bloquea todas las actualizaciones de usuarios no autenticados por seguridad. Necesitamos configurar políticas que permitan:

1. **Usuarios públicos** pueden:
   - Ver todas las rifas y sus números
   - Reservar números disponibles (cambiar de `available` → `reserved`)

2. **Propietarios autenticados** pueden:
   - Hacer cualquier actualización en sus rifas
   - Cambiar estados entre `available`, `reserved` y `sold`
   - Editar información de compradores

## Pasos de Configuración

### 1. Accede al SQL Editor de Supabase

1. Ve a tu proyecto en [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. En el menú lateral, haz clic en **SQL Editor**
3. Crea una nueva query

### 2. Verifica si RLS está habilitado

Ejecuta este comando para verificar si Row Level Security está habilitado en tus tablas:

```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('raffles', 'raffle_numbers');
```

Si `rowsecurity` es `false`, habilítalo con:

```sql
ALTER TABLE raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffle_numbers ENABLE ROW LEVEL SECURITY;
```

### 3. Elimina políticas existentes (si las hay)

Si ya tienes políticas, elimínalas primero para evitar conflictos:

```sql
-- Eliminar políticas existentes de raffle_numbers
DROP POLICY IF EXISTS "Anyone can view raffle numbers" ON raffle_numbers;
DROP POLICY IF EXISTS "Anyone can reserve available numbers" ON raffle_numbers;
DROP POLICY IF EXISTS "Owners can update their raffle numbers" ON raffle_numbers;
DROP POLICY IF EXISTS "Owners can insert raffle numbers" ON raffle_numbers;

-- Eliminar políticas existentes de raffles
DROP POLICY IF EXISTS "Anyone can view raffles" ON raffles;
DROP POLICY IF EXISTS "Owners can manage their raffles" ON raffles;
```

### 4. Crea las nuevas políticas de seguridad

Ejecuta el siguiente SQL completo:

```sql
-- ==================================================
-- POLÍTICAS PARA LA TABLA: raffle_numbers
-- ==================================================

-- Permitir que CUALQUIERA (incluso sin login) pueda ver los números
CREATE POLICY "Anyone can view raffle numbers"
ON raffle_numbers
FOR SELECT
TO public
USING (true);

-- Permitir que CUALQUIERA pueda reservar números disponibles
-- Solo permite cambiar de 'available' a 'reserved' con datos del comprador
CREATE POLICY "Anyone can reserve available numbers"
ON raffle_numbers
FOR UPDATE
TO public
USING (status = 'available')
WITH CHECK (
  status = 'reserved'
  AND buyer_name IS NOT NULL
  AND reserved_at IS NOT NULL
  AND reserved_until IS NOT NULL
);

-- Permitir que los PROPIETARIOS actualicen cualquier número de sus rifas
CREATE POLICY "Owners can update their raffle numbers"
ON raffle_numbers
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM raffles
    WHERE raffles.id = raffle_numbers.raffle_id
    AND raffles.user_id = auth.uid()
  )
);

-- Permitir que los PROPIETARIOS inserten números en sus rifas
CREATE POLICY "Owners can insert raffle numbers"
ON raffle_numbers
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM raffles
    WHERE raffles.id = raffle_numbers.raffle_id
    AND raffles.user_id = auth.uid()
  )
);

-- ==================================================
-- POLÍTICAS PARA LA TABLA: raffles
-- ==================================================

-- Permitir que CUALQUIERA vea las rifas (necesario para vista pública)
CREATE POLICY "Anyone can view raffles"
ON raffles
FOR SELECT
TO public
USING (true);

-- Permitir que usuarios autenticados gestionen sus propias rifas
CREATE POLICY "Owners can manage their raffles"
ON raffles
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

### 5. Verifica que las políticas se crearon correctamente

```sql
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('raffles', 'raffle_numbers')
ORDER BY tablename, policyname;
```

Deberías ver todas las políticas listadas.

### 6. Prueba la funcionalidad

1. **Comparte el link de una rifa** (ej: `https://tu-app.com/raffle/uuid-de-rifa`)
2. **Abre el link en una ventana de incógnito** (sin estar logueado)
3. **Haz clic en un número disponible**
4. **Completa el formulario con tu nombre** y haz clic en "Reservar 24hs"
5. **Verifica que el número cambia a estado "reservado"** 🟡

## Troubleshooting

### Error: "new row violates row-level security policy"

Esto significa que las políticas no están configuradas correctamente. Verifica:

1. Que RLS esté habilitado en ambas tablas
2. Que las políticas se hayan creado sin errores
3. Que los nombres de las columnas coincidan con tu esquema

### Error: "permission denied for table raffle_numbers"

Ejecuta este comando para dar permisos de lectura/escritura al rol público:

```sql
GRANT SELECT, UPDATE ON raffle_numbers TO anon;
GRANT SELECT ON raffles TO anon;
```

### Los cambios no se reflejan

1. Refresca la página
2. Verifica que `onNumberUpdated()` se esté llamando correctamente
3. Revisa la consola del navegador para errores JavaScript

## Seguridad

Estas políticas son seguras porque:

✅ Los usuarios públicos **solo** pueden reservar números disponibles
✅ No pueden cambiar números a "vendidos"
✅ No pueden cancelar reservas de otros
✅ No pueden modificar números que ya están reservados o vendidos
✅ Los propietarios mantienen control total sobre sus rifas

## Próximos pasos

Considera agregar:

- **Expiración automática de reservas**: Un trigger que cambie reservas expiradas de vuelta a "available"
- **Límite de reservas por IP/usuario**: Para prevenir spam
- **Notificaciones por email**: Cuando se haga una nueva reserva
