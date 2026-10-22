// Dependency-free behavioral checks against the actual tracking service (Node 24).
const { stripTypeScriptTypes } = require('node:module');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
let source = readFileSync(path.join(__dirname, '../apps/api/src/modules/tickets/tickets.tracking.ts'), 'utf8');
source = stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm, '').replace(/export /g, '')
  .replace(/const trackingQuery = paginationSchema.extend\([\s\S]*?\)\.strict\(\);/, '');
const tickets = [1,2,3].map(id => ({ id, createdBy: id === 2 ? 22 : 11, assignedTechnicianId: 11,
  status: 'Open', title: 'Ticket', description: 'Report', createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z', version: 88, resolution: null, resolvedAt: null, closedAt: null }));
let events = [];
const repository = { list: async q => tickets.filter(t => !q.status || t.status === q.status),
  findById: async id => tickets.find(t => t.id === id), historyOf: async id => events.filter(e => e.ticketId === id) };
const permissions = { TICKETS_READ: 'read', TICKETS_HISTORY_READ: 'history', TICKETS_READ_ALL: 'all' };
const can = (u,p) => (u.permissions || []).includes(p);
const service = new Function('ticketsRepository','TICKET_STATUSES','can','PERMISSIONS','Errors',
  source + '\nreturn { publicUpdates, listOwnTickets, ownTicket, canReadInternalHistory };')(
  repository, ['Open','Assigned','In Progress','Resolved','Closed'], can, permissions,
  { forbidden: () => new Error('403'), notFound: () => new Error('404') });
(async () => {
  const owner = { id:11, roles:['Employee'], permissions:['read'] };
  events = [
    { id:3,ticketId:1,action:'assigned',reason:'SECRET',createdAt:'2026-10-01T00:00:00Z' },
    { id:2,ticketId:1,action:'status_changed',from:'Open',to:'Assigned',actorId:4,reason:'SECRET',createdAt:'2026-01-02T00:00:00Z' },
    { id:1,ticketId:1,action:'created',to:{password:'SECRET'},actorId:11,createdAt:'2026-01-01T00:00:00Z' },
    { id:4,ticketId:1,action:'internal_note',to:'SECRET',createdAt:'2026-10-01T00:00:00Z' },
    { id:5,ticketId:1,action:'status_changed',from:{secret:'SECRET'},to:'Assigned',createdAt:'2026-10-01T00:00:00Z' },
  ];
  const result = await service.ownTicket(1,owner);
  assert.deepEqual(result.updates.map(e=>e.id),[1,2]);
  assert(!JSON.stringify(result).includes('SECRET'));
  assert.equal(result.lastVisibleUpdateAt,'2026-01-02T00:00:00Z');
  assert(!('version' in result)); assert(!('updatedAt' in result));
  assert(!('actorId' in result.updates[0]));
  assert.deepEqual((await service.listOwnTickets(owner,{})).map(t=>t.id),[1,3]);
  assert.equal((await service.listOwnTickets(owner,{ticketId:2})).length,0);
  assert.equal((await service.listOwnTickets(owner,{ticketId:3})).length,1);
  assert.equal((await service.listOwnTickets(owner,{status:'Closed'})).length,0);
  await assert.rejects(service.ownTicket(2,owner),/404/);
  await assert.rejects(service.ownTicket(999,owner),/404/);
  await assert.rejects(service.listOwnTickets({...owner,permissions:[]},{}),/403/);
  assert.equal(service.canReadInternalHistory(tickets[0],owner),false);
  assert.equal(service.canReadInternalHistory(tickets[0],{...owner,roles:['Administrator'],permissions:['read','history']}),false);
  assert.equal(service.canReadInternalHistory(tickets[0],{...owner,roles:['Technician'],permissions:['read','history']}),true);
  tickets[0].status='Resolved'; tickets[0].resolution='Solución compartida';
  assert.equal((await service.ownTicket(1,owner)).resolution,'Solución compartida');
  console.log('FR-018: 17 behavioral assertions passed. HTTP, Vue and PostgreSQL checks still required.');
})().catch(error => { console.error(error); process.exitCode=1 });
