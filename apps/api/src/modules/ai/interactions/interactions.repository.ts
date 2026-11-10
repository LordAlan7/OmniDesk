import { env } from '../../../config/env';
import { recordAuditInMemory } from '../../audit';
import type { SourceReference } from '../sources/sources.types';
import { postgresInteractionsRepository } from './interactions.postgres.repository';
import type { AiInteraction, InteractionsRepository, NewInteraction } from './interactions.types';

const interactions = new Map<number, AiInteraction>();
let nextId = 1;

const memoryInteractionsRepository: InteractionsRepository = {
  async create(data: NewInteraction, audit) {
    const interaction: AiInteraction = {
      ...data,
      references: data.references.map((reference: SourceReference) => ({ ...reference })),
      id: nextId++,
      createdAt: new Date().toISOString(),
    };
    interactions.set(interaction.id, interaction);
    recordAuditInMemory({ ...audit, entityId: interaction.id });
    return interaction;
  },

  async findById(id) {
    return interactions.get(id);
  },
};

export function resetInteractionsRepository(): void {
  interactions.clear();
  nextId = 1;
}

const useMemory = env.nodeEnv === 'test';

export const interactionsRepository: InteractionsRepository = useMemory
  ? memoryInteractionsRepository
  : postgresInteractionsRepository;
