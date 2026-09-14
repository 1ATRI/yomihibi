import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleReview, reviewQueue, isDue, reviewState } from '../src/shared/review.js';
import { sanitizeWord, wordId } from '../src/shared/japanese.js';
const now = 1800000000000;
test('good recall follows growing review intervals and easy skips one stage', () => {
  const first = scheduleReview({}, 'good', now, 'review-one');
  assert.equal(first.dueAt, now + 86400000); assert.equal(first.stage, 1);
  const next = scheduleReview(first, 'good', now, 'review-two');
  assert.equal(next.dueAt, now + 3 * 86400000); assert.equal(next.reviews, 2);
  assert.equal(scheduleReview({}, 'easy', now, 'review-three').dueAt, now + 3 * 86400000);
});
test('forgetting resets interval, hard review comes back in ten minutes', () => {
  const again = scheduleReview({ stage: 6, reviews: 8, lapses: 1 }, 'again', now, 'again-one');
  assert.equal(again.stage, 0); assert.equal(again.lapses, 2); assert.equal(again.dueAt, now + 60000);
  assert.equal(scheduleReview(again, 'hard', now, 'hard-one').dueAt, now + 600000);
  assert.throws(() => scheduleReview({}, 'invalid'), /无效/);
});
test('retrying a recorded review id does not advance the schedule twice', () => {
  const first = scheduleReview({}, 'good', now, 'unique-review');
  assert.deepEqual(scheduleReview(first, 'good', now + 500, 'unique-review'), first);
});
test('review queue handles language, due time, mastered and missing meanings', () => {
  const words = [
    { surface: '猫', language: 'ja', meaning: '猫', createdAt: 1 },
    { surface: 'book', language: 'en', meaning: '书', createdAt: 2, review: { dueAt: now + 60000 } },
    { surface: 'read', language: 'en', meaning: '读', mastered: true, createdAt: 3 },
    { surface: 'empty', language: 'en', meaning: '', createdAt: 4 }
  ];
  assert.equal(reviewQueue(words, { now }).length, 1);
  assert.equal(reviewQueue(words, { now, language: 'en', mode: 'all' }).length, 2);
  assert.equal(isDue(words[0], now), true); assert.equal(isDue(words[1], now), false);
});
test('v1 favorites retain Japanese ids and new backups preserve review records', () => {
  const legacy = { surface: '日本語', base: '日本語', reading: 'にほんご', meaning: '日语', note: '旧笔记' };
  const migrated = sanitizeWord(legacy); assert.equal(migrated.id, wordId(legacy)); assert.equal(migrated.language, 'ja'); assert.equal(migrated.note, '旧笔记');
  const english = sanitizeWord({ surface: 'Books', base: 'Book', language: 'en', meaning: '书', review: scheduleReview({}, 'good', now, 'backup-review') });
  assert.equal(english.id, 'en␟book'); assert.equal(english.review.stage, 1);
  assert.equal(sanitizeWord(JSON.parse(JSON.stringify(english))).review.dueAt, now + 86400000);
  assert.equal(reviewState({ dueAt: Infinity, stage: -1 }).dueAt, 0);
  assert.deepEqual(reviewState(null), reviewState({}));
  assert.equal(sanitizeWord({ ...legacy, review: null }).review.dueAt, 0);
});
