import { useCallback } from 'react';
import { ru, type MessageKey } from './ru';
import { en } from './en';
import { kk } from './kk';
import { useUiStore } from '@/store/ui';

export type Lang = 'ru' | 'en' | 'kk';
export type { MessageKey };
export type Vars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: Vars) => string;

const DICTIONARIES: Readonly<Record<Lang, Readonly<Record<MessageKey, string>>>> = { ru, en, kk };

/** Look up `key` and substitute `{name}` placeholders. */
export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text = DICTIONARIES[lang][key];
  return vars ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`)) : text;
}

/** Message keys that come in plural forms (`<base>.one | .few | .many`). */
export type PluralBase = { [K in MessageKey]: K extends `${infer B}.one` ? B : never }[MessageKey];

/** CLDR plural form → our three dictionary forms (Russian one / few / many; English one / other). */
export function translatePlural(lang: Lang, base: PluralBase, n: number): string {
  const rule = new Intl.PluralRules(lang).select(n);
  const form = rule === 'one' ? 'one' : rule === 'few' ? 'few' : 'many';
  return translate(lang, `${base}.${form}` as MessageKey, { n });
}

/** Translator bound to the current UI language. */
export function useT(): Translate {
  const lang = useUiStore(s => s.lang);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}

/** Plural-aware translator bound to the current UI language. */
export function usePlural(): (base: PluralBase, n: number) => string {
  const lang = useUiStore(s => s.lang);
  return useCallback((base, n) => translatePlural(lang, base, n), [lang]);
}
