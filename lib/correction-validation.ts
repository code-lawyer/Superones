export type CorrectionField = "recordId" | "pageUrl" | "description" | "evidenceUrl" | "email";
export type CorrectionFieldErrors = Partial<Record<CorrectionField, string>>;

export type CorrectionFields = Record<CorrectionField, string>;

function webUrl(value: string, httpsOnly = false) {
  try {
    const url = new URL(value);
    return httpsOnly ? url.protocol === "https:" : url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function validateCorrectionFields(fields: CorrectionFields): CorrectionFieldErrors {
  const errors: CorrectionFieldErrors = {};
  const recordId = fields.recordId.trim();
  const pageUrl = fields.pageUrl.trim();
  const description = fields.description.trim();
  const evidenceUrl = fields.evidenceUrl.trim();
  const email = fields.email.trim();

  if (!recordId || recordId.length > 180) {
    errors.recordId = "请输入页面中的记录号或可明确定位问题的标识。";
  }
  if (pageUrl && (pageUrl.length > 500 || !webUrl(pageUrl))) {
    errors.pageUrl = "请输入以 http:// 或 https:// 开头的完整页面地址。";
  }
  if (description.length < 12 || description.length > 1_500) {
    errors.description = "请用 12–1500 个字符说明具体错误、所在位置和应如何更正。";
  }
  if (!evidenceUrl || !webUrl(evidenceUrl, true)) {
    errors.evidenceUrl = "请输入以 https:// 开头、可直接核验的原始依据地址。";
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "请输入有效邮箱，或将此项留空。";
  }
  return errors;
}
