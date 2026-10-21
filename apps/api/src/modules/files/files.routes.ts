import { Router } from 'express';
import multer from 'multer';
import { authenticate, currentUser } from '../../shared/security/guards';
import { ok, parseId } from '../../shared/http';
import * as service from './files.service';
import { MAX_ATTACHMENT_BYTES } from './ticket-storage';

export const filesRouter = Router();

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: MAX_ATTACHMENT_BYTES } 
});

// Cargar evidencia
filesRouter.post('/tickets/:ticketId/attachments', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    const att = await service.uploadAttachment(parseId(req.params.ticketId), req.file, currentUser(req));
    res.status(201).json({ data: att });
  } catch (err) { next(err); }
});

// Listar evidencia
filesRouter.get('/tickets/:ticketId/attachments', authenticate, async (req, res, next) => {
  try {
    ok(res, await service.listAttachments(parseId(req.params.ticketId), currentUser(req)));
  } catch (err) { next(err); }
});

// Descargar/Ver evidencia
filesRouter.get('/tickets/:ticketId/attachments/:attachmentId/content', authenticate, async (req, res, next) => {
  try {
    const file = await service.downloadAttachment(
      parseId(req.params.ticketId), 
      parseId(req.params.attachmentId), 
      currentUser(req)
    );
    
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(file.buffer);
  } catch (err) { next(err); }
});