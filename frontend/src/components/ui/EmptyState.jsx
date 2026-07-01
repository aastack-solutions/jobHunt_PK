import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="glass flex flex-col items-center justify-center rounded-3xl px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue/15 to-brand-violet/15">
        <Icon className="h-8 w-8 text-brand-violet" />
      </div>
      {title && <h3 className="text-base font-bold text-slate-800">{title}</h3>}
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && (
        <Button className="mt-5" variant={action.variant || 'primary'} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
