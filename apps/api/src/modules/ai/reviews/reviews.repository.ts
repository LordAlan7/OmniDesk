import { env } from '../../../config/env';
import type { AiReview } from './reviews';

import {
  recordReview,
  getActiveReviewForInteraction,
  listReviewsForInteraction,
  attachFollowUp,
  resetReviews,
} from './reviews';

import {
  createReviewInPostgres,
  findActiveReviewInPostgres,
  listReviewsInPostgres,
  attachFollowUpInPostgres,
} from './reviews.postgres.repository';

export interface ReviewsRepository {
  create(
    input: Omit<AiReview, 'id' | 'reviewedAt'>
  ): Promise<AiReview>;

  findActive(
    interactionId: number
  ): Promise<AiReview | undefined>;

  listByInteraction(
    interactionId: number
  ): Promise<AiReview[]>;

  attachFollowUp(
    reviewId: number,
    followUpInteractionId: number
  ): Promise<void>;
}

const memoryRepository: ReviewsRepository = {
  async create(input) {
    return recordReview(input);
  },

  async findActive(interactionId) {
    return getActiveReviewForInteraction(interactionId);
  },

  async listByInteraction(interactionId) {
    return listReviewsForInteraction(interactionId);
  },

  async attachFollowUp(reviewId, followUpInteractionId) {
    attachFollowUp(reviewId, followUpInteractionId);
  },
};

const postgresRepository: ReviewsRepository = {
  create: createReviewInPostgres,
  findActive: findActiveReviewInPostgres,
  listByInteraction: listReviewsInPostgres,
  attachFollowUp: attachFollowUpInPostgres,
};

export const reviewsRepository: ReviewsRepository =
  env.nodeEnv === 'test'
    ? memoryRepository
    : postgresRepository;

export function resetMemoryReviewsRepository(): void {
  resetReviews();
}
