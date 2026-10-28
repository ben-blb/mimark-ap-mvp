import { MAX_CONVERSATION_MESSAGES } from '@mimark/contracts/conversations';
import type { AssistantMessage } from '@mimark/contracts/assistant';
import type { ConversationDto } from '@mimark/contracts/conversations';
import Button from '@mui/material/Button';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { restore, titleOf, toStoredDecisions } from './conversation';
import { ConversationList } from './ConversationList';
import { useConversations, useDeleteConversation, useSaveConversation } from './conversations.api';
import type { Decision } from './MessageList';
import type { ToolRun } from './ToolCallRow';

/** Título de la página con "Conversaciones" (lista) y "Nueva conversación" (spec 011). */
export function ConversationControls(props: {
  conversationId: string;
  busy: boolean;
  onError: (error: unknown) => void;
}) {
  const navigate = useNavigate();
  const conversations = useConversations();
  const deleteConversation = useDeleteConversation();
  const [showList, setShowList] = useState(false);
  const fresh = () => void navigate('/asistente', { state: { fresh: Date.now() } });

  return (
    <>
      <PageHeader
        title="Asistente"
        actions={
          <>
            <Button
              color="inherit"
              size="small"
              aria-expanded={showList}
              onClick={() => setShowList((v) => !v)}
            >
              Conversaciones{conversations.data ? ` (${conversations.data.items.length})` : ''}
            </Button>
            <Button size="small" variant="outlined" disabled={props.busy} onClick={fresh}>
              Nueva conversación
            </Button>
          </>
        }
      />
      {showList && (
        <ConversationList
          items={conversations.data?.items ?? []}
          currentId={props.conversationId}
          busy={props.busy}
          onOpen={(id) => void navigate(`/asistente/${id}`)}
          onDelete={(id) =>
            deleteConversation.mutate(id, {
              onSuccess: () => {
                if (id === props.conversationId) fresh();
              },
              onError: props.onError,
            })
          }
        />
      )}
    </>
  );
}

interface Snapshot {
  messages: AssistantMessage[];
  decisions: Record<string, Decision>;
}

/**
 * Restaura una conversación guardada una sola vez (nada se ejecuta, AC-011-17) y guarda sola la conversación
 * al terminar cada turno o decisión (AC-011-16).
 */
export function useSavedConversation(props: {
  openId: string | undefined;
  conversationId: string;
  opened: ConversationDto | undefined;
  busy: boolean;
  messages: AssistantMessage[];
  decisions: Record<string, Decision>;
  onRestore: (restored: Snapshot & { runs: Record<string, ToolRun> }) => void;
  onSaveError: () => void;
}) {
  const { openId, conversationId, opened, busy, messages, decisions } = props;
  const { mutate } = useSaveConversation();
  /** Lo último que se guardó (o se cargó), para no volver a guardar lo mismo. */
  const saved = useRef<Snapshot | null>(null);
  // Los avisos al padre cambian en cada render: se leen por ref para no reiniciar el temporizador.
  const callbacks = useRef(props);
  useEffect(() => {
    callbacks.current = props;
  });

  useEffect(() => {
    if (!opened || saved.current) return;
    const restored = restore(opened);
    saved.current = restored;
    callbacks.current.onRestore(restored);
  }, [opened]);

  useEffect(() => {
    if (busy || messages.length === 0) return;
    if (openId && !saved.current) return;
    if (saved.current?.messages === messages && saved.current.decisions === decisions) return;
    const timer = setTimeout(() => {
      saved.current = { messages, decisions };
      mutate(
        {
          id: conversationId,
          input: {
            title: titleOf(messages),
            messages: messages.slice(-MAX_CONVERSATION_MESSAGES),
            decisions: toStoredDecisions(decisions),
          },
        },
        { onError: () => callbacks.current.onSaveError() },
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [busy, messages, decisions, openId, conversationId, mutate]);
}
