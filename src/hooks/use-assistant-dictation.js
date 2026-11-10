import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ASSISTANT_MESSAGE_LIMIT } from '../../shared/messenger-assistant.js';

const speechErrors = {
  'not-allowed': 'Разрешите доступ к микрофону в настройках браузера.',
  'service-not-allowed': 'Браузер заблокировал сервис распознавания речи.',
  'audio-capture': 'Микрофон недоступен. Проверьте его подключение.',
  'no-speech': 'Речь не распознана. Попробуйте ещё раз.',
  network: 'Сервис распознавания речи недоступен. Попробуйте ещё раз.',
};
const startError = 'Не удалось включить диктовку. Попробуйте ещё раз.';

export function useAssistantDictation({ disabled, setDraft }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const session = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [notice, setNotice] = useState('');

  const cancel = useCallback(() => {
    const current = session.current;
    if (!current) return;
    session.current = null;
    current.engine.abort();
  }, []);

  const toggle = useCallback(() => {
    if (disabled || !Recognition) return;
    const current = session.current;
    if (current) {
      if (current.stopping) return;
      current.stopping = true;
      setPhase('stopping');
      current.engine.stop();
      return;
    }

    try {
      const engine = new Recognition();
      const recording = { engine, stopping: false, nextResult: 0 };
      session.current = recording;
      engine.lang = 'ru-RU';
      engine.continuous = true;
      engine.onstart = () => {
        if (session.current === recording && !recording.stopping) setPhase('listening');
      };
      engine.onresult = event => {
        if (session.current !== recording) return;
        const words = [];
        for (let i = Math.max(event.resultIndex, recording.nextResult); i < event.results.length; i++) {
          const result = event.results[i];
          if (!result.isFinal) break;
          recording.nextResult = i + 1;
          const spoken = result[0].transcript.trim();
          if (spoken) words.push(spoken);
        }
        if (words.length) {
          const phrase = words.join(' ');
          setDraft(text => {
            const separator = text && !/\s$/u.test(text) ? ' ' : '';
            return `${text}${separator}${phrase}`.slice(0, ASSISTANT_MESSAGE_LIMIT);
          });
        }
      };
      engine.onerror = event => {
        if (session.current !== recording) return;
        session.current = null;
        setPhase('idle');
        setNotice(speechErrors[event.error] || startError);
      };
      engine.onend = () => {
        if (session.current !== recording) return;
        session.current = null;
        setPhase('idle');
      };
      setNotice('');
      setPhase('starting');
      engine.start();
    } catch {
      session.current = null;
      setPhase('idle');
      setNotice(startError);
    }
  }, [Recognition, disabled, setDraft]);

  useLayoutEffect(() => {
    const stopForHiddenPage = () => {
      if (document.visibilityState === 'hidden' && session.current) {
        cancel();
        setPhase('idle');
      }
    };
    document.addEventListener('visibilitychange', stopForHiddenPage);
    return () => {
      document.removeEventListener('visibilitychange', stopForHiddenPage);
      cancel();
    };
  }, [cancel]);

  useLayoutEffect(() => {
    if (disabled && session.current) {
      cancel();
      setPhase('idle');
    }
  }, [disabled, cancel]);

  useEffect(() => {
    if (!Recognition || disabled) return;
    const onKeyDown = event => {
      if (event.key !== ' ' || event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.target instanceof Element && event.target.closest(
        'button, a[href], input, textarea, select, [contenteditable], [role="button"], [role="checkbox"], [role="menu"]',
      )) return;
      event.preventDefault();
      if (!event.repeat) toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [Recognition, disabled, toggle]);

  return {
    active: phase !== 'idle',
    stopping: phase === 'stopping',
    supported: Boolean(Recognition),
    status: notice || {
      starting: 'Подключаем микрофон…',
      listening: 'Слушаю… Пробел или кнопка — остановить',
      stopping: 'Завершаем диктовку…',
    }[phase],
    toggle,
  };
}
