import React from 'react';
import { createRoot } from 'react-dom/client';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';
import '../../src/index.css';

// Unsaved controls only; the same grid/Field/Input composition as sleep entries.
createRoot(document.getElementById('root')).render(
  <main className="rollapp-body p-4">
    <form className="flex min-w-0 flex-col gap-4" onSubmit={event => event.preventDefault()}>
      <h1>Записать сон</h1>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field><FieldLabel htmlFor="bedtime">Заснули</FieldLabel><Input id="bedtime" type="time" defaultValue="23:00" required /></Field>
        <Field><FieldLabel htmlFor="wake">Проснулись</FieldLabel><Input id="wake" type="time" defaultValue="07:00" required /></Field>
      </div>
      <Field><FieldLabel htmlFor="meal">Время приёма пищи</FieldLabel><Input id="meal" type="time" defaultValue="12:30" required /></Field>
    </form>
  </main>
);
