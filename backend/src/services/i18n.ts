/**
 * Server-side translation for outgoing notification text.
 *
 * Why server-side: push notifications are rendered by iOS/Android at the
 * lock-screen level using whatever text the backend sends. The recipient's
 * phone language doesn't control it — the backend has to send the right
 * language for each user.
 *
 * Cleaning industry: huge percentage of UK/IE commercial cleaners are
 * non-English speakers. Polish, Portuguese, Romanian, Lithuanian, Spanish
 * cover ~80% of the market. Add more locales as customers ask.
 *
 * Usage:
 *   const title = t(user.locale, "alert.spill.title");
 *   const body  = t(user.locale, "alert.spill.body", { zone: "Floor 2 lobby" });
 *
 * Translation files are inlined here (small enough). If translations grow
 * past ~50 keys, move each locale to a separate JSON file under translations/.
 */

type Args = Record<string, string | number>;

const STRINGS = {
  // English (default fallback for any missing key in another locale).
  "en-GB": {
    "alert.spill.title": "Spill alert",
    "alert.spill.body": "Sign lifted at {zone}",
    "alert.acknowledged.title": "Acknowledged",
    "alert.acknowledged.body": "{cleaner} is on the way to {zone}",
    "alert.resolved.title": "Resolved",
    "alert.resolved.body": "{zone} cleared by {cleaner}",
    "alert.low_battery.title": "Hanger battery low",
    "alert.low_battery.body": "{hanger} battery at {pct}% (threshold {threshold}%)",
    "alert.cleaning_reminder.title": "Time to put the sign back",
    "alert.cleaning_reminder.body": "Your expected cleaning time of {minutes} min has passed.",
    "dispatch.received.title": "Dispatch for {cleaner}",
    "dispatch.received.body": "{zone}: {message}",
    "dispatch.accepted.title": "Dispatch accepted",
    "dispatch.accepted.body": "{cleaner} is on the way",
    "dispatch.completed.title": "Dispatch completed",
    "dispatch.completed.body": "{cleaner} completed at {zone}",
  },
  pl: {
    "alert.spill.title": "Alert rozlania",
    "alert.spill.body": "Znak podniesiony w {zone}",
    "alert.acknowledged.title": "Potwierdzono",
    "alert.acknowledged.body": "{cleaner} jest w drodze do {zone}",
    "alert.resolved.title": "Rozwiązano",
    "alert.resolved.body": "{zone} sprzątnięte przez {cleaner}",
    "alert.low_battery.title": "Niski poziom baterii wieszaka",
    "alert.low_battery.body": "Bateria {hanger} na poziomie {pct}% (próg {threshold}%)",
    "alert.cleaning_reminder.title": "Czas odstawić znak",
    "alert.cleaning_reminder.body": "Twój oczekiwany czas sprzątania {minutes} min minął.",
    "dispatch.received.title": "Zlecenie dla {cleaner}",
    "dispatch.received.body": "{zone}: {message}",
    "dispatch.accepted.title": "Zlecenie przyjęte",
    "dispatch.accepted.body": "{cleaner} jest w drodze",
    "dispatch.completed.title": "Zlecenie zakończone",
    "dispatch.completed.body": "{cleaner} ukończył w {zone}",
  },
  "pt-BR": {
    "alert.spill.title": "Alerta de derramamento",
    "alert.spill.body": "Placa retirada em {zone}",
    "alert.acknowledged.title": "Reconhecido",
    "alert.acknowledged.body": "{cleaner} está a caminho de {zone}",
    "alert.resolved.title": "Resolvido",
    "alert.resolved.body": "{zone} limpo por {cleaner}",
    "alert.low_battery.title": "Bateria do gancho fraca",
    "alert.low_battery.body": "Bateria de {hanger} em {pct}% (limite {threshold}%)",
    "alert.cleaning_reminder.title": "Hora de devolver a placa",
    "alert.cleaning_reminder.body": "Seu tempo esperado de limpeza de {minutes} min passou.",
    "dispatch.received.title": "Despacho para {cleaner}",
    "dispatch.received.body": "{zone}: {message}",
    "dispatch.accepted.title": "Despacho aceito",
    "dispatch.accepted.body": "{cleaner} está a caminho",
    "dispatch.completed.title": "Despacho concluído",
    "dispatch.completed.body": "{cleaner} concluiu em {zone}",
  },
  es: {
    "alert.spill.title": "Alerta de derrame",
    "alert.spill.body": "Cartel levantado en {zone}",
    "alert.acknowledged.title": "Confirmado",
    "alert.acknowledged.body": "{cleaner} va camino a {zone}",
    "alert.resolved.title": "Resuelto",
    "alert.resolved.body": "{zone} limpiado por {cleaner}",
    "alert.low_battery.title": "Batería del colgador baja",
    "alert.low_battery.body": "Batería de {hanger} al {pct}% (umbral {threshold}%)",
    "alert.cleaning_reminder.title": "Hora de devolver el cartel",
    "alert.cleaning_reminder.body": "Tu tiempo de limpieza esperado de {minutes} min ha pasado.",
    "dispatch.received.title": "Despacho para {cleaner}",
    "dispatch.received.body": "{zone}: {message}",
    "dispatch.accepted.title": "Despacho aceptado",
    "dispatch.accepted.body": "{cleaner} va de camino",
    "dispatch.completed.title": "Despacho completado",
    "dispatch.completed.body": "{cleaner} completó en {zone}",
  },
  ro: {
    "alert.spill.title": "Alertă vărsare",
    "alert.spill.body": "Semn ridicat la {zone}",
    "alert.acknowledged.title": "Confirmat",
    "alert.acknowledged.body": "{cleaner} este pe drum spre {zone}",
    "alert.resolved.title": "Rezolvat",
    "alert.resolved.body": "{zone} curățat de {cleaner}",
    "alert.low_battery.title": "Baterie suport scăzută",
    "alert.low_battery.body": "Baterie {hanger} la {pct}% (prag {threshold}%)",
    "alert.cleaning_reminder.title": "E timpul să pui semnul înapoi",
    "alert.cleaning_reminder.body": "Timpul tău estimat de curățare de {minutes} min a trecut.",
    "dispatch.received.title": "Sarcină pentru {cleaner}",
    "dispatch.received.body": "{zone}: {message}",
    "dispatch.accepted.title": "Sarcină acceptată",
    "dispatch.accepted.body": "{cleaner} este pe drum",
    "dispatch.completed.title": "Sarcină finalizată",
    "dispatch.completed.body": "{cleaner} a finalizat la {zone}",
  },
  lt: {
    "alert.spill.title": "Išsiliejimo įspėjimas",
    "alert.spill.body": "Ženklas paimtas {zone}",
    "alert.acknowledged.title": "Patvirtinta",
    "alert.acknowledged.body": "{cleaner} eina į {zone}",
    "alert.resolved.title": "Išspręsta",
    "alert.resolved.body": "{zone} sutvarkė {cleaner}",
    "alert.low_battery.title": "Pakabinimo baterija silpna",
    "alert.low_battery.body": "{hanger} baterija {pct}% (riba {threshold}%)",
    "alert.cleaning_reminder.title": "Laikas grąžinti ženklą",
    "alert.cleaning_reminder.body": "Jūsų numatytas valymo laikas {minutes} min praėjo.",
    "dispatch.received.title": "Užduotis {cleaner}",
    "dispatch.received.body": "{zone}: {message}",
    "dispatch.accepted.title": "Užduotis priimta",
    "dispatch.accepted.body": "{cleaner} pakeliui",
    "dispatch.completed.title": "Užduotis baigta",
    "dispatch.completed.body": "{cleaner} baigė {zone}",
  },
} as const;

type Locale = keyof typeof STRINGS;
type Key = keyof typeof STRINGS["en-GB"];

const SUPPORTED_LOCALES = Object.keys(STRINGS) as Locale[];

function resolveLocale(localeRaw: string | null | undefined): Locale {
  if (!localeRaw) return "en-GB";
  // Direct match.
  if ((SUPPORTED_LOCALES as string[]).includes(localeRaw)) return localeRaw as Locale;
  // Fall back to language-only match — "pl-PL" → "pl", "pt-PT" → "pt-BR".
  // split() always yields at least one element so [0] is non-null at runtime,
  // but tsconfig's noUncheckedIndexedAccess forces us to assert it.
  const lang = localeRaw.split("-")[0] ?? "";
  if ((SUPPORTED_LOCALES as string[]).includes(lang)) return lang as Locale;
  if (lang === "pt") return "pt-BR";
  return "en-GB";
}

/**
 * Translate a string for a given user locale, interpolating {var} placeholders.
 * Falls back to English if the key is missing in the target locale, then to
 * the raw key string if it's missing in English too (would be a bug).
 */
export function t(locale: string | null | undefined, key: Key, args: Args = {}): string {
  const resolved = resolveLocale(locale);
  const table = STRINGS[resolved] as Record<string, string>;
  let template = table[key];
  if (!template) {
    template = (STRINGS["en-GB"] as Record<string, string>)[key];
  }
  if (!template) {
    return key;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    return args[name] !== undefined ? String(args[name]) : `{${name}}`;
  });
}
