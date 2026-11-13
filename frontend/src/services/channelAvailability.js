/**
 * channelAvailability — pure helpers for the Option B delivery-availability UI.
 * LOGIC LAYER ONLY: no JSX, no fetch. Mirrors the wording of the backend
 * `build_delivery_plan()` so the pre-dispatch hint and the post-dispatch
 * `delivery_warning` tell the same story.
 */

export const CHANNEL_LABELS = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  voice: 'voice call',
};

const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

const joinLabels = (keys) => {
  const labels = keys.map((key) => CHANNEL_LABELS[key] || key);
  if (labels.length <= 1) return labels.join('');
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
};

export const channelLabel = (key) => CHANNEL_LABELS[key] || key;

/**
 * True when the backend says this channel can reach the patient. When the
 * availability payload is missing (loading, demo mode, or an error) we assume
 * reachable so the UI never raises a false alarm.
 */
export const isChannelReachable = (availability, key) => {
  const info = availability?.channels?.[key];
  return info ? Boolean(info.reachable) : true;
};

export const channelReason = (availability, key) =>
  availability?.channels?.[key]?.reason || null;

/**
 * Advisory sentence for the selected channels, or null when nothing is wrong.
 * Purely presentational: it never blocks dispatch.
 */
export const buildDeliveryWarning = (availability, selectedChannels = []) => {
  if (!availability?.channels) return null;
  const requested = selectedChannels.filter((key) => CHANNEL_LABELS[key]);
  if (requested.length === 0) return null;

  const unreachable = requested.filter((key) => !isChannelReachable(availability, key));
  if (unreachable.length === 0) return null;

  const reachable = requested.filter((key) => isChannelReachable(availability, key));
  if (reachable.length === 0) {
    return 'None of the selected channels can reach this patient — nothing will be delivered.';
  }
  return `${capitalize(joinLabels(unreachable))} cannot reach this patient — only ${joinLabels(reachable)} will be used.`;
};
