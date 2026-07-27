export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function focusFirstInvalidField<Field extends string>(
  fieldOrder: readonly Field[],
  errors: Partial<Record<Field, string>>,
) {
  const firstField = fieldOrder.find((field) => Boolean(errors[field]));
  if (!firstField) return;

  requestAnimationFrame(() => document.getElementById(firstField)?.focus());
}

export function clearFieldError<Field extends string>(
  errors: Partial<Record<Field, string>>,
  field: Field,
) {
  if (!errors[field]) return errors;
  return { ...errors, [field]: undefined };
}
