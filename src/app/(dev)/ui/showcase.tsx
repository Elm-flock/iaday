'use client';

import { Bell, Home, Moon, Plus, Search, Sun, Target, Trash2, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert } from '@/components/ui/alert';
import { AppShell } from '@/components/ui/app-shell';
import { Avatar } from '@/components/ui/avatar';
import { Button, buttonStyles } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Divider } from '@/components/ui/divider';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { EnvBadge } from '@/components/ui/env-badge';
import { FormField } from '@/components/ui/form-field';
import { Header } from '@/components/ui/header';
import { IconButton } from '@/components/ui/icon-button';
import { Link } from '@/components/ui/link';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { ScoreBar } from '@/components/ui/score-bar';
import { Select } from '@/components/ui/select';
import { Sidebar, SidebarItem } from '@/components/ui/sidebar';
import { Spinner } from '@/components/ui/spinner';
import { BandBadge, StatusBadge } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { TextInput } from '@/components/ui/text-input';
import { Textarea } from '@/components/ui/textarea';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { cn } from '@/lib/cn';
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  formatScore,
  formatTime,
} from '@/lib/format';

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-s40">
      <h2 id={id} className="mb-s15 text-heading-2 font-light tracking-heading">
        {title}
      </h2>
      <div className="flex flex-wrap items-start gap-s15">{children}</div>
    </section>
  );
}

const swatches = [
  'bg',
  'surface',
  'surface-subtle',
  'surface-raised',
  'surface-brand',
  'primary',
  'primary-subtle',
  'accent',
  'success',
  'warning',
  'danger',
  'info',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
];

const swatchClass: Record<string, string> = {
  bg: 'bg-bg',
  surface: 'bg-surface',
  'surface-subtle': 'bg-surface-subtle',
  'surface-raised': 'bg-surface-raised',
  'surface-brand': 'bg-surface-brand',
  primary: 'bg-primary',
  'primary-subtle': 'bg-primary-subtle',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  'chart-1': 'bg-chart-1',
  'chart-2': 'bg-chart-2',
  'chart-3': 'bg-chart-3',
  'chart-4': 'bg-chart-4',
};

function Catalog() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <PageHeader
        title="Sistema de diseño"
        description="Catálogo de componentes de Flock UI. Solo disponible en desarrollo."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Catálogo' }]}
        actions={<Button icon={<Plus size={18} strokeWidth={1.75} />}>Crear ciclo</Button>}
      />

      <Section id="colores" title="Colores">
        {swatches.map((name) => (
          <div key={name} className="flex w-28 flex-col gap-s5 text-caption text-ink-muted">
            <span className={cn('h-10 rounded-md border border-border', swatchClass[name])} />
            {name}
          </div>
        ))}
        <div className="flex w-full gap-s15">
          <span className="h-10 flex-1 rounded-lg bg-horizonte" />
          <span className="h-10 flex-1 rounded-lg bg-brasa" />
          <span className="h-10 flex-1 rounded-lg bg-noche" />
        </div>
      </Section>

      <Section id="tipografia" title="Tipografía">
        <div className="flex flex-col gap-s10">
          <p className="text-display font-light tracking-display">Display 40</p>
          <p className="text-heading-1 font-light tracking-heading">Heading 1 · 28</p>
          <p className="text-heading-2 font-light tracking-heading">Heading 2 · 22</p>
          <p className="text-heading-3 font-light tracking-heading">Heading 3 · 18</p>
          <p className="text-body">Body 14/20 · Revisá los datos antes de publicar.</p>
          <p className="text-body-sm text-ink-muted">Body small · label y ayudas</p>
          <p className="text-caption text-ink-subtle">Caption 12 · mínimo</p>
        </div>
      </Section>

      <Section id="botones" title="Botones">
        <Button>Guardar cambios</Button>
        <Button variant="secondary">Descartar borrador</Button>
        <Button variant="ghost">Cancelar</Button>
        <Button variant="danger" icon={<Trash2 size={16} strokeWidth={1.75} />}>
          Eliminar objetivo
        </Button>
        <Button variant="brand">Registrar check-in</Button>
        <Button size="sm">Chico</Button>
        <Button size="lg">Grande</Button>
        <Button shape="md" variant="secondary">
          Forma md
        </Button>
        <Button loading>Guardando</Button>
        <Button disabled>Deshabilitado</Button>
        <a href="#botones" className={buttonStyles({ variant: 'secondary' })}>
          Link con estilo de botón
        </a>
        <IconButton aria-label="Notificaciones">
          <Bell size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <Link href="/">Link de texto</Link>
      </Section>

      <Section id="formularios" title="Formularios">
        <div className="flex w-full max-w-md flex-col gap-s15">
          <FormField label="Título del objetivo" required help="Máximo 120 caracteres.">
            <TextInput placeholder="Ej: Mejorar la retención" />
          </FormField>
          <FormField label="Responsable" error="Elegí un responsable para continuar.">
            <Select defaultValue="">
              <option value="" disabled>
                Seleccioná una persona
              </option>
              <option>Ana Pérez</option>
              <option>Lucas Gómez</option>
            </Select>
          </FormField>
          <FormField label="Observaciones">
            <Textarea placeholder="Contexto del check-in" />
          </FormField>
          <Checkbox label="Es un objetivo aspiracional" defaultChecked />
          <Checkbox label="Notificar al líder" />
          <Switch label="Ciclo activo" defaultChecked />
          <Switch label="Deshabilitado" disabled />
        </div>
      </Section>

      <Section id="estado" title="Estado y score">
        <BandBadge score={0.85} />
        <BandBadge score={0.55} />
        <BandBadge score={0.2} />
        <StatusBadge tone="info">Borrador</StatusBadge>
        <StatusBadge tone="success">Activo</StatusBadge>
        <Tag>Ventas</Tag>
        <EnvBadge env="DEV" />
        <EnvBadge env="TEST" />
        <EnvBadge env="PROD" />
        <div className="flex w-full max-w-md flex-col gap-s10">
          <ScoreBar score={0.85} label="Retención" />
          <ScoreBar score={0.55} label="NPS" />
          <ScoreBar score={0.2} label="Churn" />
        </div>
        <p className="w-full text-body-sm text-ink-muted">
          Formato AR: {formatNumber(1234.56)} · {formatCurrency(1234.56)} · {formatScore(0.7)} ·{' '}
          {formatPercent(0.7)} · {formatDate('2026-10-09')} ·{' '}
          {formatTime(new Date('2026-10-09T17:32:00Z'))}
        </p>
      </Section>

      <Section id="feedback" title="Alertas, toasts y carga">
        <div className="flex w-full max-w-xl flex-col gap-s10">
          <Alert tone="info" title="Ciclo en borrador">
            Publicalo cuando tengas al menos 3 objetivos.
          </Alert>
          <Alert tone="success">Guardamos el check-in.</Alert>
          <Alert tone="warning" title="Check-in vencido">
            Hace más de 7 días que no actualizás este resultado clave.
          </Alert>
          <Alert tone="danger" title="No pudimos guardar el contrato">
            Revisá tu conexión y probá de nuevo.
          </Alert>
        </div>
        <Button variant="secondary" onClick={() => toast.show('Cambios guardados')}>
          Mostrar toast
        </Button>
        <Spinner label="Cargando" />
      </Section>

      <Section id="contenedores" title="Cards, personas y vacíos">
        <Card title="Ciclo Q4 2026" actions={<Tag>Trimestral</Tag>} className="w-80">
          <p className="text-body text-ink-muted">3 objetivos · 9 resultados clave</p>
          <Divider className="my-s15" />
          <div className="flex items-center gap-s10">
            <Avatar name="Ana Pérez" />
            <Avatar name="Lucas Gómez" size="lg" />
            <Avatar name="Sol" size="sm" />
          </div>
        </Card>
        <EmptyState
          className="w-96"
          icon={<Target size={32} strokeWidth={1.75} aria-hidden="true" />}
          title="Todavía no hay objetivos"
          description="Creá el primer objetivo del ciclo para empezar a medir."
          action={<Button>Crear objetivo</Button>}
        />
      </Section>

      <Section id="superposiciones" title="Modal, drawer y confirmación">
        <Button variant="secondary" onClick={() => setModal(true)}>
          Abrir modal
        </Button>
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          Abrir drawer
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Eliminar partner
        </Button>
      </Section>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nuevo resultado clave"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setModal(false)}>Guardar resultado clave</Button>
          </>
        }
      >
        <FormField label="Título" required>
          <TextInput />
        </FormField>
      </Modal>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Detalle del objetivo">
        <p className="text-body text-ink-muted">Contenido del detalle sin salir de la lista.</p>
      </Drawer>
      <ConfirmDialog
        open={confirm}
        title="Eliminar partner"
        description="Se elimina el partner y sus datos asociados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar partner"
        onConfirm={() => setConfirm(false)}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

export function Showcase() {
  const [dark, setDark] = useState(false);

  return (
    <div data-testid="theme-root" className={cn(dark && 'dark', 'bg-bg text-ink')}>
      <ToastProvider>
        <AppShell
          header={
            <Header productName="OKR Platform">
              <EnvBadge env="DEV" />
              <IconButton
                aria-label="Buscar"
                className="text-on-brand hover:bg-white/10 hover:text-on-brand"
              >
                <Search size={20} strokeWidth={1.75} aria-hidden="true" />
              </IconButton>
              <Button
                variant="brand"
                size="sm"
                aria-pressed={dark}
                onClick={() => setDark((d) => !d)}
                icon={
                  dark ? (
                    <Sun size={16} strokeWidth={1.75} />
                  ) : (
                    <Moon size={16} strokeWidth={1.75} />
                  )
                }
              >
                {dark ? 'Tema claro' : 'Tema oscuro'}
              </Button>
              <Avatar name="Emiliano Manganiello" />
            </Header>
          }
          sidebar={
            <Sidebar>
              <SidebarItem href="/" icon={<Home size={20} strokeWidth={1.75} />}>
                Inicio
              </SidebarItem>
              <SidebarItem href="/ui" current icon={<Target size={20} strokeWidth={1.75} />}>
                Objetivos
              </SidebarItem>
              <SidebarItem href="/ui" icon={<Users size={20} strokeWidth={1.75} />}>
                Equipos
              </SidebarItem>
            </Sidebar>
          }
        >
          <Catalog />
        </AppShell>
      </ToastProvider>
    </div>
  );
}
