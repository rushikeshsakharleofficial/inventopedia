/** Versioned inventory attribute contract. Zod validation lives in the API. */
export type TemplateField = {
  key: string;
  label: string;
  required: boolean;
} & ({ type: 'text' | 'number' | 'boolean' | 'date' } | { type: 'select'; options: string[] });

export interface TemplateSchema {
  fields: TemplateField[];
}
