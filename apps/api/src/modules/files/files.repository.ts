import { env } from '../../config/env';
import { getPool } from '../../shared/db/pool';
import { findUserById } from '../users';
import type { TicketAttachment } from './files.types';

// --- En Memoria ---
const memoryStore: TicketAttachment[] = [];
let nextMemId = 1;

const memoryRepo = {
  async create(data: Omit<TicketAttachment, 'id' | 'createdAt' | 'uploadedByName'>): Promise<TicketAttachment> {
    const att: TicketAttachment = { ...data, id: nextMemId++, createdAt: new Date().toISOString() };
    memoryStore.push(att);
    return att;
  },
  async listByTicket(ticketId: number): Promise<TicketAttachment[]> {
    const attachments = memoryStore.filter(a => a.ticketId === ticketId);
    return Promise.all(attachments.map(async a => {
      const u = await findUserById(a.uploadedBy);
      return { ...a, uploadedByName: u?.name ?? `Usuario #${a.uploadedBy}` };
    }));
  },
  async findById(id: number): Promise<TicketAttachment | undefined> {
    const att = memoryStore.find(a => a.id === id);
    if (!att) return undefined;
    const u = await findUserById(att.uploadedBy);
    return { ...att, uploadedByName: u?.name ?? `Usuario #${att.uploadedBy}` };
  },
  async countByTicket(ticketId: number): Promise<number> {
    return memoryStore.filter(a => a.ticketId === ticketId).length;
  }
};

// --- PostgreSQL ---
const postgresRepo = {
  async create(data: Omit<TicketAttachment, 'id' | 'createdAt' | 'uploadedByName'>): Promise<TicketAttachment> {
    const result = await getPool().query(
      `INSERT INTO ticket_attachments (ticket_id, uploaded_by, original_name, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.ticketId, data.uploadedBy, data.originalName, data.storageKey, data.mimeType, data.sizeBytes]
    );
    const row = result.rows[0];
    return {
      id: row.id,
      ticketId: row.ticket_id,
      uploadedBy: row.uploaded_by,
      originalName: row.original_name,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at.toISOString(),
    };
  },
  async listByTicket(ticketId: number): Promise<TicketAttachment[]> {
    const result = await getPool().query(
      `SELECT a.*, u.name as uploaded_by_name 
       FROM ticket_attachments a JOIN users u ON u.id = a.uploaded_by 
       WHERE a.ticket_id = $1 ORDER BY a.created_at DESC`,
      [ticketId]
    );
    return result.rows.map(row => ({
      id: row.id,
      ticketId: row.ticket_id,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      originalName: row.original_name,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at.toISOString(),
    }));
  },
  async findById(id: number): Promise<TicketAttachment | undefined> {
    const result = await getPool().query(
      `SELECT a.*, u.name as uploaded_by_name 
       FROM ticket_attachments a JOIN users u ON u.id = a.uploaded_by 
       WHERE a.id = $1`, [id]
    );
    if (!result.rows[0]) return undefined;
    const row = result.rows[0];
    return {
      id: row.id,
      ticketId: row.ticket_id,
      uploadedBy: row.uploaded_by,
      uploadedByName: row.uploaded_by_name,
      originalName: row.original_name,
      storageKey: row.storage_key,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at.toISOString(),
    };
  },
  async countByTicket(ticketId: number): Promise<number> {
    const result = await getPool().query('SELECT COUNT(*)::int as count FROM ticket_attachments WHERE ticket_id = $1', [ticketId]);
    return result.rows[0].count;
  }
};

export const filesRepository = env.nodeEnv === 'test' ? memoryRepo : postgresRepo;