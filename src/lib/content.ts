type SponsorLike = {
  start_date: Date;
  end_date?: Date;
  placements: string[];
};

export function isActiveWindow(startDate: Date, endDate?: Date, now = new Date()) {
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  if (Number.isNaN(start.getTime())) return false;
  if (end && Number.isNaN(end.getTime())) return false;
  if (now < start) return false;
  if (end && now > end) return false;
  return true;
}

export function hasPlacement(item: SponsorLike, placement: string) {
  return Array.isArray(item.placements) && item.placements.includes(placement);
}
