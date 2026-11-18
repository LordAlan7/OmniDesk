import type { RequestHandler } from 'express';
import { ok, parseId } from '../../shared/http';
import { Errors } from '../../shared/errors';
import { currentUser } from '../../shared/security/guards';
import { documentMetadata, documentPatch, documentQuery, publicationSchema } from './documents.schemas';
import * as service from './documents.service';

export const list: RequestHandler = async (req,res) => {
  const query = documentQuery.parse(req.query);
  const result = await service.list(currentUser(req),query);
  res.json({data:result.items,meta:{page:query.page,limit:query.limit,total:result.total}});
};
export const categories: RequestHandler = async (_req,res) => { ok(res,await service.categories()); };
export const detail: RequestHandler = async (req,res) => { ok(res,await service.detail(parseId(req.params.id),currentUser(req))); };
export const create: RequestHandler = async (req,res) => {
  ok(res,await service.create(documentMetadata.parse(req.body),req.file,currentUser(req)),201);
};
export const edit: RequestHandler = async (req,res) => {
  ok(res,await service.edit(parseId(req.params.id),documentPatch.parse(req.body),currentUser(req)));
};
export const publish: RequestHandler = async (req,res) => {
  ok(res,await service.publish(parseId(req.params.id),publicationSchema.parse(req.body),currentUser(req)));
};
export const content: RequestHandler = async (req,res) => {
  const rawVersion = req.query.expectedVersion;

  if (
    rawVersion !== undefined &&
    (
      typeof rawVersion !== 'string' ||
      rawVersion.trim().length === 0 ||
      rawVersion.length > 128
    )
  ) {
    throw Errors.validation([
      { field: 'expectedVersion', message: 'Versión esperada inválida.' },
    ]);
  }

  const expectedVersion =
    typeof rawVersion === 'string' ? rawVersion : undefined;

  const file = await service.content(
    parseId(req.params.id),
    currentUser(req),
    expectedVersion
  );
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'");
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="documento.pdf"; filename*=UTF-8''${encodeURIComponent(file.original_name).replace(/'/g,'%27')}`);
  res.send(file.content);
};

export const history: RequestHandler = async (req,res) => {
  ok(res,await service.history(parseId(req.params.id),currentUser(req)));
};
