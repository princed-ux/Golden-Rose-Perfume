// Temporary employee credentials are deliberately separate from customer signup policy.
export function strongEmployeePassword(value: FormDataEntryValue | null): value is string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 72 ||
      new TextEncoder().encode(value).length > 72 || value.trim() !== value) return false;
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value);
}

export const employeePasswordHint = 'Use 12 or more characters with an uppercase letter, lowercase letter, number and symbol. Maximum 72 bytes.';
