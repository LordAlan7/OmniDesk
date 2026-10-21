import { randomUUID } from 'node:crypto';
import { Errors } from '../../shared/errors';
import type { AuthUser } from '../../shared/types';
import { recordAudit } from '../audit';
import { getTicketForUser } from '../tickets';
import { filesRepository } from './files.repository';
import { createStorageProvider } from './storage';
import { MAX_ATTACHMENTS_PER_TICKET, validateAttachment } from './ticket-storage';
import type { TicketAttachment } from './files.types';

const storage = createStorageProvider();

export async function uploadAttachment(
  ticketId: number,
  file: Express.Multer.File | undefined,
  user: AuthUser
): Promise<TicketAttachment> {
  // 1. Verificar acceso al ticket y que no esté cerrado
  const ticket = await getTicketForUser(ticketId, user);
  if (ticket.status === 'Closed') {
    throw Errors.invalidState('No se pueden adjuntar archivos a tickets cerrados.');
  }

  // 2. Validar límite por ticket
  const count = await filesRepository.countByTicket(ticketId);
  if (count >= MAX_ATTACHMENTS_PER_TICKET) {
    throw Errors.validation([{ field: 'file', message: `Límite de ${MAX_ATTACHMENTS_PER_TICKET} adjuntos alcanzado.` }]);
  }

  // 3. Validar archivo (tamaño, formato, magic bytes)
  const { mimeType } = await validateAttachment(file);

  // 4. Guardar en almacenamiento
  const storageKey = `tickets/${ticketId}/${randomUUID()}`;
  await storage.put(storageKey, file!.buffer, mimeType);

  // 5. Guardar metadatos en BD
  let attachment: TicketAttachment;
  try {
    attachment = await filesRepository.create({
      ticketId,
      uploadedBy: user.id,
      originalName: file!.originalname.replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || 'archivo',
      storageKey,
      mimeType,
      sizeBytes: file!.size,
    });
  } catch (cause) {
    // Si la BD falla, eliminar el archivo huérfano
    await storage.delete(storageKey);
    throw cause;
  }

  // 6. Trazabilidad
  recordAudit({
    action: 'ticket.attachment_uploaded',
    entity: 'ticket',
    entityId: ticketId,
    actorId: user.id,
    metadata: { attachmentId: attachment.id, name: attachment.originalName }
  });

  return attachment;
}

export async function listAttachments(ticketId: number, user: AuthUser): Promise<TicketAttachment[]> {
  await getTicketForUser(ticketId, user);
  return filesRepository.listByTicket(ticketId);
}

export async function downloadAttachment(
  ticketId: number,
  attachmentId: number,
  user: AuthUser
): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
  await getTicketForUser(ticketId, user);
  
  const att = await filesRepository.findById(attachmentId);
  if (!att || att.ticketId !== ticketId) {
    throw Errors.notFound('Attachment');
  }

  const data = await storage.get(att.storageKey);
  if (!data) {
    throw Errors.notFound('File content');
  }

  return { buffer: data, mimeType: att.mimeType, originalName: att.originalName };
}