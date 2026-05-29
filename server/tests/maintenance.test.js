import mongoose from 'mongoose';
import { setupTestDB, teardownTestDB, clearDB } from './helpers.js';
import { Query } from '../models/Query.js';
import { Answer } from '../models/Answer.js';
import { FaqEntry } from '../models/FaqEntry.js';
import { Like } from '../models/Like.js';
import { User } from '../models/User.js';
import { AuditLog } from '../models/AuditLog.js';
import { lruEviction } from '../jobs/lruEviction.js';
import { stalenessCheck } from '../jobs/stalenessCheck.js';
import { orphanCleanup } from '../jobs/orphanCleanup.js';
import { embeddingRefresh } from '../jobs/embeddingRefresh.js';
import { softDeletePurge } from '../jobs/softDeletePurge.js';
import { jobs } from '../jobs/index.js';
import * as queryService from '../services/queryService.js';
import { recalcAllBadges } from '../services/badgeService.js';

const oid = () => new mongoose.Types.ObjectId();
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

beforeAll(async () => {
  await setupTestDB();
});
afterAll(async () => {
  await teardownTestDB();
});
afterEach(async () => {
  await clearDB();
});

describe('maintenance jobs', () => {
  test('registry exposes all eight jobs', () => {
    expect(Object.keys(jobs).sort()).toEqual(
      [
        'badge-recalc',
        'embedding-refresh',
        'expire-bans',
        'finalize-solutions',
        'lru-eviction',
        'orphan-cleanup',
        'soft-delete-purge',
        'staleness-check',
      ].sort(),
    );
  });

  test('lru-eviction archives stale resolved queries; access unarchives them', async () => {
    const author = oid();
    const stale = await Query.create({
      title: 'Old resolved question',
      body: 'Resolved long ago and untouched since.',
      author_id: author,
      status: 'resolved',
      last_accessed_at: daysAgo(120),
    });
    const fresh = await Query.create({
      title: 'Recently viewed resolved question',
      body: 'Resolved but accessed recently.',
      author_id: author,
      status: 'resolved',
      last_accessed_at: daysAgo(2),
    });

    expect(await lruEviction()).toEqual({ archived: 1 });
    expect((await Query.findById(stale._id)).is_archived).toBe(true);
    expect((await Query.findById(fresh._id)).is_archived).toBe(false);

    // Viewing the archived query brings it back.
    await queryService.getQuery(stale._id, null);
    expect((await Query.findById(stale._id)).is_archived).toBe(false);
  });

  test('badge-recalc resyncs badges to points', async () => {
    const user = await User.create({
      name: 'Stale Badges',
      email: 'stale@example.com',
      password_hash: 'x',
      points: 200,
      badges: [],
    });
    const res = await recalcAllBadges();
    expect(res.updated).toBe(1);
    expect((await User.findById(user._id)).badges).toEqual(['helper', 'contributor']);
  });

  test('staleness-check flags old answers as outdated', async () => {
    const old = await Answer.create({ query_id: oid(), author_id: oid(), body: 'old' });
    const recent = await Answer.create({ query_id: oid(), author_id: oid(), body: 'new' });
    // timestamps:true manages createdAt, so backdate via the raw collection.
    await Answer.collection.updateOne({ _id: old._id }, { $set: { createdAt: daysAgo(200) } });

    expect(await stalenessCheck()).toEqual({ flagged: 1 });
    expect((await Answer.findById(old._id)).is_outdated).toBe(true);
    expect((await Answer.findById(recent._id)).is_outdated).toBe(false);
  });

  test('orphan-cleanup removes likes pointing at deleted answers', async () => {
    const liveAnswer = await Answer.create({ query_id: oid(), author_id: oid(), body: 'live' });
    const deadAnswer = await Answer.create({ query_id: oid(), author_id: oid(), body: 'dead', is_deleted: true });
    await Like.create({ answer_id: liveAnswer._id, user_id: oid() });
    await Like.create({ answer_id: deadAnswer._id, user_id: oid() });
    await Like.create({ answer_id: oid(), user_id: oid() }); // dangling

    const res = await orphanCleanup();
    expect(res.likes_removed).toBe(2);
    expect(await Like.countDocuments({})).toBe(1);
  });

  test('embedding-refresh re-embeds queries with a stale hash', async () => {
    const q = await Query.create({
      title: 'Needs a fresh embedding',
      body: 'The stored hash does not match this text.',
      author_id: oid(),
      embedding_hash: 'stale-hash',
    });
    const res = await embeddingRefresh();
    expect(res.refreshed).toBe(1);
    const updated = await Query.findById(q._id);
    expect(updated.embedding_hash).not.toBe('stale-hash');
    expect(updated.embedding).toHaveLength(768);

    // Second run is a no-op now the hash matches.
    expect((await embeddingRefresh()).refreshed).toBe(0);
  });

  test('soft-delete-purge hard-deletes old soft-deleted content with an audit record', async () => {
    const author = oid();
    await Query.create({
      title: 'Long gone question',
      body: 'Soft-deleted well beyond the retention window.',
      author_id: author,
      is_deleted: true,
      deleted_at: daysAgo(45),
    });
    await Query.create({
      title: 'Recently deleted question',
      body: 'Soft-deleted only yesterday.',
      author_id: author,
      is_deleted: true,
      deleted_at: daysAgo(1),
    });

    const res = await softDeletePurge();
    expect(res.query).toBe(1);
    expect(await Query.countDocuments({})).toBe(1); // the recent one survives
    expect(await AuditLog.countDocuments({ action: 'query.purge' })).toBe(1);
  });
});
