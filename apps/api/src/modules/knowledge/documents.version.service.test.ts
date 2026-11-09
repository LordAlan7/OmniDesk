import type { AuthUser } from '../../shared/types';
import * as repository from './documents.repository';
import { readDocumentFile } from '../files';
import { content } from './documents.service';

jest.mock('./documents.repository', () => ({
  ...jest.requireActual('./documents.repository'),
  transaction: jest.fn(
    async (callback: (client: unknown) => Promise<unknown>) =>
      callback({})
  ),
  findDocument: jest.fn(),
}));

jest.mock('../files', () => ({
  validateDocumentPdf: jest.fn(),
  storeDocumentFile: jest.fn(),
  readDocumentFile: jest.fn(),
}));

const technician: AuthUser = {
  id: 2,
  name: 'Tecnico',
  email: 'technician@company.com',
  roles: ['Technician'],
};

const documentRecord = {
  id: 10,
  fileId: 55,
  status: 'published',
  versionId: 'version-original',
} as NonNullable<
  Awaited<ReturnType<typeof repository.findDocument>>
>;

const pdf = {
  original_name: 'manual.pdf',
  content: Buffer.from('contenido de prueba'),
} as Awaited<ReturnType<typeof readDocumentFile>>;

beforeEach(() => {
  jest.clearAllMocks();

  jest.mocked(repository.transaction).mockImplementation(
    async (callback) => callback({} as never)
  );
  jest.mocked(repository.findDocument)
    .mockResolvedValue(documentRecord);
  jest.mocked(readDocumentFile)
    .mockResolvedValue(pdf);
});

describe('AIR-003 - Validacion de version en descarga', () => {
  test('permite descargar la version correcta', async () => {
    const result = await content(
      10,
      technician,
      'version-original'
    );

    expect(readDocumentFile).toHaveBeenCalledTimes(1);
    expect(await jest.mocked(readDocumentFile).mock.results[0]?.value).toBe(pdf);
    expect(await jest.mocked(repository.transaction).mock.results[0]?.value).toBe(pdf);
    expect(result).toBe(pdf);
  });

  test('rechaza una version incorrecta', async () => {
    await expect(
      content(10, technician, 'version-inventada')
    ).rejects.toMatchObject({ status: 409 });

    expect(readDocumentFile).not.toHaveBeenCalled();
  });

  test('rechaza documentos retirados con version esperada', async () => {
    jest.mocked(repository.findDocument).mockResolvedValue({
      ...documentRecord,
      status: 'retired',
    });

    await expect(
      content(10, technician, 'version-original')
    ).rejects.toMatchObject({ status: 409 });

    expect(readDocumentFile).not.toHaveBeenCalled();
  });

  test('oculta documentos inaccesibles', async () => {
    jest.mocked(repository.findDocument)
      .mockResolvedValue(null);

    await expect(
      content(10, technician, 'version-original')
    ).rejects.toMatchObject({ status: 404 });

    expect(readDocumentFile).not.toHaveBeenCalled();
  });

  test('rechaza usuarios sin permiso de lectura', async () => {
    const withoutPermission: AuthUser = {
      ...technician,
      roles: [],
    };

    await expect(
      content(10, withoutPermission, 'version-original')
    ).rejects.toMatchObject({ status: 403 });

    expect(readDocumentFile).not.toHaveBeenCalled();
  });

  test('conserva las descargas normales sin version esperada', async () => {
    const result = await content(10, technician);

    expect(readDocumentFile).toHaveBeenCalledTimes(1);
    expect(await jest.mocked(readDocumentFile).mock.results[0]?.value).toBe(pdf);
    expect(await jest.mocked(repository.transaction).mock.results[0]?.value).toBe(pdf);
    expect(result).toBe(pdf);
  });
});