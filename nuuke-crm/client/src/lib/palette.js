/** Squad identity — one colour per department, shared by pills and charts. */
export const DEPARTMENT_COLOR = {
  Backend: 'var(--cat-1)',
  iOS: 'var(--cat-2)',
  Design: 'var(--cat-3)',
  Android: 'var(--cat-4)',
  Web: 'var(--cat-5)',
  Product: 'var(--cat-6)',
  DevOps: 'var(--cat-7)',
  QA: 'var(--cat-8)',
};

export const DEPARTMENTS = Object.keys(DEPARTMENT_COLOR);

/** Colours for groups that have no status of their own (grouped by project, person…). */
export const GROUP_PALETTE = [
  '#0086C0', '#00C875', '#A25DDC', '#FDAB3D', '#2BCBBA',
  '#E2445C', '#5559DF', '#FF642E', '#FF5AC4', '#784BD1', '#037F4C', '#A4795A',
];

/** Statuses that mean "finished", for completion percentages. */
export const DONE_LIKE = new Set([
  'Done', 'Closed', 'Completed', 'Won', 'Live', 'Paid', 'Approved', 'Delivered', 'Verified', 'Signed', 'Launched',
]);
