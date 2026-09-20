import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Drawer, DrawerContent, DrawerClose, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FullscreenDialog } from '@/components/fullscreen-dialog';
import { DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisualViewport } from '@/hooks/use-visual-viewport';
import { drawerCases } from './drawer-cases';
import '../../src/styles.css';
import '../../src/index.css';

// Component-only regression fixture: no API or database substitute. These are
// the three scroll compositions used by the real app, with production CSS.
function Fields() {
  return <>{Array.from({length: 12}, (_, i) => <label key={i} className="grid gap-2">Поле {i + 1}<Input aria-label={`Поле ${i + 1}`} /></label>)}
    <label className="grid gap-2">Описание<Textarea aria-label="Описание" rows={3} /></label></>;
}
function Fixture() {
  useVisualViewport();
  const mobile = useIsMobile();
  const [mode, setMode] = useState(null);
  const [nested, setNested] = useState(false);
  const body = <div className="flex flex-col gap-4"><Fields /><Button onClick={() => setNested(true)}>Вложенная форма</Button></div>;
  return <><main style={{minHeight: '2000px'}}><h1>Overlay regression</h1>
    {['form', 'scroll-area', 'wish', 'fullscreen'].map(value => <Button key={value} onClick={() => setMode(value)}>{value}</Button>)}</main>
    {mode === 'fullscreen' ? <FullscreenDialog onClose={() => setMode(null)} className="wish-editor-screen">
      <Button className="wish-editor-screen__close" aria-label="Закрыть редактор" onClick={() => setMode(null)}>×</Button>
      <DialogTitle className="sr-only">Полный экран</DialogTitle><DialogDescription className="sr-only">Проверка клавиатуры</DialogDescription>
      <form className="wish-editor flex flex-col"><div className="wish-editor-screen__content"><Fields /></div><footer className="wish-editor-screen__footer"><Button type="button" onClick={() => setMode(null)}>Закрыть</Button></footer></form>
    </FullscreenDialog> : <Drawer open={!!mode} showSwipeHandle swipeDirection={mobile ? 'down' : 'right'} onOpenChange={open => !open && setMode(null)}>
      <DrawerContent className={`rollapp-body app-drawer--form ${mode === 'wish' ? 'wish-editor-drawer' : ''}`}>
        <DrawerClose render={<Button className="absolute right-2 top-2 z-10" variant="ghost" />} aria-label="Закрыть">×</DrawerClose>
        {mode === 'wish' ? <><DrawerHeader className="pr-16"><DrawerTitle>Добавить желание</DrawerTitle><DrawerDescription>Добавьте изображение и заполните основную информацию.</DrawerDescription></DrawerHeader>
          <section className="wish-editor-screen wish-editor-screen--drawer"><form className="wish-editor wish-editor--create flex flex-col"><div className="wish-editor-screen__content px-4">{body}</div><footer className="wish-editor-screen__footer"><Button className="wish-editor__submit h-12 px-4" type="button">Сохранить</Button></footer></form></section></>
        : <form className="flex min-h-0 flex-1 flex-col"><DrawerHeader className="pr-16"><DrawerTitle>Форма</DrawerTitle><DrawerDescription>Проверка полей, прокрутки и действий.</DrawerDescription></DrawerHeader>
          {mode === 'scroll-area' ? <ScrollArea className="min-h-0 flex-1"><div className="p-4">{body}</div></ScrollArea> : <div className="app-drawer-body flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">{body}</div>}
          <DrawerFooter className="border-t pt-4"><Button type="button">Сохранить</Button><DrawerClose render={<Button type="button" variant="outline" />}>Отмена</DrawerClose></DrawerFooter></form>}
      </DrawerContent>
      <Drawer open={nested} onOpenChange={setNested} swipeDirection={mobile ? 'down' : 'right'}><DrawerContent className="app-drawer--compact"><DrawerHeader><DrawerTitle>Вложенная</DrawerTitle><DrawerDescription>Создание списка</DrawerDescription></DrawerHeader><div className="app-drawer-body min-h-0 overflow-y-auto p-4"><Input aria-label="Имя списка" /></div><DrawerFooter><DrawerClose render={<Button />}>Назад</DrawerClose></DrawerFooter></DrawerContent></Drawer>
    </Drawer>}
  </>;
}
const formName = new URLSearchParams(location.search).get('form');
if (formName) {
  const [, file, name, props] = drawerCases.find(([key]) => key === formName);
  const path = `/src/components/${file}.jsx?drawer-smoke-export=${name}`;
  const module = await import(/* @vite-ignore */ path);
  const Component = module[name];
  function RealForm() {
    useVisualViewport();
    const [open, setOpen] = useState(true);
    return open ? <Component {...props} open onOpenChange={setOpen} onClose={() => setOpen(false)} /> : null;
  }
  createRoot(document.getElementById('root')).render(<RealForm />);
} else createRoot(document.getElementById('root')).render(<Fixture />);
