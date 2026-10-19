import { Router } from 'express';
import multer from 'multer';
import type { RequestHandler } from 'express';
import { AppError } from '../../shared/errors';
import { authenticate } from '../../shared/security/guards';
import { PERMISSIONS, requirePermission } from '../../shared/authorization';
import { MAX_DOCUMENT_BYTES } from '../files';
import * as controller from './documents.controller';

export const documentsRouter = Router();
const receiveFile = multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_DOCUMENT_BYTES,files:1,fields:8,parts:9,fieldSize:8192}}).single('file');
const upload: RequestHandler = (req,res,next) => receiveFile(req,res,error => {
  if (error instanceof multer.MulterError) {
    return next(new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400,'UPLOAD_ERROR',
      error.code === 'LIMIT_FILE_SIZE' ? 'El límite es 10 MB.' : 'Carga inválida. Envía un archivo en el campo file y los metadatos permitidos.'));
  }
  next(error);
});
const read = requirePermission(PERMISSIONS.KNOWLEDGE_READ);
documentsRouter.use('/knowledge/documents',authenticate,read);
documentsRouter.get('/knowledge/documents',controller.list);
documentsRouter.post('/knowledge/documents',requirePermission(PERMISSIONS.KNOWLEDGE_CREATE),upload,controller.create);
documentsRouter.get('/knowledge/documents/:id',controller.detail);
documentsRouter.get('/knowledge/documents/:id/content',controller.content);
documentsRouter.patch('/knowledge/documents/:id',requirePermission(PERMISSIONS.KNOWLEDGE_UPDATE),controller.edit);
documentsRouter.patch('/knowledge/documents/:id/publication',requirePermission(PERMISSIONS.KNOWLEDGE_PUBLISH),controller.publish);
documentsRouter.get('/knowledge/categories',authenticate,read,controller.categories);

documentsRouter.get('/knowledge/documents/:id/history',requirePermission(PERMISSIONS.AUDIT_READ),controller.history);
