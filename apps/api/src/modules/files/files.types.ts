export interface TicketAttachment {
  id: number;
  ticketId: number;
  uploadedBy: number;
  uploadedByName?: string;
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}