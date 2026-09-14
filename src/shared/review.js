const DAY = 86400000;
const steps = [1, 3, 7, 14, 30, 60, 120];
export function reviewState(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
  const nonnegative = (key, max) => Math.min(max, Math.max(0, Number.isFinite(value[key]) ? value[key] : 0));
  return {
    stage: Math.floor(nonnegative('stage', steps.length)), dueAt: nonnegative('dueAt', 8640000000000000),
    lastReviewedAt: nonnegative('lastReviewedAt', 8640000000000000),
    reviews: Math.floor(nonnegative('reviews', 100000)), lapses: Math.floor(nonnegative('lapses', 100000)),
    lastReviewId: typeof value.lastReviewId === 'string' ? value.lastReviewId.slice(0, 100) : ''
  };
}
export function scheduleReview(previous, grade, now = Date.now(), reviewId = '') {
  if (!['again', 'hard', 'good', 'easy'].includes(grade)) throw new Error('复习评价无效');
  const state = reviewState(previous);
  if (reviewId && state.lastReviewId === reviewId) return state;
  const stage = grade === 'again' ? 0 : grade === 'hard' ? state.stage : Math.min(steps.length, state.stage + (grade === 'easy' ? 2 : 1));
  const delay = grade === 'again' ? 60000 : grade === 'hard' ? 600000 : steps[Math.max(0, stage - 1)] * DAY;
  return { stage, dueAt: now + delay, lastReviewedAt: now, reviews: state.reviews + 1, lapses: state.lapses + (grade === 'again' ? 1 : 0), lastReviewId: reviewId };
}
export const isDue = (word, now = Date.now()) => !word.mastered && reviewState(word.review).dueAt <= now;
export function reviewQueue(words, { language = 'all', mode = 'due', limit = 20, now = Date.now() } = {}) {
  return words.filter(w => (language === 'all' || (w.language || 'ja') === language) && w.meaning?.trim() && (mode === 'all' || isDue(w, now)))
    .sort((a, b) => reviewState(a.review).dueAt - reviewState(b.review).dueAt || a.createdAt - b.createdAt)
    .slice(0, Math.min(100, Math.max(1, Number(limit) || 20)));
}
