/**
 * phoneUtils — E.164 normalization (default Nigeria +234) and display formatting.
 * LOGIC LAYER: pure functions, no JSX.
 */

export const normalizeE164 = (raw, countryCode = '+234') => {
  const cleaned = String(raw || '').replace(/[\s\-().]/g, '');
  if (!cleaned) return { value: '', valid: false };

  const ccDigits = countryCode.replace('+', '');
  let value;

  if (cleaned.startsWith('+')) {
    value = `+${cleaned.slice(1).replace(/\D/g, '')}`;
  } else if (cleaned.startsWith('00')) {
    value = `+${cleaned.slice(2).replace(/\D/g, '')}`;
  } else if (cleaned.startsWith('0')) {
    value = `${countryCode}${cleaned.slice(1).replace(/\D/g, '')}`;
  } else if (cleaned.startsWith(ccDigits)) {
    value = `+${cleaned.replace(/\D/g, '')}`;
  } else {
    value = `${countryCode}${cleaned.replace(/\D/g, '')}`;
  }

  let valid = /^\+[1-9]\d{7,14}$/.test(value);
  // Nigerian numbers are +234 followed by exactly 10 digits
  if (valid && value.startsWith('+234')) valid = value.length === 14;

  return { value, valid };
};

export const formatPhoneDisplay = (e164) => {
  if (!e164) return '';
  if (e164.startsWith('+234') && e164.length === 14) {
    return `+234 ${e164.slice(4, 7)} ${e164.slice(7, 10)} ${e164.slice(10)}`;
  }
  return e164;
};

/**
 * matchesPhone — Flexible phone number search helper.
 * Matches local Nigerian format (e.g. 0803...) with international (+234803...)
 * and raw digit sequences regardless of spaces, dashes, or prefixes.
 */
export const matchesPhone = (targetPhone, query) => {
  if (!targetPhone || !query) return false;
  const targetStr = String(targetPhone).toLowerCase();
  const queryStr = String(query).toLowerCase().trim();

  // 1. Direct text substring
  if (targetStr.includes(queryStr)) return true;

  // 2. Digits-only matching
  const targetDigits = targetStr.replace(/\D/g, '');
  const queryDigits = queryStr.replace(/\D/g, '');

  if (!queryDigits) return false;

  // Direct digits match (e.g. searching '5550192' in '2348035550192')
  if (targetDigits.includes(queryDigits)) return true;

  // 3. National core digits (strip leading '234' or leading '0')
  const targetCore = targetDigits.replace(/^(234|0)/, '');
  const queryCore = queryDigits.replace(/^(234|0)/, '');

  if (queryCore.length >= 2 && targetCore.includes(queryCore)) {
    return true;
  }

  return false;
};

