import {
  assertInteractionCurrentlySupported,
  getInteractionForUser,
  recordInteraction,
  resetInteractions,
} from './interactions/interactions';
import {
  configureSourceReader,
  resetSourceReader,
} from './sources/source-reader';
import { sourcesRepository } from './sources/sources.repository';
import type {
  AiSourceAuthorization,
  SourceReference,
} from './sources/sources.types';
import type { KnowledgeSourceSnapshot } from '../knowledge';
import type { AuthUser } from '../../shared/types';

describe('NFR-003 - respaldo vigente', () => {
  const user: AuthUser = {
    id: 2,
    email: 'tecnico@test.com',
    name: 'Tecnico',
    roles: ['Technician'],
  };

  const reference: SourceReference = {
    authorizationId: 10,
    sourceType: 'article',
    sourceId: 7,
    sourceVersion: '2',
    title: 'Manual de soporte',
    chunkIndex: 0,
  };

  const authorization = {
    id: 10,
    status: 'approved',
    sourceType: 'article',
    sourceId: 7,
    sourceVersion: '2',
    contentHash: 'hash-original',
  } as AiSourceAuthorization;

  const snapshot = {
    type: 'article',
    id: 7,
    title: 'Manual de soporte',
    version: '2',
    contentHash: 'hash-original',
    eligible: true,
    visibleToUser: true,
  } as KnowledgeSourceSnapshot;

  function interaction(references: SourceReference[] = [reference]) {
    return recordInteraction({
      userId: user.id,
      question: 'Como reparar el equipo',
      answer: 'Revisar la conexion.',
      references,
    });
  }

  function configure(
    source: KnowledgeSourceSnapshot = snapshot,
    auth: AiSourceAuthorization = authorization,
  ) {
    jest.spyOn(sourcesRepository, 'findById').mockResolvedValue(auth);
    configureSourceReader({
      read: async () => source,
    });
  }

  beforeEach(() => resetInteractions());

  afterEach(() => {
    resetSourceReader();
    jest.restoreAllMocks();
  });

  test('acepta respaldo vigente', async () => {
    configure();

    await expect(
      assertInteractionCurrentlySupported(interaction(), user),
    ).resolves.toBeUndefined();
  });

  test('rechaza recomendaciones sin referencias', async () => {
    await expect(
      assertInteractionCurrentlySupported(interaction([]), user),
    ).rejects.toThrow(/no tiene referencias/);
  });

  test('rechaza autorización revocada', async () => {
    configure(snapshot, { ...authorization, status: 'revoked' });

    await expect(
      assertInteractionCurrentlySupported(interaction(), user),
    ).rejects.toThrow(/respaldo autorizado/);
  });

  test('rechaza versión actual diferente', async () => {
    configure({ ...snapshot, version: '3' });

    await expect(
      assertInteractionCurrentlySupported(interaction(), user),
    ).rejects.toThrow(/cambió de versión/);
  });

  test('rechaza contenido modificado', async () => {
    configure({ ...snapshot, contentHash: 'hash-nuevo' });

    await expect(
      assertInteractionCurrentlySupported(interaction(), user),
    ).rejects.toThrow(/cambió de versión/);
  });

  test('rechaza fuente no elegible', async () => {
    configure({ ...snapshot, eligible: false });

    await expect(
      assertInteractionCurrentlySupported(interaction(), user),
    ).rejects.toThrow(/cambió de versión/);
  });

  test('rechaza fuente sin acceso vigente', async () => {
    configure({ ...snapshot, visibleToUser: false });

    await expect(
      assertInteractionCurrentlySupported(interaction(), user),
    ).rejects.toThrow(/acceso a las fuentes/);
  });

  test('rechaza referencia con versión distinta a la autorizada', async () => {
    configure();

    const modified = {
      ...reference,
      sourceVersion: '1',
    };

    await expect(
      assertInteractionCurrentlySupported(
        interaction([modified]),
        user,
      ),
    ).rejects.toThrow(/no coincide/);
  });

  describe('NFR-003 - recuperación de interacciones antiguas', () => {
    test('conserva una interacción con respaldo vigente', async () => {
      configure();
      const stored = interaction();

      await expect(
        getInteractionForUser(stored.id, user),
      ).resolves.toMatchObject({ status: 'available' });
    });

    test.each([
      {
        scenario: 'cambia la versión',
        changes: { version: '3' },
        reason: 'source_withdrawn',
      },
      {
        scenario: 'cambia el contenido',
        changes: { contentHash: 'hash-modificado' },
        reason: 'source_withdrawn',
      },
      {
        scenario: 'la fuente deja de estar publicada',
        changes: { eligible: false },
        reason: 'source_withdrawn',
      },
      {
        scenario: 'el usuario pierde acceso',
        changes: { visibleToUser: false },
        reason: 'source_access_lost',
      },
    ])('oculta la interacción si $scenario', async ({ changes, reason }) => {
      configure({ ...snapshot, ...changes });
      const stored = interaction();

      const result = await getInteractionForUser(stored.id, user);

      expect(result).toMatchObject({
        status: 'unavailable',
        reason,
      });

      expect(JSON.stringify(result)).not.toContain(
        'Revisar la conexion.',
      );
    });
  });
});
