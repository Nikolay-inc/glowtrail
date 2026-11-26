// Состояние заданий жителей (типы, нормализация, слияние с облаком). Логика — src/core/quests.ts.

export type QuestKind = 'win' | 'stars' | 'three' | 'fireflies' | 'improve' | 'tiles' | 'jump' | 'stash' | 'nohint' | 'night' | 'turnbridge' | 'fade';
export const QUEST_KINDS: readonly QuestKind[] = ['win', 'stars', 'three', 'fireflies', 'improve', 'tiles', 'jump', 'stash', 'nohint', 'night', 'turnbridge', 'fade'];

export interface Quest {
  /** Уникален в пределах дня/недели (для замены и слияния). */
  id: string;
  kind: QuestKind;
  target: number;
  progress: number;
  /** Награда: монеты или свет; у большого задания недели — ещё сундук. */
  reward: { coins: number } | { light: number };
  chest?: boolean;
  /** Кто дал задание (id постройки — житель). */
  resident: string;
  claimed: boolean;
}

export interface QuestState {
  /** День ежедневных заданий (YYYY-MM-DD) и сами задания. */
  day: string;
  daily: Quest[];
  /** Сколько замен (совиная почта) использовано сегодня. */
  rerolls: number;
  /** Неделя (понедельник YYYY-MM-DD) и большое задание. */
  week: string;
  weekly: Quest | null;
}

export const defaultQuests = (): QuestState => ({ day: '', daily: [], rerolls: 0, week: '', weekly: null });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

function normalizeQuest(raw: unknown): Quest | null {
  if (!isObj(raw) || !QUEST_KINDS.includes(raw.kind as QuestKind)) return null;
  const r = isObj(raw.reward) ? raw.reward : {};
  const reward = 'light' in r ? { light: num(r.light) } : { coins: num(r.coins) };
  const target = Math.max(1, num(raw.target));
  return {
    id: str(raw.id) || String(raw.kind),
    kind: raw.kind as QuestKind,
    target,
    progress: Math.min(target, num(raw.progress)),
    reward,
    chest: raw.chest === true || undefined,
    resident: str(raw.resident) || 'well',
    claimed: raw.claimed === true,
  };
}

export function normalizeQuests(raw: unknown): QuestState {
  const q = defaultQuests();
  if (!isObj(raw)) return q;
  q.day = str(raw.day);
  q.daily = Array.isArray(raw.daily) ? raw.daily.map(normalizeQuest).filter((x): x is Quest => !!x).slice(0, 3) : [];
  q.rerolls = num(raw.rerolls);
  q.week = str(raw.week);
  q.weekly = normalizeQuest(raw.weekly);
  return q;
}

/** Одно и то же задание на двух устройствах: прогресс — максимум, «забрано» — если забрано где-то. */
function mergeQuest(a: Quest, b: Quest | undefined): Quest {
  if (!b || b.id !== a.id) return a;
  return { ...a, progress: Math.max(a.progress, b.progress), claimed: a.claimed || b.claimed };
}

export function mergeQuests(local: QuestState, cloud: QuestState): QuestState {
  const day = local.day >= cloud.day ? local : cloud;
  const other = day === local ? cloud : local;
  const week = local.week >= cloud.week ? local : cloud;
  const otherW = week === local ? cloud : local;
  return {
    day: day.day,
    daily: day.daily.map((x) => mergeQuest(x, other.day === day.day ? other.daily.find((y) => y.id === x.id) : undefined)),
    rerolls: other.day === day.day ? Math.max(day.rerolls, other.rerolls) : day.rerolls,
    week: week.week,
    weekly: week.weekly ? mergeQuest(week.weekly, otherW.week === week.week ? (otherW.weekly ?? undefined) : undefined) : null,
  };
}
