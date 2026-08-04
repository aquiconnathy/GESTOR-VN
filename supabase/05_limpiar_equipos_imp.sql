-- Script 05: Limpieza de Equipos de Prueba Anteriores (EQ_IMP_)
-- Ejecuta este script en el SQL Editor de Supabase si deseas eliminar los registros de prueba antiguos.

DELETE FROM equipos WHERE id LIKE 'EQ_IMP_%';
