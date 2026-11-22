// Где лежит облачное сохранение. Интерфейс отдельно от Supabase — в тестах подменяется заглушкой.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CloudPayload } from './merge';

export interface CloudStore {
  load(userId: string): Promise<CloudPayload | null>;
  save(userId: string, payload: CloudPayload): Promise<void>;
}

/** Таблица public.saves: одна строка на игрока, доступ только к своей (RLS). */
export function supabaseStore(client: SupabaseClient): CloudStore {
  return {
    async load(userId) {
      const { data, error } = await client.from('saves').select('data').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return (data?.data as CloudPayload | undefined) ?? null;
    },
    async save(userId, payload) {
      const { error } = await client
        .from('saves')
        .upsert({ user_id: userId, version: payload.version, data: payload, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
  };
}
