const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2] as const;
const checkCharacters = "10X98765432";

export function normalizePrcIdentityCard(value: string) {
  return value.replace(/\s/g, "").toUpperCase();
}

export function isValidPrcIdentityCard(value: string) {
  const normalized = normalizePrcIdentityCard(value);
  if (!/^\d{17}[\dX]$/.test(normalized) || normalized.startsWith("000000")) return false;

  const year = Number(normalized.slice(6, 10));
  const month = Number(normalized.slice(10, 12));
  const day = Number(normalized.slice(12, 14));
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  if (
    birthDate.getUTCFullYear() !== year
    || birthDate.getUTCMonth() !== month - 1
    || birthDate.getUTCDate() !== day
    || year < 1900
    || birthDate.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  ) return false;

  const sum = weights.reduce((total, weight, index) => total + Number(normalized[index]) * weight, 0);
  return normalized[17] === checkCharacters[sum % 11];
}

export function maskPrcIdentityCard(value: string) {
  const normalized = normalizePrcIdentityCard(value);
  return /^\d{17}[\dX]$/.test(normalized)
    ? `${normalized.slice(0, 6)}********${normalized.slice(-4)}`
    : "—";
}
