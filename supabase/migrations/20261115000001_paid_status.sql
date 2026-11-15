-- ============================================
-- PASO 1 de 2: estado "paid" en el enum
-- ============================================
-- Ejecutar SOLO este archivo primero (SQL Editor > Run) y recién después
-- el 20261115000002_security_payments.sql.
-- Postgres no permite usar un valor de enum nuevo en la misma transacción
-- en la que se agrega, por eso va separado.
-- ============================================

ALTER TYPE number_status ADD VALUE IF NOT EXISTS 'paid';
