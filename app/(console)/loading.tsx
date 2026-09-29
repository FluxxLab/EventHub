import { LogoLoader } from '@/components/ui/logo-loader';

/** Shown while a console page opens (its code is still loading). */
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" aria-busy="true">
      <LogoLoader size={88} />
    </div>
  );
}
