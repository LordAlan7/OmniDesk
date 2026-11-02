import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseClient as PoolClient } from '../../shared/db/types';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFStream } from 'pdf-lib';
import { AppError, Errors } from '../../shared/errors';

import { MAX_DOCUMENT_BYTES } from '../../shared/constants/document-limits';

export { MAX_DOCUMENT_BYTES };

/** Defense in depth; download only. This is not an antivirus engine. */
export async function validateDocumentPdf(file?: Express.Multer.File): Promise<void> {
  if (!file || !file.buffer.length) {
    throw Errors.validation([{ field: 'file', message: 'Selecciona un PDF no vacío.' }]);
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new AppError(413, 'FILE_TOO_LARGE', 'El límite es 10 MB.');
  }
  if (!/\.pdf$/i.test(file.originalname) || file.mimetype !== 'application/pdf' ||
      file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw Errors.validation([{ field: 'file', message: 'El nombre, tipo y contenido deben corresponder a un PDF.' }]);
  }
  try {
    const pdf = await PDFDocument.load(file.buffer, { throwOnInvalidObject: true });
    if (!pdf.getPageCount()) throw new Error('No pages');
    const forbidden = new Set(['JavaScript', 'JS', 'Launch', 'EmbeddedFiles', 'EmbeddedFile',
      'RichMedia', 'XFA', 'OpenAction', 'AA', 'SubmitForm', 'ImportData']);
    const visited = new Set<unknown>();
    function inspect(object: unknown, depth = 0): void {
      if (depth > 100) throw new Error('PDF nesting limit');
      if (!object || visited.has(object)) return;
      visited.add(object);
      if (object instanceof PDFName) {
        if (forbidden.has(object.decodeText())) throw new Error('Active content');
      } else if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {
          inspect(key, depth + 1); inspect(value, depth + 1);
        }
      } else if (object instanceof PDFArray) {
        for (const value of object.asArray()) inspect(value, depth + 1);
      } else if (object instanceof PDFStream) {
        inspect(object.dict, depth + 1);
      }
      // Indirect objects are inspected separately, avoiding reference cycles.
    }
    for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object);
  } catch {
    throw Errors.validation([{ field: 'file', message: 'PDF inválido, cifrado o con contenido activo no admitido.' }]);
  }
}

export async function storeDocumentFile(client: PoolClient, file: Express.Multer.File) {
  const id = randomUUID();
  const name = file.originalname.replace(/.*[\\/]/, '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'documento.pdf';
  await client.query(`INSERT INTO stored_files(id, original_name, mime_type, size_bytes, sha256, content)
    VALUES ($1,$2,'application/pdf',$3,$4,$5)`,
    [id, name, file.size, createHash('sha256').update(file.buffer).digest('hex'), file.buffer]);
  return id;
}

export async function readDocumentFile(client: PoolClient, id: string) {
  const result = await client.query<{ content: Buffer; original_name: string }>(
    'SELECT content, original_name FROM stored_files WHERE id=$1', [id]);
  if (!result.rows[0]) throw new AppError(503, 'FILE_UNAVAILABLE', 'El archivo no está disponible.');
  return result.rows[0];
}
