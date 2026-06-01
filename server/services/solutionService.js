import { Answer } from '../models/Answer.js';
import { Query } from '../models/Query.js';
import { ApiError } from '../utils/ApiError.js';
import { notify } from './notificationService.js';
import {
  QUERY_STATUS,
  NOTIFICATION_TYPE,
  GRACE_PERIOD_HOURS,
  ROLES,
} from '../config/constants.js';

/**
 * Path A of the Solution Marking Engine: the query author (or an admin, as an
 * approved solution) picks an answer. Starts the 48h grace period; points are
 * awarded later at finalization.
 */
export async function markSolution(user, queryId, answerId) {
  const query = await Query.findOne({ _id: queryId, is_deleted: false });
  if (!query) throw ApiError.notFound('Query not found');
  const isAuthor = String(query.author_id) === String(user._id);
  const isAdmin = user.role === ROLES.ADMIN;
  if (!isAuthor && !isAdmin) {
    throw ApiError.forbidden('Only the question author or an admin can mark a solution');
  }

  const answer = await Answer.findOne({ _id: answerId, query_id: query._id, is_deleted: false });
  if (!answer) throw ApiError.notFound('Answer not found for this question');

  // Single accepted answer at a time.
  await Answer.updateMany({ query_id: query._id }, { is_accepted: false });
  answer.is_accepted = true;
  await answer.save();

  query.accepted_answer_id = answer._id;
  query.grace_period_deadline = new Date(Date.now() + GRACE_PERIOD_HOURS * 60 * 60 * 1000);
  if (query.status === QUERY_STATUS.OPEN) query.status = QUERY_STATUS.ANSWERED;
  await query.save();

  if (String(answer.author_id) !== String(user._id)) {
    await notify({
      recipientId: answer.author_id,
      type: NOTIFICATION_TYPE.ACCEPT,
      title: 'Your answer was marked as the solution',
      message: query.title,
      link: `/queries/${query._id}`,
      queryId: query._id,
      answerId: answer._id,
    });
  }

  return {
    ok: true,
    accepted_answer_id: answer._id,
    grace_period_deadline: query.grace_period_deadline,
  };
}
