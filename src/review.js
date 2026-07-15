import { Rating, createEmptyCard, fsrs } from 'ts-fsrs';

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 3650,
  enable_fuzz: true,
  enable_short_term: true,
});

export const REVIEW_RATINGS = [
  { value: Rating.Again, label: '忘记', className: 'rating-again' },
  { value: Rating.Hard, label: '困难', className: 'rating-hard' },
  { value: Rating.Good, label: '记得', className: 'rating-good' },
  { value: Rating.Easy, label: '熟练', className: 'rating-easy' },
];

function dateOrUndefined(value) {
  if (!value) return undefined;
  return value instanceof Date ? value : new Date(value);
}

export function reviveCard(card) {
  if (!card) return createEmptyCard(new Date());
  return {
    ...card,
    due: dateOrUndefined(card.due) || new Date(),
    last_review: dateOrUndefined(card.last_review),
  };
}

export function scheduleReview(progress, rating, now = new Date()) {
  const card = reviveCard(progress?.card);
  return scheduler.next(card, now, rating).card;
}

export function previewIntervals(progress, now = new Date()) {
  const card = reviveCard(progress?.card);
  const preview = scheduler.repeat(card, now);
  return REVIEW_RATINGS.reduce((result, rating) => {
    result[rating.value] = formatInterval(now, preview[rating.value].card.due);
    return result;
  }, {});
}

export function isDue(progress, now = new Date()) {
  return Boolean(progress?.card) && reviveCard(progress.card).due <= now;
}

export function formatInterval(from, due) {
  const milliseconds = Math.max(0, new Date(due).getTime() - new Date(from).getTime());
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} 个月`;
  return `${Math.round(months / 12)} 年`;
}

export function buildReviewQueue(terms, progressMap, dailyNewLimit, now = new Date()) {
  const due = terms
    .filter(term => isDue(progressMap.get(term.id), now))
    .sort((left, right) => reviveCard(progressMap.get(left.id).card).due - reviveCard(progressMap.get(right.id).card).due);

  const newTerms = terms
    .filter(term => !progressMap.get(term.id)?.card)
    .sort((left, right) => Number(Boolean(progressMap.get(right.id)?.favorite)) - Number(Boolean(progressMap.get(left.id)?.favorite)))
    .slice(0, dailyNewLimit);

  return [...due, ...newTerms];
}

export function localDateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateStreak(activity) {
  const dates = new Set(activity.map(item => localDateKey(item.reviewedAt)));
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
