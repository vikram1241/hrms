import { APP_NAME, LOGO_MARK_URL, LOGO_URL } from '../../config/brand.js';
import { cn } from '../../lib/cn.js';

/**
 * @param {'full'|'mark'} variant
 * @param {'light'|'dark'} on — light = for dark backgrounds (wordmark text next to mark)
 */
export default function BrandLogo({ variant = 'full', on = 'light', className, markClassName, showWordmark = true }) {
  if (variant === 'full') {
    return (
      <img
        src={LOGO_URL}
        alt={APP_NAME}
        className={cn('h-9 w-auto object-contain', className)}
      />
    );
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <img
        src={LOGO_MARK_URL}
        alt=""
        aria-hidden="true"
        className={cn('h-9 w-9 object-contain', markClassName)}
      />
      {showWordmark && (
        <span className={cn('text-sm font-bold tracking-wide', on === 'dark' ? 'text-white' : 'text-ink')}>
          {APP_NAME}
        </span>
      )}
    </div>
  );
}
