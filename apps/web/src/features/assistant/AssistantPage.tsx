import type { AssistantMessage, AssistantToolCall } from '@mimark/contracts/assistant';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router';
import type { FocusComposerState } from '../../app/AppShell';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { useDashboard } from '../dashboard/dashboard.api';
import { validateFile } from '../payables/UploadForm';
import { isWrite, streamTurn, toToolResult, useRunTool } from './assistant.api';
import { Composer, DropOverlay, EmptyChat, SuggestionChips } from './AssistantParts';
import { isAbort, lastRead, recent, toolMessage } from './conversation';
import { type Decision, MessageList } from './MessageList';
import { followUpSuggestions, startSuggestions } from './suggestions';
import type { ToolRun } from './ToolCallRow';

/** Rondas de herramientas por mensaje de la persona (AC-008-06). */
const MAX_ROUNDS = 5;
/** Texto del mensaje cuando la persona envía solo el archivo (AC-011-04). */
const ATTACHED_PROMPT = 'Revisa la factura adjunta';
/** A cuántos píxeles del final todavía se considera "abajo" para el desplazamiento automático. */
const STICKY_PX = 120;

interface Waiting {
  conversation: AssistantMessage[];
  results: AssistantMessage[];
  writes: AssistantToolCall[];
}

/**
 * Asistente en lenguaje natural (specs 008 y 010). El texto llega en streaming; las lecturas se ejecutan solas y
 * se dibujan con su componente; las escrituras se muestran como confirmación y solo se ejecutan con el clic de la
 * persona, por los mismos endpoints que usan las pantallas.
 */
export function AssistantPage() {
  const runTool = useRunTool();
  const dashboard = useDashboard(7);
  const location = useLocation();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [live, setLive] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, ToolRun>>({});
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const dragDepth = useRef(0);

  // ⌘K desde cualquier pantalla (AppShell) llega aquí con el pedido de enfocar el compositor.
  const focusKey = (location.state as FocusComposerState | null)?.focusComposer;
  useEffect(() => {
    input.current?.focus();
  }, [focusKey]);

  // Desplazamiento automático solo mientras la persona está al final (AC-010-08).
  useEffect(() => {
    const onScroll = () => {
      const { scrollHeight } = document.documentElement;
      stick.current = window.innerHeight + window.scrollY >= scrollHeight - STICKY_PX;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useLayoutEffect(() => {
    if (stick.current) window.scrollTo?.({ top: document.documentElement.scrollHeight });
  }, [messages, live, runs, decisions]);

  async function readAll(reads: AssistantToolCall[]) {
    setRuns((prev) => ({
      ...prev,
      ...Object.fromEntries(reads.map((c) => [c.id, { status: 'running' as const }])),
    }));
    return Promise.all(
      reads.map(async (call) => {
        const outcome = await runTool(call, null);
        setRuns((prev) => ({
          ...prev,
          [call.id]: {
            status: outcome.error ? 'failed' : 'done',
            ms: outcome.ms,
            value: outcome.value,
            error: outcome.error,
          },
        }));
        return toolMessage(call, outcome.result);
      }),
    );
  }

  async function advance(start: AssistantMessage[]) {
    setBusy(true);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    abort.current = controller;
    let conversation = start;
    let partial = '';
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        partial = '';
        setLive('');
        const out = await streamTurn(
          { messages: recent(conversation) },
          (text) => {
            partial += text;
            setLive(partial);
          },
          controller.signal,
        );
        setLive(null);
        conversation = [
          ...conversation,
          { role: 'assistant', text: out.text, toolCalls: out.toolCalls },
        ];
        setMessages(conversation);
        if (out.toolCalls.length === 0) return;

        const reads = out.toolCalls.filter((c) => !isWrite(c.name));
        const writes = out.toolCalls.filter((c) => isWrite(c.name));
        const results = await readAll(reads);
        if (writes.length > 0) {
          setDecisions((prev) => ({
            ...prev,
            ...Object.fromEntries(writes.map((w) => [w.id, { status: 'pending' as const }])),
          }));
          setWaiting({ conversation, results, writes });
          return;
        }
        conversation = [...conversation, ...results];
        setMessages(conversation);
      }
      setNotice('El asistente llegó al máximo de pasos. Escribe de nuevo para continuar.');
    } catch (e) {
      setLive(null);
      if (isAbort(e)) {
        // Lo que alcanzó a llegar se queda en la conversación, sin herramientas.
        if (partial) {
          conversation = [...conversation, { role: 'assistant', text: partial, toolCalls: [] }];
          setMessages(conversation);
        }
        setNotice('Respuesta detenida.');
      } else {
        setError(e);
      }
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  async function decide(call: AssistantToolCall, confirm: boolean) {
    if (!waiting) return;
    let result: string;
    if (confirm) {
      setDecisions((prev) => ({ ...prev, [call.id]: { status: 'running' } }));
      const outcome = await runTool(call, null);
      setDecisions((prev) => ({
        ...prev,
        [call.id]: outcome.error
          ? { status: 'failed', error: outcome.error }
          : { status: 'confirmed', at: new Date() },
      }));
      result = outcome.result;
    } else {
      setDecisions((prev) => ({ ...prev, [call.id]: { status: 'cancelled' } }));
      result = toToolResult({ cancelled: true });
    }

    const results = [...waiting.results, toolMessage(call, result)];
    const remaining = waiting.writes.filter((w) => w.id !== call.id);
    if (remaining.length > 0) {
      setWaiting({ ...waiting, results, writes: remaining });
      return;
    }
    setWaiting(null);
    const conversation = [...waiting.conversation, ...results];
    setMessages(conversation);
    await advance(conversation);
  }

  /**
   * Adjuntar y enviar es el clic de la persona (spec 011, ADR-14): la factura se sube antes del turno, sin
   * propuesta, y su resultado entra a la conversación como una herramienta ya ejecutada.
   */
  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim() || (file ? ATTACHED_PROMPT : '');
    if (!text) return;
    stick.current = true;
    setError(null);
    setNotice(null);
    const user: AssistantMessage = { role: 'user', text };
    if (!file) {
      setDraft('');
      void advance([...messages, user]);
      return;
    }

    const upload: AssistantToolCall = {
      id: `upload-${crypto.randomUUID()}`,
      name: 'uploadPayable',
      input: {},
    };
    setBusy(true);
    const outcome = await runTool(upload, file);
    if (outcome.error) {
      setBusy(false);
      setError(new Error(outcome.error));
      return;
    }
    setDraft('');
    setFile(null);
    setDecisions((prev) => ({ ...prev, [upload.id]: { status: 'confirmed', at: new Date() } }));
    const conversation: AssistantMessage[] = [
      ...messages,
      user,
      { role: 'assistant', text: '', toolCalls: [upload] },
      toolMessage(upload, outcome.result),
    ];
    setMessages(conversation);
    void advance(conversation);
  }

  function attach(selected: File | undefined) {
    if (!selected) return;
    const problem = validateFile(selected);
    setFileError(problem);
    setFile(problem ? null : selected);
  }

  function pick(prompt: string) {
    setDraft(prompt);
    input.current?.focus();
  }

  // Soltar un archivo en cualquier parte del panel (AC-010-08).
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const drop = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!busy) attach(e.dataTransfer.files[0]);
    },
  };

  const locked = busy || waiting !== null;
  const followUps =
    !locked && messages.at(-1)?.role === 'assistant'
      ? followUpSuggestions(lastRead(messages, runs))
      : [];

  return (
    <Box
      {...drop}
      sx={{
        maxWidth: 720,
        mx: 'auto',
        minHeight: { md: 'calc(100dvh - 64px)' },
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {dragging && <DropOverlay />}
      <PageHeader title="Asistente" />
      <Stack
        spacing={2.5}
        role="log"
        aria-live="polite"
        aria-busy={live !== null}
        aria-label="Conversación"
        sx={{ flexGrow: 1, pb: 2 }}
      >
        {messages.length === 0 && live === null && (
          <EmptyChat suggestions={startSuggestions(dashboard.data)} onPick={pick} />
        )}
        <MessageList
          messages={messages}
          live={live}
          runs={runs}
          decisions={decisions}
          onDecide={(call, confirm) => void decide(call, confirm)}
        />
        {followUps.length > 0 && (
          <SuggestionChips aria-label="Seguimientos" suggestions={followUps} onPick={pick} />
        )}
        {notice && <Alert severity="info">{notice}</Alert>}
        <ErrorAlert error={error} />
      </Stack>

      <Composer
        draft={draft}
        onDraftChange={setDraft}
        file={file}
        fileError={fileError}
        streaming={busy}
        locked={locked}
        waiting={waiting !== null}
        inputRef={input}
        onSubmit={(event) => void send(event)}
        onStop={() => abort.current?.abort()}
        onAttach={attach}
        onRemoveFile={() => setFile(null)}
      />
    </Box>
  );
}
