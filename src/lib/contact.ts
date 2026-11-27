// The ONE public phone number for spiritmediapublishing.com.
// Kevin 2026-10-21 (memory feedback-public-address-and-phone): "use only 1-888-800-3744". Kevin 2026-11-27
// (kevin-decisions L3174): the number + a contact-us email link go in the footer and the contact spots.
// Change it HERE; the footer, /contact/ and the ContactPoint read it (Sanity siteSettings.phone no longer
// overrides it: one number, one place).
// Email is never printed: it stays a MailtoLink / the footer's Email Us button, and never goes in schema.
export const SMP_PHONE = '1-888-800-3744';
/** tel: href for SMP_PHONE ("tel:+18888003744"). */
export const SMP_PHONE_TEL = `tel:+${SMP_PHONE.replace(/\D/g, '')}`;
/** schema.org telephone form ("+1-888-800-3744"). */
export const SMP_PHONE_SCHEMA = `+${SMP_PHONE}`;
