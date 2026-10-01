import wordmark from '@/assets/nuuke-logo.png';
import mark from '@/assets/nuuke-mark.png';
import clsx from 'clsx';

export function Logo({ className, markOnly }: { className?: string; markOnly?: boolean }) {
  return (
    <img
      src={markOnly ? mark : wordmark}
      alt="NUUKE"
      className={clsx('logo select-none', markOnly ? 'size-8' : 'h-[22px] w-auto', className)}
      draggable={false}
    />
  );
}
