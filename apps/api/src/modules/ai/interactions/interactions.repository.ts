import { env } from '../../../config/env';
import type { AiInteraction } from './interactions';

import {
  recordInteraction,
  getInteractionById,
  resetInteractions,
} from './interactions';

import {
  createInteractionInPostgres,
  findInteractionInPostgres,
  listInteractionsInPostgres,
} from './interactions.postgres.repository';

export interface InteractionRepository {
  create(
    input: Omit<AiInteraction, 'id' | 'createdAt'>
  ): Promise<AiInteraction>;

  findById(id: number): Promise<AiInteraction | undefined>;

  listByUser(userId: number): Promise<AiInteraction[]>;
}

const memoryRepository: InteractionRepository = {
  async create(input) {
    return recordInteraction(input);
  },

  async findById(id) {
    return getInteractionById(id);
  },

  async listByUser(_userId) {
    throw new Error(
      'El listado de interacciones en memoria aún no está implementado.'
    );
  },
};

const postgresRepository: InteractionRepository = {
  create: createInteractionInPostgres,
  findById: findInteractionInPostgres,
  listByUser: listInteractionsInPostgres,
};

export const interactionsRepository: InteractionRepository =
  env.nodeEnv === 'test'
    ? memoryRepository
    : postgresRepository;

export function resetMemoryInteractionsRepository(): void {
  resetInteractions();
}
