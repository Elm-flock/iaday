'use client';

import { SendHorizontal, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AssistantUnavailable } from './assistant-unavailable';
import { MessageItem, type ChatMessage } from './message-item';
import {
  clearConversationAction,
  confirmPlanAction,
  discardPlanAction,
  sendMessageAction,
  type PlanView,
} from '../actions';
import {
  ASSISTANT_COPY,
  EXECUTION_HEADLINE,
  MAX_MESSAGE_LENGTH,
  type AssistantFailure,
} from '../messages';
import { overallStatus } from './execution-result';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  initialMessages: ChatMessage[];
  /** false: el agente está apagado o caído; el chat se muestra pero no se puede enviar. */
  chatAvailable: boolean;
};

const WARN_AT = 1800;
let localSeq = 0;
const localId = () => `local-${++localSeq}`;

function replacePlan(messages: ChatMessage[], plan: PlanView): ChatMessage[] {
  return messages.map((m) => (m.kind === 'PLAN' && m.plan?.id === plan.id ? { ...m, plan } : m));
}

/** Estado que cambia el plan en pantalla sin pedir al back (vencimiento detectado en el cliente). */
function withStatus(messages: ChatMessage[], planId: string, status: PlanView['status']) {
  return messages.map((m) =>
    m.kind === 'PLAN' && m.plan?.id === planId ? { ...m, plan: { ...m.plan, status } } : m,
  );
}

export function ChatPanel({ initialMessages, chatAvailable }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<AssistantFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const focusId = useRef<string | null>(null);
  const thinking = pendingText !== null;

  // Foco programático después de que React pintó el mensaje nuevo (plan o resultado).
  useEffect(() => {
    if (focusId.current) {
      document.getElementById(focusId.current)?.focus();
      focusId.current = null;
    }
  }, [messages]);

  // Tiempo transcurrido mientras el asistente piensa (el planificador puede tardar ~90 s).
  useEffect(() => {
    if (!thinking) return;
    const started = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, [thinking]);

  const length = text.trim().length;
  const tooLong = length > MAX_MESSAGE_LENGTH;
  const canSend = chatAvailable && !thinking && length > 0 && !tooLong;

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function send() {
    if (!canSend) return;
    const sent = text.trim();
    setError(null);
    setNotice(null);
    setElapsed(0);
    setPendingText(sent);
    const result = await sendMessageAction(sent);
    setPendingText(null);
    if (!result.ok) {
      // El texto NO se borra: el back no guardó el mensaje y se puede reintentar.
      setError(result.failure);
      focusInput();
      return;
    }
    setText('');
    const reply = result.data.messages;
    const planMessage = reply.find((m) => m.kind === 'PLAN' && m.plan);
    focusId.current = planMessage?.plan ? `plan-${planMessage.plan.id}` : null;
    setMessages((prev) => [...prev, ...reply]);
    if (!planMessage) focusInput();
  }

  async function confirm(plan: PlanView) {
    setError(null);
    setNotice(null);
    setBusyPlanId(plan.id);
    const result = await confirmPlanAction(plan.id, plan.planHash);
    setBusyPlanId(null);
    if (result.ok) {
      const resultMessage: ChatMessage = {
        id: localId(),
        role: 'ASSISTANT',
        kind: 'EXECUTION_RESULT',
        text: EXECUTION_HEADLINE[overallStatus(result.data.steps)],
        // Con `oneTimeSecret` si lo hay: solo vive en este estado en memoria.
        steps: result.data.steps,
        createdAt: new Date().toISOString(),
      };
      focusId.current = `result-${resultMessage.id}`;
      setMessages((prev) => [...replacePlan(prev, result.data.plan), resultMessage]);
      return;
    }
    setError(result.failure);
    if (result.failure.kind === 'already-decided' && result.plan) {
      const decided = result.plan;
      const steps = decided.steps ?? [];
      const extra: ChatMessage[] =
        steps.length > 0
          ? [
              {
                id: localId(),
                role: 'ASSISTANT',
                kind: 'EXECUTION_RESULT',
                text: EXECUTION_HEADLINE[overallStatus(steps)],
                steps,
                createdAt: new Date().toISOString(),
              },
            ]
          : [];
      setMessages((prev) => [...replacePlan(prev, decided), ...extra]);
    } else if (result.failure.kind === 'expired') {
      setMessages((prev) => withStatus(prev, plan.id, 'EXPIRED'));
    } else if (result.failure.kind === 'invalid') {
      setMessages((prev) => withStatus(prev, plan.id, 'INVALID'));
    }
    focusInput();
  }

  async function discard(plan: PlanView) {
    setError(null);
    setNotice(null);
    setBusyPlanId(plan.id);
    const result = await discardPlanAction(plan.id);
    setBusyPlanId(null);
    if (result.ok) {
      setMessages((prev) => replacePlan(prev, result.data));
      setNotice('Descartaste el plan. No se hizo ningún cambio.');
    } else {
      setError(result.failure);
      if (result.plan) setMessages((prev) => replacePlan(prev, result.plan!));
    }
    focusInput();
  }

  async function clearConversation() {
    setClearing(true);
    const result = await clearConversationAction();
    setClearing(false);
    setConfirmClear(false);
    if (result.ok) {
      setMessages([]);
      setError(null);
      setNotice('Borramos la conversación.');
    } else {
      setError(result.failure);
    }
    focusInput();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envía; Mayús+Enter agrega un renglón. No interferir con la composición de texto (IME).
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  const counterId = 'assistant-input-counter';
  const hintId = 'assistant-input-hint';

  return (
    <section aria-labelledby="chat-title" className="flex flex-col gap-s15">
      <div className="flex flex-wrap items-center justify-between gap-s10">
        <h2 id="chat-title" className="text-heading-2 font-light tracking-heading text-ink">
          Conversación
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={messages.length === 0 || thinking}
          onClick={() => setConfirmClear(true)}
          icon={<Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />}
        >
          Borrar conversación
        </Button>
      </div>

      {!chatAvailable ? <AssistantUnavailable /> : null}

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Mensajes del asistente"
        aria-busy={thinking || undefined}
        className="flex flex-col gap-s15"
      >
        {messages.length === 0 && !thinking ? (
          <p className="rounded-lg border border-dashed border-border-strong p-s20 text-body text-ink-muted">
            Todavía no hay mensajes. Probá con algo como “Creá el equipo Datos dentro de Plataforma”
            o “¿Cómo creo un ciclo?”. Antes de cambiar algo, el asistente te muestra el plan y
            esperá tu confirmación.
          </p>
        ) : (
          <ol className="flex flex-col gap-s15">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                busyPlanId={busyPlanId}
                onConfirm={confirm}
                onDiscard={discard}
              />
            ))}
            {pendingText !== null ? (
              <li className="flex flex-col items-end gap-s5" data-testid="pending-message">
                <p className="text-caption text-ink-muted">
                  <span className="font-bold text-ink">Vos</span> · enviando
                </p>
                <div className="max-w-full rounded-lg border border-primary bg-primary-subtle p-s15 text-body whitespace-pre-wrap text-ink sm:max-w-[85%]">
                  {pendingText}
                </div>
              </li>
            ) : null}
          </ol>
        )}
      </div>

      {thinking ? (
        <div className="flex items-center gap-s10 text-body text-ink" role="status">
          <Spinner size={18} />
          <span>
            El asistente está pensando. Puede tardar hasta un minuto y medio. Podés salir de esta
            pantalla: la respuesta te va a esperar acá.
          </span>
          <span aria-hidden="true" className="tabular-nums text-ink-muted" data-testid="elapsed">
            {elapsed} s
          </span>
        </div>
      ) : null}

      {error ? (
        error.kind === 'unavailable' ? (
          <AssistantUnavailable message={error.message} />
        ) : (
          <Alert tone={error.kind === 'throttled' ? 'warning' : 'danger'}>{error.message}</Alert>
        )
      ) : null}
      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex flex-col gap-s10"
      >
        <label htmlFor="assistant-input" className="text-body-sm text-ink-muted">
          Qué necesitás
        </label>
        <Textarea
          id="assistant-input"
          ref={inputRef}
          rows={3}
          value={text}
          disabled={!chatAvailable}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={`${hintId} ${counterId}`}
          aria-invalid={tooLong || undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-s10">
          <p id={hintId} className="text-body-sm text-ink-muted">
            Enter envía. Mayús + Enter agrega un renglón.
          </p>
          <p
            id={counterId}
            className={
              tooLong
                ? 'text-body-sm text-danger'
                : length >= WARN_AT
                  ? 'text-body-sm text-warning'
                  : 'text-body-sm text-ink-muted'
            }
          >
            {length} de {MAX_MESSAGE_LENGTH} caracteres
            {tooLong ? `. ${ASSISTANT_COPY.tooLong}` : ''}
          </p>
        </div>
        <div>
          <Button
            type="submit"
            disabled={!canSend}
            loading={thinking}
            icon={<SendHorizontal size={16} strokeWidth={1.75} aria-hidden="true" />}
          >
            Enviar
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmClear}
        title="¿Borrar la conversación?"
        description="Se borran todos tus mensajes con el asistente. Los planes ya ejecutados quedan en la auditoría. Esto no se puede deshacer."
        confirmLabel="Borrar conversación"
        loading={clearing}
        onConfirm={clearConversation}
        onCancel={() => setConfirmClear(false)}
      />
    </section>
  );
}
