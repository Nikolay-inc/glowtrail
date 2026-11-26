// Окна аккаунта поверх игры: вход, регистрация, «забыли пароль», новый пароль, управление аккаунтом.
// Это обычные HTML-формы (не Phaser): так работают менеджеры паролей, автозаполнение и клавиатура телефона.

import { t } from '../i18n';
import { Account, AccountError } from '../cloud/account';
import { PASSWORD_MIN, validateEmail, validatePassword, validatePasswordPair } from '../cloud/validate';
import { isolateFromGame } from './domIsolation';

export type AuthMode = 'login' | 'register' | 'forgot' | 'recovery' | 'change' | 'account';

const STYLE_ID = 'gt-auth-style';
const CSS = `
.gt-auth { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center;
  padding: max(24px, env(safe-area-inset-top)) 16px 16px; background: rgba(6, 8, 24, .78); overflow-y: auto;
  font-family: "Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif; }
.gt-auth__card { position: relative; width: 100%; max-width: 380px; margin-top: 4vh; background: #1a2150; color: #fff1cc;
  border: 3px solid #4a57a8; border-radius: 24px; padding: 22px 20px 20px; box-shadow: 0 10px 30px rgba(0,0,0,.45); }
.gt-auth h2 { margin: 0 0 14px; font-size: 24px; text-align: center; }
.gt-auth p { margin: 0 0 12px; font-size: 15px; line-height: 1.4; color: #c9cff2; text-align: center; }
.gt-auth__tabs { display: flex; gap: 6px; margin-bottom: 16px; background: #0f1436; border-radius: 14px; padding: 4px; }
.gt-auth__tabs button { flex: 1; border: 0; border-radius: 11px; padding: 10px 0; font: inherit; font-size: 16px; font-weight: bold;
  background: transparent; color: #9aa3d6; cursor: pointer; }
.gt-auth__tabs button[aria-selected="true"] { background: #2b3470; color: #fff1cc; }
.gt-auth label { display: block; font-size: 14px; color: #9aa3d6; margin: 10px 0 6px; }
.gt-auth input { width: 100%; box-sizing: border-box; font: inherit; font-size: 17px; color: #fff1cc; background: #0f1436;
  border: 2px solid #4a57a8; border-radius: 14px; padding: 12px 14px; outline: none; }
.gt-auth input:focus { border-color: #ffb84d; }
.gt-auth__pw { position: relative; }
.gt-auth__pw input { padding-right: 92px; }
.gt-auth__show { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 0; background: transparent;
  color: #9aa3d6; font: inherit; font-size: 14px; padding: 8px; cursor: pointer; }
.gt-auth__btn { display: block; width: 100%; margin-top: 16px; border: 0; border-radius: 16px; padding: 14px; font: inherit;
  font-size: 18px; font-weight: bold; cursor: pointer; background: #ffb84d; color: #2a1a05; box-shadow: 0 4px 0 #d98a1f; }
.gt-auth__btn:disabled { opacity: .6; cursor: default; }
.gt-auth__btn--ghost { background: #2b3470; color: #fff1cc; box-shadow: 0 4px 0 #161c46; }
.gt-auth__btn--danger { background: #d9534f; color: #fff; box-shadow: 0 4px 0 #a33a37; }
.gt-auth__link { display: block; margin: 14px auto 0; border: 0; background: transparent; color: #9aa3d6; font: inherit;
  font-size: 15px; text-decoration: underline; cursor: pointer; }
.gt-auth__msg { min-height: 20px; margin-top: 12px; font-size: 15px; text-align: center; }
.gt-auth__msg--error { color: #ff8a8a; }
.gt-auth__msg--ok { color: #8ef0c8; }
.gt-auth__close { position: absolute; right: 10px; top: 8px; border: 0; background: transparent; color: #9aa3d6;
  font-size: 28px; line-height: 1; padding: 6px 10px; cursor: pointer; }
.gt-auth__hint { font-size: 13px; color: #7f88bd; margin-top: 6px; }
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...children: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = String(v);
    else if (k.startsWith('aria-') || k === 'autocomplete' || k === 'inputmode' || k === 'role') e.setAttribute(k, String(v));
    else (e as unknown as Record<string, unknown>)[k] = v;
  }
  e.append(...children);
  return e;
}

function passwordField(id: string, label: string, autocomplete: string) {
  const input = el('input', { id, type: 'password', autocomplete: autocomplete as AutoFill, required: true, minLength: PASSWORD_MIN, maxLength: 72 });
  const show = el('button', { type: 'button', class: 'gt-auth__show', textContent: t('pw_show') });
  show.addEventListener('click', () => {
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    show.textContent = hidden ? t('pw_hide') : t('pw_show');
  });
  return { input, node: el('div', {}, el('label', { htmlFor: id, textContent: label }), el('div', { class: 'gt-auth__pw' }, input, show)) };
}

let current: { close: () => void } | null = null;

/**
 * Открывает окно аккаунта. onClose вызывается при закрытии (после входа/выхода — чтобы экран обновился).
 * Повторный вызов заменяет открытое окно.
 */
export function openAuthDialog(
  mode: AuthMode,
  opts: {
    onClose?: () => void;
    email?: string;
    message?: { text: string; ok?: boolean };
    /** Заголовок и пояснение вместо стандартных (например, «Сохрани прогресс» после первой победы). */
    intro?: { title: string; text: string };
    /** Показать ссылку «Позже» под формой. */
    later?: boolean;
  } = {},
) {
  ensureStyle();
  current?.close();
  const root = el('div', { class: 'gt-auth', role: 'dialog', 'aria-modal': 'true' });
  const card = el('div', { class: 'gt-auth__card' });
  root.append(card);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // Закрываем по завершённому клику на фон: к этому моменту и нажатие, и отпускание уже пойманы окном.
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  // Клики и клавиши из окна не доходят до игры (иначе срабатывают игровые кнопки под формой).
  isolateFromGame(root);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    root.remove();
    current = null;
    opts.onClose?.();
  };
  current = { close };

  const render = (m: AuthMode, email = opts.email ?? '', message?: { text: string; ok?: boolean }) => {
    card.replaceChildren();
    card.append(el('button', { type: 'button', class: 'gt-auth__close', 'aria-label': t('close'), textContent: '×', onclick: close }));
    const msg = el('div', { class: 'gt-auth__msg', role: 'status' });
    const say = (text: string, ok = false) => {
      msg.textContent = text;
      msg.className = `gt-auth__msg ${ok ? 'gt-auth__msg--ok' : 'gt-auth__msg--error'}`;
    };
    if (message) say(message.text, message.ok);

    if (!Account.configured) {
      card.append(
        el('h2', { textContent: t('account') }),
        el('p', { textContent: t('auth_no_server') }),
        el('button', { type: 'button', class: 'gt-auth__btn gt-auth__btn--ghost', textContent: t('rule_ok'), onclick: close }),
      );
      return;
    }

    // Обёртка для кнопок отправки: блокируем повторное нажатие, показываем ошибку.
    const run = async (btn: HTMLButtonElement, fn: () => Promise<void>) => {
      btn.disabled = true;
      say('');
      try {
        await fn();
      } catch (e) {
        say(e instanceof AccountError ? e.message : t('e_generic'));
      } finally {
        btn.disabled = false;
      }
    };

    if (m === 'login' || m === 'register') {
      const tabs = el(
        'div',
        { class: 'gt-auth__tabs', role: 'tablist' },
        el('button', { type: 'button', role: 'tab', 'aria-selected': String(m === 'login'), textContent: t('auth_login_tab'), onclick: () => render('login', emailIn.value) }),
        el('button', { type: 'button', role: 'tab', 'aria-selected': String(m === 'register'), textContent: t('auth_register_tab'), onclick: () => render('register', emailIn.value) }),
      );
      const emailIn = el('input', { id: 'gt-email', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: email, maxLength: 254 });
      const pw = passwordField('gt-pw', t('auth_password'), m === 'login' ? 'current-password' : 'new-password');
      const pw2 = m === 'register' ? passwordField('gt-pw2', t('auth_password_again'), 'new-password') : null;
      const submit = el('button', { type: 'submit', class: 'gt-auth__btn', textContent: m === 'login' ? t('login') : t('auth_register') });
      const form = el('form', { noValidate: true }, el('label', { htmlFor: 'gt-email', textContent: 'Email' }), emailIn, pw.node);
      if (pw2) form.append(pw2.node, el('div', { class: 'gt-auth__hint', textContent: t('auth_pw_min', { n: PASSWORD_MIN }) }));
      form.append(submit, msg);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = validateEmail(emailIn.value) ?? (pw2 ? validatePasswordPair(pw.input.value, pw2.input.value) : validatePassword(pw.input.value));
        if (err) return say(err);
        void run(submit, async () => {
          if (m === 'login') {
            await Account.signIn(emailIn.value, pw.input.value);
            close();
          } else {
            const res = await Account.signUp(emailIn.value, pw.input.value);
            if (res === 'signed_in') close();
            else render('login', emailIn.value, { text: t('auth_mail_sent', { email: emailIn.value.trim() }), ok: true });
          }
        });
      });
      if (opts.intro) card.append(el('h2', { textContent: opts.intro.title }), el('p', { textContent: opts.intro.text }));
      else {
        card.append(el('h2', { textContent: m === 'login' ? t('auth_login_tab') : t('auth_register_tab') }));
        if (m === 'register') card.append(el('p', { textContent: t('auth_register_note') }));
      }
      card.append(tabs, form);
      if (m === 'login') card.append(el('button', { type: 'button', class: 'gt-auth__link', textContent: t('auth_forgot'), onclick: () => render('forgot', emailIn.value) }));
      if (opts.later) card.append(el('button', { type: 'button', class: 'gt-auth__link', textContent: t('later'), onclick: close }));
      setTimeout(() => (emailIn.value ? pw.input : emailIn).focus(), 50);
      return;
    }

    if (m === 'forgot') {
      const emailIn = el('input', { id: 'gt-email', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, value: email });
      const submit = el('button', { type: 'submit', class: 'gt-auth__btn', textContent: t('auth_send_link') });
      const form = el('form', { noValidate: true }, el('label', { htmlFor: 'gt-email', textContent: 'Email' }), emailIn, submit, msg);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = validateEmail(emailIn.value);
        if (err) return say(err);
        void run(submit, async () => {
          await Account.requestPasswordReset(emailIn.value);
          say(t('auth_reset_sent'), true);
        });
      });
      card.append(
        el('h2', { textContent: t('auth_new_password') }),
        el('p', { textContent: t('auth_reset_note') }),
        form,
        el('button', { type: 'button', class: 'gt-auth__link', textContent: t('auth_back_login'), onclick: () => render('login', emailIn.value) }),
      );
      setTimeout(() => emailIn.focus(), 50);
      return;
    }

    if (m === 'recovery' || m === 'change') {
      const pw = passwordField('gt-pw', t('auth_new_password'), 'new-password');
      const pw2 = passwordField('gt-pw2', t('auth_again'), 'new-password');
      const submit = el('button', { type: 'submit', class: 'gt-auth__btn', textContent: t('auth_save_password') });
      // Скрытое поле email помогает менеджеру паролей понять, к какому аккаунту пароль.
      const hiddenEmail = el('input', { type: 'email', autocomplete: 'username', value: Account.user?.email ?? '', hidden: true });
      const form = el('form', { noValidate: true }, hiddenEmail, pw.node, pw2.node, el('div', { class: 'gt-auth__hint', textContent: t('auth_pw_min', { n: PASSWORD_MIN }) }), submit, msg);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const err = validatePasswordPair(pw.input.value, pw2.input.value);
        if (err) return say(err);
        void run(submit, async () => {
          await Account.updatePassword(pw.input.value);
          render('account', '', { text: t('auth_pw_updated'), ok: true });
        });
      });
      card.append(el('h2', { textContent: m === 'recovery' ? t('auth_set_new_password') : t('auth_change_password') }), form);
      setTimeout(() => pw.input.focus(), 50);
      return;
    }

    // m === 'account'
    if (!Account.user) return render('login');
    const status: Record<string, string> = {
      synced: t('sync_synced'),
      syncing: t('sync_syncing'),
      offline: t('sync_offline'),
      off: '',
    };
    const logout = el('button', { type: 'button', class: 'gt-auth__btn gt-auth__btn--ghost', textContent: t('auth_logout') });
    logout.addEventListener('click', () =>
      void run(logout, async () => {
        await Account.signOut();
        close();
      }),
    );
    card.append(
      el('h2', { textContent: t('account') }),
      el('p', { textContent: t('auth_logged_as', { email: Account.user.email ?? t('auth_player') }) }),
      ...(status[Account.syncStatus] ? [el('p', { textContent: status[Account.syncStatus] })] : []),
      el('button', { type: 'button', class: 'gt-auth__btn gt-auth__btn--ghost', textContent: t('auth_change_password'), onclick: () => render('change') }),
      logout,
      el('button', { type: 'button', class: 'gt-auth__link', textContent: t('auth_delete'), onclick: () => renderDelete() }),
      msg,
    );
  };

  const renderDelete = () => {
    card.replaceChildren();
    const msg = el('div', { class: 'gt-auth__msg gt-auth__msg--error', role: 'status' });
    const confirmBtn = el('button', { type: 'button', class: 'gt-auth__btn gt-auth__btn--danger', textContent: t('auth_delete_forever') });
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      try {
        await Account.deleteAccount();
        close();
      } catch (e) {
        msg.textContent = e instanceof AccountError ? e.message : t('auth_delete_failed');
        confirmBtn.disabled = false;
      }
    });
    card.append(
      el('button', { type: 'button', class: 'gt-auth__close', 'aria-label': t('close'), textContent: '×', onclick: close }),
      el('h2', { textContent: t('auth_delete_q') }),
      el('p', { textContent: t('auth_delete_text', { email: Account.user?.email ?? '' }) }),
      confirmBtn,
      el('button', { type: 'button', class: 'gt-auth__btn gt-auth__btn--ghost', textContent: t('auth_keep'), onclick: () => render('account') }),
      msg,
    );
  };

  render(mode, opts.email, opts.message);
  document.body.appendChild(root);
  return close;
}

export function isAuthDialogOpen() {
  return current !== null;
}
