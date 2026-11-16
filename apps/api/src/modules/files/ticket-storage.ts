import { AppError, Errors } from '../../shared/errors';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_TICKET = 10;

// Tipos MIME permitidos y su validación de magic bytes
const ALLOWED_MIME_TYPES: Record<string, RegExp> = {
  'image/jpeg': /^\xff\xd8\xff/,
  'image/png': /^\x89PNG\r\n\x1a\n/,
  'image/gif': /^GIF8[79]a/,
  'image/webp': /^RIFF....WEBPVP8/,
  'application/pdf': /^%PDF-/,
  'text/plain': /.*/, // Texto plano es difícil de validar por magic bytes
};

export async function validateAttachment(file?: Express.Multer.File): Promise<{ mimeType: string }> {
  if (!file || !file.buffer.length) {
    throw Errors.validation([{ field: 'file', message: 'Selecciona un archivo no vacío.' }]);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'El límite máximo es de 10 MB por archivo.');
  }

  const declared = file.mimetype;
  const allowed = ALLOWED_MIME_TYPES[declared];

  if (!allowed) {
    throw Errors.validation([{ field: 'file', message: `El formato ${declared} no está permitido.` }]);
  }

  // Validar contenido real (magic bytes) para evitar extensiones engañosas
  if (declared !== 'text/plain') {
    const header = file.buffer.subarray(0, 12).toString('latin1');
    if (!allowed.test(header)) {
      throw Errors.validation([{ field: 'file', message: 'El contenido del archivo no coincide con el formato declarado.' }]);
    }
  }

  return { mimeType: declared };
}