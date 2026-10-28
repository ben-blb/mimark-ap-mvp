import type { AssistantMessage, AssistantToolCall } from '@mimark/contracts/assistant';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { RADIUS } from '../../app/theme';
import { isWrite } from './assistant.api';
import { ENTER, LiveCursor } from './AssistantParts';
import { ConfirmAction, type ProposalStatus } from './ConfirmAction';
import { ToolCallGroup, type ToolRun } from './ToolCallRow';
import { toolRenderers } from './toolRenderers';

export interface Decision {
  status: ProposalStatus;
  error?: string;
  at?: Date;
}

/**
 * La conversación (AC-010-07): la persona a la derecha en una superficie; el asistente sin burbuja, con sus
 * lecturas como filas de estado y su componente, y sus escrituras como confirmación. `live` es el texto que va
 * llegando. Todo como texto.
 */
export function MessageList(props: {
  messages: AssistantMessage[];
  live: string | null;
  runs: Record<string, ToolRun>;
  decisions: Record<string, Decision>;
  hasFile: boolean;
  onDecide: (call: AssistantToolCall, confirm: boolean) => void;
}) {
  const { messages, live, runs, decisions } = props;
  return (
    <>
      {messages.map((message, index) => {
        if (message.role === 'tool') return null;
        if (message.role === 'user') {
          return (
            <Box
              key={index}
              sx={{
                ...ENTER,
                alignSelf: 'flex-end',
                maxWidth: { xs: '88%', sm: '75%' },
                px: 1.75,
                py: 1,
                borderRadius: RADIUS.container,
                bgcolor: 'background.surface2',
              }}
            >
              <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {message.text}
              </Typography>
            </Box>
          );
        }
        const reads = message.toolCalls.filter((c) => !isWrite(c.name));
        const writes = message.toolCalls.filter((c) => isWrite(c.name));
        return (
          <Stack key={index} spacing={1.5} sx={ENTER}>
            {message.text && (
              <Typography
                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}
              >
                {message.text}
              </Typography>
            )}
            {reads.length > 0 && <ToolCallGroup calls={reads} runs={runs} />}
            {reads.map((call) => {
              const run = runs[call.id];
              const render = toolRenderers[call.name];
              return run?.status === 'done' && render ? (
                <Box key={call.id} sx={ENTER}>
                  {render(run.value)}
                </Box>
              ) : null;
            })}
            {writes.map((call) => (
              <ConfirmAction
                key={call.id}
                call={call}
                status={decisions[call.id]?.status ?? 'cancelled'}
                error={decisions[call.id]?.error}
                at={decisions[call.id]?.at}
                blockedReason={
                  call.name === 'uploadPayable' && !props.hasFile ? 'Adjunta la factura' : undefined
                }
                onConfirm={() => props.onDecide(call, true)}
                onCancel={() => props.onDecide(call, false)}
              />
            ))}
          </Stack>
        );
      })}
      {live !== null && (
        <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.55 }}>
          {live || (
            <Box component="span" sx={{ color: 'text.tertiary' }}>
              Pensando
            </Box>
          )}
          <LiveCursor />
        </Typography>
      )}
    </>
  );
}
