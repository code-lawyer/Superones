export function isOfficialEsignHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "esign.cn" || normalized.endsWith(".esign.cn");
}

export function isOfficialEsignUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isOfficialEsignHost(url.hostname);
  } catch {
    return false;
  }
}
