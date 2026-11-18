import { reviewsRepository } from './reviews.repository';

export const reviewsService = {
  create: reviewsRepository.create,
  findActive: reviewsRepository.findActive,
  listByInteraction: reviewsRepository.listByInteraction,
  attachFollowUp: reviewsRepository.attachFollowUp,
};
