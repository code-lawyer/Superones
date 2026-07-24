export function encodeFeedSlug(slug: string) {
  return encodeURIComponent(slug.normalize("NFKC"));
}

export function decodeFeedSlug(value: string) {
  try {
    return decodeURIComponent(value).normalize("NFKC");
  } catch {
    return value.normalize("NFKC");
  }
}

export function informationHref(slug: string) {
  return `/feed/info/${encodeFeedSlug(slug)}`;
}

export function matchesFeedSlug(storedSlug: string, routeSlug: string) {
  return storedSlug.normalize("NFKC") === decodeFeedSlug(routeSlug);
}
