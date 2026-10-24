import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { PDFDocument } from 'pdf-lib';
import * as database from '../../shared/db/pool';
import { app,bearer,loginAs } from '../../test-helpers';
import { usersRepository } from '../users/users.repository';
const testUrl=process.env.TEST_DATABASE_URL;
const describeDatabase=testUrl ? describe : describe.skip;

describeDatabase('FR-012 PostgreSQL integration', () => {
  let connection: Pool; let admin: Pool; let spy: jest.SpyInstance;
  let tech: string; let employee: string; let manager: string; let advisor: string;
  let pdf: Buffer; let docId: number; let versionId: string;
  const schema=`qa_documents_${randomUUID().replace(/-/g,'')}`;
  beforeAll(async () => {
    if(new URL(testUrl!).pathname !== '/omnidesk_test') throw new Error('Usa exclusivamente omnidesk_test.');
    admin=new Pool({connectionString:testUrl});
    await admin.query(`CREATE SCHEMA "${schema}"`);
    connection=new Pool({connectionString:testUrl,options:`-c search_path=${schema}`});
    spy=jest.spyOn(database,'getPool').mockReturnValue(connection);
    for(const name of ['001_init.sql','002_users_constraints.sql','003_knowledge_documents.sql','009_audit_traceability.sql']) {
      await connection.query(fs.readFileSync(path.join(__dirname,'../../../db/migrations',name),'utf8'));
    }
    // Auth uses the existing memory fixture in NODE_ENV=test; FK rows have matching IDs.
    for(const user of usersRepository.list()) {
      await connection.query(`INSERT INTO users(id,name,email,password_hash) VALUES ($1,$2,$3,$4)`,
        [user.id,user.name,user.email,user.passwordHash]);
    }
    tech=await loginAs('technician@company.com'); employee=await loginAs('employee@company.com');
    manager=await loginAs('manager@company.com'); advisor=await loginAs('advisor@company.com');
    const document=await PDFDocument.create();document.addPage();pdf=Buffer.from(await document.save());
  },30000);
  afterAll(async () => {
    spy?.mockRestore(); await connection?.end();
    if(admin) { await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.end(); }
  });
  function upload(token=tech,category='1') {
    return request(app).post('/api/v1/knowledge/documents').set(bearer(token))
      .field('title','Manual motor FR012').field('description','Documento de prueba')
      .field('source','Fabricante').field('categoryId',category)
      .attach('file',pdf,{filename:'motor.pdf',contentType:'application/pdf'});
  }
  it('creates a persistent draft and excludes private keys/bytes from responses',async () => {
    const res=await upload();expect(res.status).toBe(201);
    docId=res.body.data.id;versionId=res.body.data.versionId;
    expect(res.body.data).toMatchObject({source:'Fabricante',uploadedBy:'Demo Technician',status:'draft',aiAuthorized:false});
    expect(res.body.data.fileId).toBeUndefined(); expect(res.body.data.content).toBeUndefined();
    const persisted=await admin.query(`SELECT d.version_id,octet_length(f.content) AS size
      FROM "${schema}".knowledge_documents d JOIN "${schema}".stored_files f ON f.id=d.file_id WHERE d.id=$1`,[docId]);
    expect(persisted.rows[0]).toMatchObject({version_id:versionId,size:pdf.length});
  });
  it('hides drafts from list, totals, detail and content even with a known ID',async () => {
    const list=await request(app).get('/api/v1/knowledge/documents?search=FR012').set(bearer(employee));
    expect(list.body.meta.total).toBe(0);expect(list.body.data).toEqual([]);
    for(const suffix of ['', '/content']) expect((await request(app).get(`/api/v1/knowledge/documents/${docId}${suffix}`).set(bearer(employee))).status).toBe(404);
    expect((await request(app).get(`/api/v1/knowledge/documents/${docId}`).set(bearer(advisor))).status).toBe(404);
  });
  it('publishes only for selected roles and rechecks access for binary requests',async () => {
    const res=await request(app).patch(`/api/v1/knowledge/documents/${docId}/publication`).set(bearer(manager))
      .send({status:'published',accessRoles:['Technician'],revision:1});
    expect(res.status).toBe(200);
    expect((await request(app).get(`/api/v1/knowledge/documents/${docId}/content`).set(bearer(employee))).status).toBe(404);
    const allowed=await request(app).get(`/api/v1/knowledge/documents/${docId}/content`).set(bearer(tech));
    expect(allowed.status).toBe(200);expect(allowed.headers['content-disposition']).toContain('attachment;');
    expect(allowed.headers['cache-control']).toContain('no-store');expect(allowed.body).toEqual(pdf);
  });
  it('blocks editing a published document and rejects stale publication revisions',async () => {
    const metadata={title:'Cambio',description:'Texto',categoryId:1,source:'Fabricante',revision:2};
    expect((await request(app).patch(`/api/v1/knowledge/documents/${docId}`).set(bearer(tech)).send(metadata)).status).toBe(409);
    expect((await request(app).patch(`/api/v1/knowledge/documents/${docId}/publication`).set(bearer(manager))
      .send({status:'draft',accessRoles:[],revision:1})).status).toBe(409);
  });
  it('edits a draft with audit history while preserving the file version',async () => {
    expect((await request(app).patch(`/api/v1/knowledge/documents/${docId}/publication`).set(bearer(manager))
      .send({status:'draft',accessRoles:[],revision:2})).status).toBe(200);
    const res=await request(app).patch(`/api/v1/knowledge/documents/${docId}`).set(bearer(tech))
      .send({title:'Manual corregido',description:'Texto corregido',categoryId:2,source:'Fabricante confirmado',revision:3});
    expect(res.status).toBe(200);expect(res.body.data.versionId).toBe(versionId);
    const events=await connection.query(`SELECT action FROM audit_log WHERE entity='knowledge_document' AND entity_id=$1`,[docId]);
    expect(events.rows.map(r=>r.action)).toContain('document.metadata.updated');
    const history=await request(app).get(`/api/v1/knowledge/documents/${docId}/history`).set(bearer(manager));
    expect(history.status).toBe(200);expect(history.body.data.map((r: {action:string})=>r.action)).toContain('document.metadata.updated');
    await request(app).get(`/api/v1/knowledge/documents/${docId}/history`).set(bearer(tech)).expect(403);
    expect((await request(app).patch(`/api/v1/knowledge/documents/${docId}`).set(bearer(advisor))
      .send({title:'Ajeno',description:'Texto',categoryId:2,source:'Otro',revision:4})).status).toBe(404);
  });
  it('withdraws documents from human access without deleting historical files',async () => {
    await request(app).patch(`/api/v1/knowledge/documents/${docId}/publication`).set(bearer(manager))
      .send({status:'retired',accessRoles:[],revision:4}).expect(200);
    await request(app).get(`/api/v1/knowledge/documents/${docId}/content`).set(bearer(tech)).expect(404);
    const result=await connection.query('SELECT count(*)::int AS count FROM stored_files');expect(result.rows[0].count).toBe(1);
  });
  it('rejects invalid category and oversized uploads without creating records',async () => {
    expect((await upload(tech,'99999')).status).toBe(400);
    const large=await request(app).post('/api/v1/knowledge/documents').set(bearer(tech))
      .attach('file',Buffer.alloc(10485761),{filename:'large.pdf',contentType:'application/pdf'});
    expect(large.status).toBe(413);
    const result=await connection.query('SELECT count(*)::int AS count FROM stored_files');expect(result.rows[0].count).toBe(1);
  });
  it('rolls back file and metadata together if audit persistence fails',async () => {
    await connection.query("ALTER TABLE audit_log ADD CONSTRAINT fail_document_audit CHECK (action <> 'document.created') NOT VALID");
    try {
      const previous=console.error;console.error=() => {};
      try { expect((await upload()).status).toBe(500); } finally {console.error=previous;}
      const files=await connection.query('SELECT count(*)::int AS count FROM stored_files');
      const docs=await connection.query('SELECT count(*)::int AS count FROM knowledge_documents');
      expect(files.rows[0].count).toBe(1);expect(docs.rows[0].count).toBe(1);
    } finally { await connection.query('ALTER TABLE audit_log DROP CONSTRAINT fail_document_audit'); }
  });
});
