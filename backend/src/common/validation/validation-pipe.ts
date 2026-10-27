import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

// Traducción de los mensajes por defecto de class-validator (se conservan los mensajes personalizados)
const TRANSLATIONS: [RegExp, string][] = [
  [/^(.+) should not be empty$/, '$1 es obligatorio'],
  [/^(.+) must be an email$/, '$1 debe ser un correo válido'],
  [/^(.+) must be a string$/, '$1 debe ser texto'],
  [/^(.+) must be a boolean value$/, '$1 debe ser verdadero o falso'],
  [/^(.+) must be an integer number$/, '$1 debe ser un número entero'],
  [/^(.+) must be a valid ISO 8601 date string$/, '$1 debe ser una fecha válida (AAAA-MM-DD)'],
  [/^(.+) must be a UUID$/, '$1 debe ser un UUID válido'],
  [/^(.+) must be one of the following values: (.+)$/, '$1 debe ser uno de: $2'],
  [/^(.+) must be longer than or equal to (\d+) characters$/, '$1 debe tener al menos $2 caracteres'],
  [/^(.+) must be shorter than or equal to (\d+) characters$/, '$1 debe tener máximo $2 caracteres'],
  [/^(.+) must not be less than (\d+)$/, '$1 no debe ser menor que $2'],
  [/^(.+) must not be greater than (\d+)$/, '$1 no debe ser mayor que $2'],
  [/^property (.+) should not exist$/, 'El campo $1 no está permitido'],
];

const translate = (message: string) => {
  for (const [pattern, replacement] of TRANSLATIONS) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
};

const flatten = (errors: ValidationError[], parent = ''): string[] =>
  errors.flatMap((e) => {
    const path = parent ? `${parent}.${e.property}` : e.property;
    const own = Object.values(e.constraints ?? {}).map(translate);
    return [...own, ...flatten(e.children ?? [], path)];
  });

export const createValidationPipe = () =>
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => new BadRequestException(flatten(errors)),
  });
