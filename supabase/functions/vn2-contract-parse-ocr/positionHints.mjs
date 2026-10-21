// Fachlich vorsichtige Kandidatenerkennung: keine Preise aus Datumsangaben oder Positionsnummern erraten.
// Nur explizite EUR/€-Belege werden als unverbindliche POSITION_HINTs übernommen.
const CURRENCY_PRICE = /(?:\bEUR\s*|€\s*)(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})(?![\d.,])|(\d{1,3}(?:\.\d{3})+,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*(?:\bEUR\b|€)/gi;
const CODE = /\b(\d{2}\.\d{2}\.\d{2}\.\d{1,4})\b/;

export function parseEuroWithCurrency(line) {
  const matches = [...String(line || "").matchAll(CURRENCY_PRICE)];
  if (!matches.length) return null;
  const matched = matches[matches.length - 1];
  const raw = matched[1] || matched[2];
  const value = Number(raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw);
  if (!Number.isFinite(value) || value < 0) return null;
  return { value, matchedText: matched[0] };
}

export function extractExplicitPositionHint(rawLine) {
  const line = String(rawLine || "").replace(/\s+/g, " ").trim();
  const codeMatch = line.match(CODE);
  if (!codeMatch) return null;
  const code = codeMatch[1];
  const withoutCode = line.replace(code, " ");
  const price = parseEuroWithCurrency(withoutCode);
  if (!price) return null;
  const name = withoutCode.replace(price.matchedText, " ").replace(/\s+/g, " ").trim();
  return { code, price: price.value, name };
}
