import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m';

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  if (totalMinutes === 60) {
    return '1h';
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  return status
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
