import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { runWithRequestContext } from '../context/requestContext';

export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.length <= 100 ? incoming : `req-${randomUUID()}`;
  res.setHeader('X-Request-Id', req.requestId);
  runWithRequestContext({ requestId: req.requestId }, next);
};
