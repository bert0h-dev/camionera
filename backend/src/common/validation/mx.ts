// Formatos de identificadores oficiales de México

/** CURP: 4 letras, fecha AAMMDD, sexo, entidad (2), 3 consonantes, homoclave y dígito. */
export const CURP_REGEX = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HMX](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[A-Z\d]\d$/;

/** RFC de persona física: 4 letras, fecha AAMMDD y homoclave de 3. */
export const RFC_REGEX = /^[A-ZÑ&]{4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{3}$/;

/** NSS (IMSS): 11 dígitos. */
export const NSS_REGEX = /^\d{11}$/;

/** Teléfono nacional: 10 dígitos. */
export const PHONE_REGEX = /^\d{10}$/;
