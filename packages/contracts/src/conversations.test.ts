import { describe, expect, it } from 'vitest';
import { SaveConversationInput } from './conversations.js';

const user = { role: 'user', text: 'Hola' } as const;

describe('SaveConversationInput', () => {
  it('AC-011-14 acepta una conversación válida', () => {
    expect(SaveConversationInput.safeParse({ title: 'Hola', messages: [user] }).success).toBe(true);
  });

  it.each([
    ['más de 200 mensajes', { title: 'Hola', messages: Array(201).fill(user) }],
    ['un título de más de 120 caracteres', { title: 'x'.repeat(121), messages: [user] }],
    ['sin mensajes', { title: 'Hola', messages: [] }],
  ])('AC-011-14 rechaza %s', (_, body) => {
    expect(SaveConversationInput.safeParse(body).success).toBe(false);
  });
});
