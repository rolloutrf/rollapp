import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Content links may wrap in a narrow card while retaining the Large control role.
export function CollectionSnippetLink({ href, label, children }) {
  return <a
    href={href}
    target="_blank"
    rel="noreferrer"
    aria-label={label}
    className={cn(buttonVariants({ variant: 'outline', size: 'default' }), 'pointer-events-auto relative z-20 h-auto min-h-12 w-full whitespace-normal px-4 text-rollapp-body text-foreground')}
  >
    <span className="min-w-0 wrap-anywhere">{children}</span>
  </a>;
}
