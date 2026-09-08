export const DOCUMENT_CATEGORIES = [
  "document",
  "base_document",
  "production_order_file",
  "preliminary_specification_file",
  "stock_file",
  "illiquid_file",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function isDocumentCategory(value: string): value is DocumentCategory {
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value);
}
