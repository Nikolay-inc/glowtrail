// Экран «Статистика»: сводка по уровням и кнопка «Скопировать» для плейтеста.

import Phaser from 'phaser';
import { LEVELS } from '../levels/index';
import { sfx } from '../audio';
import { fmtTime, loadLog, resetAll, statsText, summarize } from '../storage';
import { addBackground, Button, text } from '../ui/draw';
import { C, MONO, W } from '../ui/theme';

export class StatsScene extends Phaser.Scene {
  private confirmReset = false;

  constructor() {
    super('Stats');
  }

  create() {
    this.confirmReset = false;
    addBackground(this);
    this.cameras.main.fadeIn(200, 11, 15, 39);

    new Button(this, 90, 105, { w: 130, h: 130, icon: 'back', onClick: () => this.back() });
    text(this, W / 2, 105, 'Статистика', 70);

    const log = loadLog();
    const rows = summarize(log, LEVELS.length);
    const passed = rows.filter((r) => r.wins > 0).length;
    const totalMs = rows.reduce((s, r) => s + r.timeMs, 0);
    const attempts = rows.reduce((s, r) => s + r.attempts, 0);

    text(this, W / 2, 260, `Пройдено: ${passed} из ${LEVELS.length}`, 56);
    text(this, W / 2, 335, `Попыток: ${attempts}   Время: ${fmtTime(totalMs)}`, 40, C.textDim, false);

    const header = 'Ур Попыт Побед Звёзды  Время Помощь';
    const lines = rows.map((r) => {
      const stars = r.wins ? '★'.repeat(r.bestStars) + '·'.repeat(3 - r.bestStars) : r.skipped ? 'проп.' : '···';
      const help = r.hints + r.extras + r.eased;
      return `${String(r.level).padStart(2)} ${String(r.attempts).padStart(5)} ${String(r.wins).padStart(5)} ${stars.padStart(6)} ${fmtTime(r.timeMs).padStart(6)} ${String(help || '·').padStart(6)}`;
    });
    this.add.text(W / 2, 430, [header, ...lines].join('\n'), {
      fontFamily: MONO,
      fontSize: '40px',
      color: C.text,
      lineSpacing: 22,
    }).setOrigin(0.5, 0);

    const status = text(this, W / 2, 1560, '', 40, C.textDim, false);
    new Button(this, W / 2, 1420, {
      w: 640,
      h: 150,
      icon: 'copy',
      label: 'Скопировать',
      primary: true,
      onClick: async () => {
        const ok = await copyText(statsText(LEVELS.length));
        status.setText(ok ? 'Скопировано — отправь в чат плейтеста' : 'Не получилось — выдели текст и скопируй вручную');
        if (!ok) showTextFallback(statsText(LEVELS.length));
        sfx.tap();
      },
    });

    const reset = new Button(this, W / 2, 1720, {
      w: 520,
      h: 110,
      icon: 'trash',
      label: 'Сбросить всё',
      fontSize: 38,
      onClick: () => {
        if (!this.confirmReset) {
          this.confirmReset = true;
          status.setText('Нажми ещё раз, чтобы стереть прогресс и статистику');
          return;
        }
        resetAll();
        this.scene.restart();
      },
    });
    reset.setAlpha(0.8);
  }

  private back() {
    sfx.tap();
    this.scene.start('Menu');
  }
}

async function copyText(str: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(str);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Если буфер обмена недоступен — показываем текст поверх игры, чтобы скопировать руками. */
function showTextFallback(str: string) {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(6,8,24,.92);z-index:10;display:flex;flex-direction:column;padding:16px;gap:12px;';
  const ta = document.createElement('textarea');
  ta.value = str;
  ta.readOnly = true;
  ta.style.cssText = 'flex:1;font:12px monospace;background:#1a2150;color:#fff1cc;border:0;border-radius:12px;padding:12px;';
  const btn = document.createElement('button');
  btn.textContent = 'Закрыть';
  btn.style.cssText = 'font:bold 18px sans-serif;padding:14px;border:0;border-radius:12px;background:#ffb84d;';
  btn.onclick = () => wrap.remove();
  wrap.append(ta, btn);
  document.body.appendChild(wrap);
  ta.focus();
  ta.select();
}
