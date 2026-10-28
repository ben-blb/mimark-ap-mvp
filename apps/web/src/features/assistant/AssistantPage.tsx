import {
  type AssistantAttachment,
  type AssistantMessage,
  type AssistantToolCall,
  MAX_ASSISTANT_MESSAGES,
} from '@mimark/contracts/assistant';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { type FormEvent, useState } from 'react';
import { ErrorAlert } from '../../components/ErrorAlert';
import { PageHeader } from '../../components/PageHeader';
import { ASSISTANT_TOOL_LABELS } from '../../lib/labels';
import { validateFile } from '../payables/UploadForm';
import { isWrite, toToolResult, useAssistantTurn, useRunTool } from './assistant.api';
import { ProposalCard, type ProposalStatus } from './ProposalCard';

/** Rondas de herramientas por mensaje de la persona (AC-008-06). */
const MAX_ROUNDS = 5;

interface Waiting {
  conversation: AssistantMessage[];
  results: AssistantMessage[];
  writes: AssistantToolCall[];
}

const toolMessage = (call: AssistantToolCall, result: string): AssistantMessage => ({
  role: 'tool',
  toolCallId: call.id,
  name: call.name,
  result,
});

/** Los últimos mensajes que caben, empezando siempre por un mensaje de la persona. */
function recent(conversation: AssistantMessage[]): AssistantMessage[] {
  const tail = conversation.slice(-MAX_ASSISTANT_MESSAGES);
  const start = tail.findIndex((m) => m.role === 'user');
  return start > 0 ? tail.slice(start) : tail;
}

function describeFile(file: File | null): AssistantAttachment | undefined {
  if (!file) return undefined;
  const byExtension = /\.png$/i.test(file.name)
    ? 'image/png'
    : /\.jpe?g$/i.test(file.name)
      ? 'image/jpeg'
      : 'application/pdf';
  const mimeType = (file.type || byExtension) as AssistantAttachment['mimeType'];
  return { fileName: file.name, mimeType, size: file.size };
}

/**
 * Asistente en lenguaje natural (spec 008). Las lecturas se ejecutan solas; las escrituras se muestran como
 * propuestas y solo se ejecutan con el clic de la persona, por los mismos endpoints que usan las pantallas.
 */
export function AssistantPage() {
  const turn = useAssistantTurn();
  const runTool = useRunTool();
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [decisions, setDecisions] = useState<
    Record<string, { status: ProposalStatus; error?: string }>
  >({});
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  const [draft, setDraft] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function advance(start: AssistantMessage[], attached: File | null) {
    setBusy(true);
    setError(null);
    setNotice(null);
    let conversation = start;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const out = await turn.mutateAsync({
          messages: recent(conversation),
          attachment: describeFile(attached),
        });
        conversation = [
          ...conversation,
          { role: 'assistant', text: out.text, toolCalls: out.toolCalls },
        ];
        setMessages(conversation);
        if (out.toolCalls.length === 0) return;

        const reads = out.toolCalls.filter((c) => !isWrite(c.name));
        const writes = out.toolCalls.filter((c) => isWrite(c.name));
        const results = await Promise.all(
          reads.map(async (c) => toolMessage(c, (await runTool(c, attached)).result)),
        );
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
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function decide(call: AssistantToolCall, confirm: boolean) {
    if (!waiting) return;
    let result: string;
    let attached = file;
    if (confirm) {
      setDecisions((prev) => ({ ...prev, [call.id]: { status: 'running' } }));
      const outcome = await runTool(call, file);
      setDecisions((prev) => ({
        ...prev,
        [call.id]: outcome.error
          ? { status: 'failed', error: outcome.error }
          : { status: 'confirmed' },
      }));
      if (!outcome.error && call.name === 'uploadPayable') {
        attached = null;
        setFile(null);
      }
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
    await advance(conversation, attached);
  }

  function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void advance([...messages, { role: 'user', text }], file);
  }

  function attach(selected: File | undefined) {
    if (!selected) return;
    const problem = validateFile(selected);
    setFileError(problem);
    setFile(problem ? null : selected);
  }

  const locked = busy || waiting !== null;

  return (
    <>
      <PageHeader
        title="Asistente"
        subtitle="Pregunta o pide operaciones en español. Lo que cambia datos siempre te lo pide confirmar."
      />
      <Stack spacing={2} role="log" aria-live="polite" sx={{ mb: 2 }}>
        {messages.length === 0 && (
          <Typography color="text.secondary">
            Ejemplos: «¿Qué vence en los próximos 7 días?», «Da de alta al proveedor…», «Programa la
            factura F-120 para el viernes».
          </Typography>
        )}
        {messages.map((message, index) => {
          if (message.role === 'tool') return null;
          if (message.role === 'user') {
            return (
              <Paper
                key={index}
                sx={{ p: 1.5, alignSelf: 'flex-end', maxWidth: '80%', bgcolor: 'action.selected' }}
              >
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{message.text}</Typography>
              </Paper>
            );
          }
          return (
            <Stack key={index} spacing={1} sx={{ maxWidth: '90%' }}>
              {message.text && (
                <Typography sx={{ whiteSpace: 'pre-wrap' }}>{message.text}</Typography>
              )}
              {message.toolCalls.map((call) =>
                isWrite(call.name) ? (
                  <ProposalCard
                    key={call.id}
                    call={call}
                    status={decisions[call.id]?.status ?? 'cancelled'}
                    error={decisions[call.id]?.error}
                    blockedReason={
                      call.name === 'uploadPayable' && !file ? 'Adjunta la factura' : undefined
                    }
                    onConfirm={() => void decide(call, true)}
                    onCancel={() => void decide(call, false)}
                  />
                ) : (
                  <Typography key={call.id} variant="caption" color="text.secondary">
                    {ASSISTANT_TOOL_LABELS[call.name]}
                  </Typography>
                ),
              )}
            </Stack>
          );
        })}
        {busy && (
          <Box>
            <Typography variant="body2" color="text.secondary">
              Pensando…
            </Typography>
            <LinearProgress />
          </Box>
        )}
        {notice && <Alert severity="info">{notice}</Alert>}
        <ErrorAlert error={error} />
      </Stack>

      <Paper component="form" onSubmit={send} variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <TextField
            label="Mensaje"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            multiline
            minRows={2}
            disabled={locked}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
            helperText={waiting ? 'Confirma o cancela la propuesta para continuar.' : undefined}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Button component="label" variant="outlined" disabled={busy}>
              Adjuntar factura
              <input
                hidden
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                aria-label="Archivo de la factura"
                onChange={(e) => {
                  attach(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </Button>
            {file && <Chip label={file.name} onDelete={busy ? undefined : () => setFile(null)} />}
            <Box sx={{ flexGrow: 1 }} />
            <Button type="submit" variant="contained" disabled={locked || !draft.trim()}>
              Enviar
            </Button>
          </Stack>
          {fileError && <Alert severity="error">{fileError}</Alert>}
        </Stack>
      </Paper>
    </>
  );
}
