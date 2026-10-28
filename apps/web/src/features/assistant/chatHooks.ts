import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** A cuántos píxeles del final todavía se considera "abajo" para el desplazamiento automático. */
const STICKY_PX = 120;

/**
 * Desplazamiento automático solo mientras la persona está al final (AC-010-08). `changes` son los datos que, al
 * cambiar, piden bajar; `pin()` fuerza quedarse abajo (al enviar un mensaje).
 */
export function useStickToBottom(changes: { [key: string]: unknown }) {
  const stick = useRef(true);
  useEffect(() => {
    const onScroll = () => {
      const { scrollHeight } = document.documentElement;
      stick.current = window.innerHeight + window.scrollY >= scrollHeight - STICKY_PX;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const { messages, live, runs, decisions } = changes;
  useLayoutEffect(() => {
    if (stick.current) window.scrollTo?.({ top: document.documentElement.scrollHeight });
  }, [messages, live, runs, decisions]);
  return () => {
    stick.current = true;
  };
}

/** Soltar un archivo en cualquier parte del panel (AC-010-08): `dragging` enciende la capa de ayuda. */
export function useFileDrop(onFile: (file: File | undefined) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const drop = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      onFile(e.dataTransfer.files[0]);
    },
  };
  return { dragging, drop };
}
