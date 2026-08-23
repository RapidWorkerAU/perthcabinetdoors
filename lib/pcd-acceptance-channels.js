// HOW A CUSTOMER SAID YES, when they did not press the button themselves.
//
// Kept apart from lib/pcd-quote-acceptance.js on purpose. That module raises the
// order, so it reaches node:crypto through the order number generator and can
// never be bundled into a browser. The modal that asks the question is a client
// component and only needs the list, so the list lives here where both sides can
// have it.
//
// Recorded rather than assumed. An acceptance with no record of how it was given
// is indistinguishable from somebody pressing the wrong button.

export const ACCEPTANCE_CHANNELS = [
  { key: "phone", label: "Over the phone" },
  { key: "email", label: "By email" },
  { key: "in_person", label: "In person" },
  { key: "other", label: "Some other way" },
];

export const ACCEPTANCE_CHANNEL_KEYS = ACCEPTANCE_CHANNELS.map((entry) => entry.key);

export function acceptanceChannelLabel(key) {
  return ACCEPTANCE_CHANNELS.find((entry) => entry.key === key)?.label || "Some other way";
}
