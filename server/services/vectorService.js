// ─── Swappable boundary candidate: VECTOR SEARCH ─────────────────────────────
// In-app cosine similarity over stored embeddings. Fine for MVP corpus sizes;
// for large corpora swap this module for a dedicated vector index (see
// PLANNING backlog) without touching callers.
import { Query } from '../models/Query.js';

/** Cosine similarity of two equal-length numeric vectors. */
export function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom ? dot / denom : 0;
}

/**
 * Find queries most similar to an embedding.
 * @param {number[]} embedding
 * @param {object} [opts]
 * @param {string} [opts.excludeId] query id to skip (e.g. the one being edited)
 * @param {number} [opts.limit] max results (default 5)
 * @param {number} [opts.threshold] minimum score to include (default 0)
 * @returns {Promise<Array<{ query: object, score: number }>>}
 */
export async function findSimilarQueries(embedding, { excludeId, limit = 5, threshold = 0 } = {}) {
  if (!Array.isArray(embedding) || embedding.length === 0) return [];

  const filter = {
    is_deleted: false,
    embedding: { $exists: true, $ne: null },
  };
  if (excludeId) filter._id = { $ne: excludeId };

  const candidates = await Query.find(filter)
    .select('title category status author_id is_anonymous embedding createdAt')
    .lean();

  return candidates
    .map((query) => {
      const { embedding: vec, ...rest } = query;
      return { query: rest, score: cosineSimilarity(embedding, vec) };
    })
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export default { cosineSimilarity, findSimilarQueries };
