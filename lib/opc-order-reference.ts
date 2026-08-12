export const OPC_ORDER_REFERENCE_PATTERN = /^OPC-\d{8}-[0-9A-F]{12}$/;

export function normalizeOpcOrderReference(value: string) {
  return value.trim().toUpperCase();
}

export function isValidOpcOrderReference(value: string) {
  return OPC_ORDER_REFERENCE_PATTERN.test(normalizeOpcOrderReference(value));
}
