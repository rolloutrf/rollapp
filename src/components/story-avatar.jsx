import { useEffect, useRef, useState } from 'react';
import { Camera, Square, RotateCcw, Upload, Settings } from 'lucide-react';
import { api } from '@/api';
import { useUserStories } from '@/hooks/use-user-stories';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/form-surface';
import './stories.css';

const MAX_SECONDS = 60;
export function StoryAvatar({ user, own = false, onEditProfile, children, className = '' }) {
  const { stories, loadError } = useUserStories(user?.username);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('record');
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [blob, setBlob] = useState(null);
  const [preview, setPreview] = useState('');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const video = useRef(null);
  const stream = useRef(null);
  const recorder = useRef(null);
  const timer = useRef(null);
  const clock = useRef(null);
  const generation = useRef(0);
  const fileInput = useRef(null);
  const fileIntent = useRef(null);
  const pendingProfile = useRef(false);
  const current = stories[index];
  function releaseCamera() {
    clearTimeout(timer.current); clearInterval(clock.current);
    if (recorder.current?.state === 'recording') recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
  }
  useEffect(() => {
    if (!open) {
      generation.current++;
      releaseCamera(); setRecording(false); setBlob(null); setError('');
    }
    return () => { generation.current++; releaseCamera(); };
  }, [open]);
  useEffect(() => { setOpen(false); }, [user?.id, user?.username, own]);
  useEffect(() => {
    if (!blob) { setPreview(''); return; }
    const url = URL.createObjectURL(blob); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  useEffect(() => {
    const stopWhenHidden = () => {
      if (!document.hidden) return;
      if (recorder.current?.state !== 'recording') { generation.current++; setBusy(false); }
      releaseCamera();
    };
    document.addEventListener('visibilitychange', stopWhenHidden);
    return () => document.removeEventListener('visibilitychange', stopWhenHidden);
  }, []);
  const start = async () => {
    setError(''); setBlob(null); setBusy(true);
    const intent = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Запись в этом браузере недоступна. Используйте камеру через «Выбрать видео».');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: true });
      if (intent !== generation.current || document.hidden) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      video.current.srcObject = media;
      await video.current.play();
      if (intent !== generation.current || document.hidden) { media.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(media, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_000_000 });
      recorder.current = instance;
      const chunks = [];
      let deadline;
      let ticker;
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onstop = () => {
        if (intent === generation.current) { setBlob(new Blob(chunks, { type: instance.mimeType })); setRecording(false); }
        clearTimeout(deadline); clearInterval(ticker);
        media.getTracks().forEach(track => track.stop());
        if (stream.current === media) { stream.current = null; if (video.current) video.current.srcObject = null; }
      };
      instance.onerror = () => { if (intent === generation.current) { setError('Запись прервана. Попробуйте ещё раз.'); releaseCamera(); } };
      instance.start(250); setRecording(true); setSeconds(0);
      const started = performance.now();
      clock.current = ticker = setInterval(() => setSeconds(Math.min(MAX_SECONDS, Math.floor((performance.now() - started) / 1000))), 100);
      timer.current = deadline = setTimeout(releaseCamera, MAX_SECONDS * 1000);
    } catch (cause) {
      if (intent === generation.current) {
        releaseCamera();
        setError(cause.name === 'NotAllowedError' ? 'Разрешите доступ к камере и микрофону или выберите готовое видео.' : cause.message || 'Камера недоступна. Выберите готовое видео.');
      }
    } finally { if (intent === generation.current) setBusy(false); }
  };
  const publish = async () => {
    setBusy(true); setError('');
    const intent = generation.current;
    try {
      await api.uploadStory(blob);
      window.dispatchEvent(new Event('rollapp:stories'));
      if (intent === generation.current) setOpen(false);
    } catch (cause) { if (intent === generation.current) setError(cause.message); }
    finally { if (intent === generation.current) setBusy(false); }
  };
  return <>
    <Button variant="ghost" type="button" className={`story-avatar ${stories.length ? 'story-avatar--active' : ''} ${className}`}
      aria-label={own ? (stories.length ? 'Посмотреть или добавить сторис' : 'Записать сторис') : `Сторис ${user.name}`}
      title={own ? 'Сторис · до 1 минуты' : 'Посмотреть сторис'}
      onClick={() => { setIndex(0); setMode(stories.length || !own ? 'view' : 'record'); setBusy(false); setOpen(true); }}>
      {children}
    </Button>
    <Drawer open={open} onOpenChange={setOpen} onAfterClose={() => { if (pendingProfile.current) { pendingProfile.current = false; onEditProfile?.(); } }}>
      <DrawerContent className="story-surface rollapp-body">
        <form className="story-form" onSubmit={event => {
          event.preventDefault();
          if (busy || !own) return;
          if (mode === 'view') { setMode('record'); setError(''); }
          else if (recording) releaseCamera();
          else if (blob) publish();
          else start();
        }}>
        <DrawerHeader><DrawerTitle>{mode === 'view' ? `Сторис · ${user.name}` : 'Новая сторис'}</DrawerTitle>
          <DrawerDescription>{mode === 'view' ? 'Доступна в течение 24 часов после публикации' : 'До 60 секунд · исчезнет через 24 часа · видна всем'}</DrawerDescription>
        </DrawerHeader>
        <div className="story-body">
          {(error || loadError) && <p role="alert">{error || loadError}</p>}
          {mode === 'view' ? current ? <>
            <video key={current.id} src={current.videoUrl} className="story-video" controls autoPlay playsInline
              onEnded={() => { if (index + 1 < stories.length) setIndex(index + 1); }}
              onError={() => setError('Сторис недоступна или срок её действия истёк.')} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>Предыдущая</Button>
              <span className="text-muted-foreground" aria-live="polite">{index + 1} / {stories.length}</span>
              <Button variant="outline" disabled={index + 1 === stories.length} onClick={() => setIndex(index + 1)}>Следующая</Button>
            </div>
          </> : <p>Активных сторис пока нет.</p> : <>
            {!recording && !busy && !preview && <div className="story-video story-video--placeholder"><Camera aria-hidden="true" /><span>Камера включится после нажатия «Записать»</span></div>}
            <video hidden={!recording && !busy && !preview} ref={video} src={preview || undefined} className="story-video" muted={!preview} controls={!!preview} playsInline
              onTimeUpdate={event => { if (preview && event.currentTarget.currentTime >= MAX_SECONDS) event.currentTarget.pause(); }} />
            <p className="text-center" role="status">{recording ? `${String(seconds).padStart(2, '0')} / 60 сек` : blob ? 'Предпросмотр · опубликуются первые 60 секунд' : 'Нажмите «Записать», когда будете готовы'}</p>
            <input ref={fileInput} type="file" accept="video/mp4,video/webm,video/quicktime" capture="user" className="sr-only" hidden onChange={event => {
              const file = event.target.files?.[0]; event.target.value = '';
              if (!file || fileIntent.current !== generation.current) return;
              if (file.size > 25 * 1024 * 1024) { setError('Выберите видео не больше 25 МБ.'); return; }
              setBlob(file); setError('');
            }} />
          </>}
        </div>
        <DrawerFooter>
          {own && mode === 'view' && <Button type="submit" className="flex-1"><Camera />Добавить сторис</Button>}
          {own && mode === 'record' && <>
            {recording ? <Button type="submit" className="flex-1"><Square />Остановить</Button> : blob
              ? <Button type="submit" className="flex-1" disabled={busy}>{busy ? 'Публикуем…' : 'Опубликовать'}</Button>
              : <Button type="submit" className="flex-1" disabled={busy}><Camera />{busy ? 'Открываем камеру…' : 'Записать'}</Button>}
            {!recording && <Button data-control-icon size="icon" variant="outline" aria-label={blob ? 'Перезаписать' : 'Выбрать видео'} disabled={busy} onClick={() => { if (blob) { setBlob(null); setError(''); } else { fileIntent.current = generation.current; fileInput.current?.click(); } }}>
              {blob ? <RotateCcw /> : <Upload />}</Button>}
          </>}
          {own && onEditProfile && !recording && <Button data-control-icon size="icon" variant="outline" disabled={busy} aria-label="Редактировать профиль" onClick={() => { pendingProfile.current = true; setOpen(false); }}><Settings /></Button>}
          <Button className="hidden md:inline-flex" variant="outline" onClick={() => setOpen(false)}>Закрыть</Button>
        </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  </>;
}
