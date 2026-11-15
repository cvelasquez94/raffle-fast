// Validadores de formularios compartidos por las páginas y componentes.

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isValidPhone = (phone: string) => /^\+?[\d\s\-().]{7,20}$/.test(phone);

/** Formato internacional sin espacios, como lo espera wa.me: +5491112345678. */
export const isValidWhatsApp = (number: string) => /^\+\d{10,15}$/.test(number);
