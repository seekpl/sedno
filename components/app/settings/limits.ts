/**
 * Granice pól profilu wspólne dla formularza (przeglądarka) i walidacji na serwerze (lib/data/profile.ts).
 * Najdłuższa nazwa w znakach — jak char_length w bazie (supabase/migrations/20261013000000_accounts.sql).
 */
export const PROFILE_NAME_MAX = 80;
