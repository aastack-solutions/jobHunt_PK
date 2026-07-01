export const APP_STATUSES = [
  { value: 'applied', label: 'Applied', order: 1 },
  { value: 'viewed', label: 'Viewed', order: 2 },
  { value: 'phone_screen', label: 'Phone Screen', order: 3 },
  { value: 'interview', label: 'Interview', order: 4 },
  { value: 'technical', label: 'Technical Test', order: 5 },
  { value: 'offer', label: 'Offer', order: 6 },
  { value: 'rejected', label: 'Rejected', order: 7 },
  { value: 'withdrawn', label: 'Withdrawn', order: 8 },
];

export function getStatusLabel(value) {
  const found = APP_STATUSES.find((s) => s.value === value);
  return found ? found.label : value;
}
