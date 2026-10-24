import { type ChangeEvent, type FormEvent, useState } from 'react';
import type { z } from 'zod';

type FieldErrors = Record<string, string>;

/**
 * Formulario controlado validado con el mismo esquema de contracts que usa la API.
 * `field('x')` devuelve las props de un TextField de MUI (value, onChange, error, helperText).
 * `serverErrors` son los fieldErrors que devolvió la API (p. ej. RFC repetido).
 */
export function useZodForm<S extends z.ZodType<unknown, Record<string, unknown>>>(
  schema: S,
  initial: z.input<S>,
  serverErrors: FieldErrors = {},
) {
  const [values, setValues] = useState<z.input<S>>(initial);
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const errors = Object.keys(clientErrors).length > 0 ? clientErrors : serverErrors;

  function setValue(name: keyof z.input<S> & string, value: unknown): void {
    setValues((current) => ({ ...current, [name]: value }));
  }

  function field(name: keyof z.input<S> & string) {
    const value = values[name];
    return {
      name,
      id: name,
      value: value === undefined || value === null ? '' : String(value),
      error: Boolean(errors[name]),
      helperText: errors[name] ?? ' ',
      onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setValue(name, e.target.value),
    };
  }

  function handleSubmit(onValid: (data: z.output<S>) => void) {
    return (event: FormEvent) => {
      event.preventDefault();
      const result = schema.safeParse(values);
      if (!result.success) {
        setClientErrors(toFieldErrors(result.error));
        return;
      }
      setClientErrors({});
      onValid(result.data);
    };
  }

  return { values, errors, field, setValue, handleSubmit };
}

function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.') || '_';
    errors[key] ??= issue.message;
  }
  return errors;
}
