// Тексты заданий жителей: «Пройди 3 уровня», награда значками, имя жителя.

import type { Quest } from '../core/quests';
import { t, tk } from '../i18n';

export const questText = (q: Quest) => tk(`quest.${q.kind}`, { n: q.target });
export const questRewardText = (q: Quest) => ('coins' in q.reward ? t('reward.coins', { n: q.reward.coins }) : t('reward.light', { n: q.reward.light }));
export const residentName = (id: string) => tk(`resident.${id}`);
