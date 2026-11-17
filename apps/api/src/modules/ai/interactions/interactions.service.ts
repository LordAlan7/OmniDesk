import { interactionsRepository } from './interactions.repository';

export const interactionsService = {
  create: interactionsRepository.create,
  findById: interactionsRepository.findById,
  listByUser: interactionsRepository.listByUser,
};
