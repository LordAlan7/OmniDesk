import request from 'supertest';
import { PDFDocument, PDFName, PDFString, PDFDict } from 'pdf-lib';
import { app, bearer, loginAs } from '../../test-helpers';
import { validateDocumentPdf } from '../files';
import { documentMetadata, publicationSchema } from './documents.schemas';
const file = (buffer: Buffer, name='manual.pdf', type='application/pdf') =>
  ({buffer,size:buffer.length,originalname:name,mimetype:type}) as Express.Multer.File;

describe('FR-012 validation and authorization', () => {
  it('requires a session and denies upload/publication by unauthorized roles before reading files',async () => {
    expect((await request(app).get('/api/v1/knowledge/documents')).status).toBe(401);
    const employee=await loginAs('employee@company.com');
    expect((await request(app).post('/api/v1/knowledge/documents').set(bearer(employee))).status).toBe(403);
    const tech=await loginAs('technician@company.com');
    expect((await request(app).patch('/api/v1/knowledge/documents/1/publication').set(bearer(tech)).send({status:'published'})).status).toBe(403);
    const admin=await loginAs('admin@company.com');
    expect((await request(app).post('/api/v1/knowledge/documents').set(bearer(admin))).status).toBe(403);
  });
  it('validates PDF contents rather than trusting filename or MIME', async () => {
    const pdf=await PDFDocument.create(); pdf.addPage();
    const bytes=Buffer.from(await pdf.save());
    await expect(validateDocumentPdf(file(bytes))).resolves.toBeUndefined();
    await expect(validateDocumentPdf(file(Buffer.from('fake'),'manual.pdf'))).rejects.toMatchObject({status:400});
    await expect(validateDocumentPdf(file(bytes,'manual.exe'))).rejects.toMatchObject({status:400});
    await expect(validateDocumentPdf(file(bytes,'manual.pdf','text/plain'))).rejects.toMatchObject({status:400});
    await expect(validateDocumentPdf(file(Buffer.alloc(0)))).rejects.toMatchObject({status:400});
    await expect(validateDocumentPdf(file(Buffer.alloc(10485761)))).rejects.toMatchObject({status:413});
    await expect(validateDocumentPdf(file(Buffer.from('%PDF-1.7\nbroken')))).rejects.toMatchObject({status:400});
  });
  it('rejects JavaScript including nested dictionaries', async () => {
    const pdf=await PDFDocument.create(); const page=pdf.addPage();
    page.node.set(PDFName.of('A'),pdf.context.obj({S:'JavaScript',JS:PDFString.of('app.alert(1)')}) as PDFDict);
    await expect(validateDocumentPdf(file(Buffer.from(await pdf.save())))).rejects.toMatchObject({status:400});
  });
  it('rejects impossible dates and client-controlled approval/storage fields', () => {
    const metadata={title:'Manual',description:'Uso',categoryId:1,source:'Fabricante'};
    expect(documentMetadata.safeParse({...metadata,documentDate:'2026-02-30'}).success).toBe(false);
    expect(documentMetadata.safeParse({...metadata,aiAuthorized:true}).success).toBe(false);
    expect(documentMetadata.safeParse({...metadata,fileId:'secret'}).success).toBe(false);
    expect(publicationSchema.safeParse({status:'published',accessRoles:['Invented'],revision:1}).success).toBe(false);
  });
});
