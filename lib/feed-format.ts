import type { EventCategory, EventRecord, InformationItem } from "./types";

const legacyCategoryMap: Record<string, EventCategory> = {
  公司公告: "公司与市场",
  人物观点: "公司与市场",
  播客: "研究与能力",
  研究文章: "研究与能力",
};

export function eventCategory(event: EventRecord): EventCategory {
  return legacyCategoryMap[event.category] ?? event.category as EventCategory;
}

export function eventJudgment(event: EventRecord) {
  return event.judgment || event.significance;
}

function normalizedDate(value: string) {
  return value.replace(
    /^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?:\s+CST)?$/,
    "$1-$2-$3T$4:$5:00+08:00",
  );
}

function dateParts(value: string | null) {
  if (!value) return null;
  const date = new Date(normalizedDate(value));
  if (Number.isNaN(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function beijingDate(value: string | null) {
  const parts = dateParts(value);
  return parts ? `${parts.year}.${parts.month}.${parts.day}` : "时间未注明";
}

export function beijingTime(value: string | null, detailed = false) {
  const parts = dateParts(value);
  if (!parts) return "时间未注明";
  return detailed
    ? `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute} UTC+8`
    : `${parts.month}.${parts.day} · ${parts.hour}:${parts.minute}`;
}

export function informationTime(item: InformationItem, detailed = false) {
  return beijingTime(item.publishedAt, detailed);
}

export function compareInformationNewest(left: InformationItem, right: InformationItem) {
  const leftTime = Date.parse(left.publishedAt ?? left.discoveredAt);
  const rightTime = Date.parse(right.publishedAt ?? right.discoveredAt);
  return rightTime - leftTime;
}

export function compareEventsNewest(left: EventRecord, right: EventRecord) {
  return Date.parse(normalizedDate(right.updated)) - Date.parse(normalizedDate(left.updated));
}
