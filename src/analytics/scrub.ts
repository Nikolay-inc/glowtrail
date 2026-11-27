// Без персональных данных в отчётах об ошибках: адреса почты в любом месте события заменяются на [email].

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function scrubText(s: string): string {
  return s.replace(EMAIL, '[email]');
}

/** Рекурсивно чистит строки в объекте (событие Sentry, хлебная крошка). Глубина ограничена. */
export function scrubEmails<T>(v: T, depth = 0): T {
  if (typeof v === 'string') return scrubText(v) as T;
  if (depth > 8 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => scrubEmails(x, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = scrubEmails(x, depth + 1);
  return out as T;
}
