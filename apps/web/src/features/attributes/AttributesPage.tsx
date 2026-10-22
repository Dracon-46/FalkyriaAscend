import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { attributeInput, skillInput } from '@rpg/contracts';
import type { z } from 'zod';
import { api } from '../../lib/api';
import { fmt, pct } from '../../lib/format';
import type { Attribute, RadarData, SeriesPoint, Skill } from '../../lib/types';
import { AttributeRadar, TimeSeriesChart } from '../../components/charts/Charts';
import { FormActions, useForm } from '../../components/forms';
import { Icon, ICON_NAMES } from '../../components/ui/Icon';
import { Modal } from '../../components/ui/Modal';
import { Badge, Button, EmptyState, ErrorState, Input, Loading, PageHeader, Panel, ProgressBar, Select, Textarea, cx } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/Toast';

type AttrInput = z.input<typeof attributeInput>;
type SkillInput = z.input<typeof skillInput>;

export function AttributesPage() {
  const attrs = useQuery({ queryKey: ['attributes'], queryFn: () => api.get<Attribute[]>('/api/attributes?includeArchived=true') });
  const skills = useQuery({ queryKey: ['skills'], queryFn: () => api.get<Skill[]>('/api/skills?includeArchived=true') });
  const radar = useQuery({ queryKey: ['radar', 30], queryFn: () => api.get<RadarData>('/api/stats/attributes/radar?compareDays=30') });
  const history = useQuery({
    queryKey: ['attr-history'],
    queryFn: () =>
      api.get<{ attributes: Array<{ code: string; name: string; color: string }>; series: SeriesPoint[] }>(
        '/api/stats/attributes/history?granularity=week&days=180',
      ),
  });
  const [editAttr, setEditAttr] = useState<Attribute | 'new' | null>(null);
  const [editSkill, setEditSkill] = useState<Skill | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  if (attrs.isLoading || skills.isLoading) return <Loading />;
  if (attrs.isError) return <ErrorState error={attrs.error} onRetry={() => attrs.refetch()} />;
  const list = attrs.data!.filter((a) => showArchived || !a.archivedAt);
  const skillList = (skills.data ?? []).filter((s) => showArchived || !s.archivedAt);

  return (
    <>
      <PageHeader
        title="Atributos e habilidades"
        icon="git-branch"
        subtitle="Atributos crescem com o XP de atributo de cada atividade (pesos definidos por missão, hábito ou tipo de treino). Habilidades acumulam maestria por área específica."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? 'Ocultar arquivados' : 'Mostrar arquivados'}
            </Button>
            <Button icon="plus" onClick={() => setEditAttr('new')}>
              Atributo
            </Button>
            <Button icon="plus" onClick={() => setEditSkill('new')}>
              Habilidade
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Radar de atributos" icon="git-branch">
          <AttributeRadar
            height={340}
            compareLabel="Há 30 dias"
            data={(radar.data?.attributes ?? []).map((a) => ({ code: a.code, name: a.name, level: a.level, previousLevel: a.previousLevel, xp: a.xp }))}
          />
        </Panel>
        <Panel title="Evolução (últimas 26 semanas)" icon="trending-up">
          {history.data && (
            <TimeSeriesChart
              granularity="week"
              height={340}
              data={history.data.series}
              series={history.data.attributes.map((a) => ({ key: a.code, label: a.name, type: 'line' as const, color: a.color }))}
            />
          )}
        </Panel>
      </div>

      <h2 className="panel-title mt-6">Atributos</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((a) => (
          <article key={a.id} className={cx('panel flex flex-col gap-2', a.archivedAt && 'opacity-60')}>
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-full"
                style={{ background: `color-mix(in srgb, ${a.color} 18%, transparent)`, color: a.color }}
              >
                <Icon name={a.icon} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display">
                  {a.name} <span className="num text-xs text-faint">{a.code}</span>
                </p>
                <p className="text-xs text-faint">{a.category}</p>
              </div>
              <span className="num text-2xl text-accent">{a.level}</span>
            </div>
            <ProgressBar value={a.progress} label={`Progresso de ${a.name}`} color={a.color} />
            <p className="num text-xs text-faint">
              {fmt(a.xp)} XP · faltam {fmt(a.xpToNext)} para o nível {a.level + 1}
            </p>
            <p className="text-sm text-muted">{a.description}</p>
            {a.progressionCriteria && <p className="text-xs text-faint">Como evolui: {a.progressionCriteria}</p>}
            <div className="mt-auto flex gap-1">
              <Button size="sm" variant="ghost" icon="pencil" onClick={() => setEditAttr(a)}>
                Editar
              </Button>
              <ArchiveButton path={`/api/attributes/${a.id}`} archived={Boolean(a.archivedAt)} />
            </div>
          </article>
        ))}
      </div>

      <h2 className="panel-title mt-6">Árvore de habilidades (maestria)</h2>
      {skillList.length === 0 ? (
        <Panel>
          <EmptyState icon="git-branch" title="Nenhuma habilidade" action={<Button onClick={() => setEditSkill('new')}>Criar habilidade</Button>} />
        </Panel>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {attrs
            .data!.filter((a) => !a.archivedAt)
            .map((a) => {
              const roots = skillList.filter((s) => s.attributeId === a.id && !s.parentId);
              if (roots.length === 0) return null;
              return (
                <Panel key={a.id} title={`${a.name} (${a.code})`} icon={a.icon}>
                  <ul className="space-y-3">
                    {roots.map((r) => (
                      <SkillNode key={r.id} skill={r} all={skillList} depth={0} onEdit={setEditSkill} />
                    ))}
                  </ul>
                </Panel>
              );
            })}
          {skillList.some((s) => !s.parentId && !attrs.data!.some((a) => a.id === s.attributeId && !a.archivedAt)) && (
            <Panel title="Sem atributo" icon="circle">
              <ul className="space-y-3">
                {skillList
                  .filter((s) => !s.parentId && !attrs.data!.some((a) => a.id === s.attributeId && !a.archivedAt))
                  .map((r) => (
                    <SkillNode key={r.id} skill={r} all={skillList} depth={0} onEdit={setEditSkill} />
                  ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-faint">
        As árvores representam o histórico de progresso dentro do sistema; não atribuem benefícios reais a valores virtuais.
      </p>
      {editAttr && <AttributeForm attr={editAttr === 'new' ? null : editAttr} onClose={() => setEditAttr(null)} />}
      {editSkill && (
        <SkillForm skill={editSkill === 'new' ? null : editSkill} attrs={attrs.data!} skills={skills.data ?? []} onClose={() => setEditSkill(null)} />
      )}
    </>
  );
}

function SkillNode({ skill, all, depth, onEdit }: { skill: Skill; all: Skill[]; depth: number; onEdit: (s: Skill) => void }) {
  const children = all.filter((s) => s.parentId === skill.id);
  return (
    <li>
      <div className={cx('flex items-center gap-3', skill.archivedAt && 'opacity-60')} style={{ paddingLeft: depth * 18 }}>
        {depth > 0 && <span className="h-px w-3 bg-line-strong" aria-hidden="true" />}
        <Icon name={skill.icon} size={16} className="shrink-0 text-faint" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate">{skill.name}</span>
            <span className="num text-xs">
              Nv <span className="text-accent">{skill.level}</span> · {pct(skill.progress)}
            </span>
          </div>
          <ProgressBar value={skill.progress} className="mt-1 !h-1.5" label={skill.name} />
          {skill.unlockLevel > 1 && <p className="text-xs text-faint">Ramo do nível {skill.unlockLevel}</p>}
        </div>
        <Button size="sm" variant="ghost" icon="pencil" aria-label={`Editar ${skill.name}`} onClick={() => onEdit(skill)} />
      </div>
      {children.length > 0 && (
        <ul className="mt-2 space-y-2">
          {children.map((c) => (
            <SkillNode key={c.id} skill={c} all={all} depth={depth + 1} onEdit={onEdit} />
          ))}
        </ul>
      )}
    </li>
  );
}

function ArchiveButton({ path, archived }: { path: string; archived: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.post(`${path}/${archived ? 'unarchive' : 'archive'}`),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error(e),
  });
  return (
    <Button size="sm" variant="ghost" icon="archive" loading={m.isPending} onClick={() => m.mutate()}>
      {archived ? 'Desarquivar' : 'Arquivar'}
    </Button>
  );
}

function AttributeForm({ attr, onClose }: { attr: Attribute | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm(
    attributeInput,
    (attr ?? { code: '', name: '', description: '', category: 'geral', color: '#c9a84c', icon: 'shield', progressionCriteria: '', sortOrder: 0 }) as AttrInput,
  );
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (attr ? api.put(`/api/attributes/${attr.id}`, d) : api.post('/api/attributes', d)),
    onSuccess: () => {
      toast.success('Atributo salvo');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title={attr ? 'Editar atributo' : 'Novo atributo'}>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Código"
            value={v.code}
            disabled={Boolean(attr)}
            onChange={(e) => form.set('code', e.target.value.toUpperCase())}
            error={form.errors.code}
            hint={attr ? 'Imutável (usado nos pesos).' : '2–8 letras, ex.: CAR'}
          />
          <Input className="sm:col-span-2" label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} />
          <Input label="Categoria" value={v.category ?? ''} onChange={(e) => form.set('category', e.target.value)} />
          <Input label="Cor" type="color" className="!h-10 !p-1" value={v.color ?? '#c9a84c'} onChange={(e) => form.set('color', e.target.value)} />
          <Select
            label="Ícone"
            value={v.icon ?? 'shield'}
            onChange={(e) => form.set('icon', e.target.value)}
            options={ICON_NAMES.map((n) => ({ value: n, label: n }))}
          />
        </div>
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <Textarea
          label="Critérios de progressão"
          value={v.progressionCriteria ?? ''}
          onChange={(e) => form.set('progressionCriteria', e.target.value)}
          rows={2}
          hint="Quais atividades registradas devem alimentar este atributo."
        />
        <Input label="Ordem" type="number" value={v.sortOrder ?? 0} onChange={(e) => form.set('sortOrder', Number(e.target.value))} />
        <FormActions onCancel={onClose} loading={save.isPending} />
      </form>
    </Modal>
  );
}

function SkillForm({ skill, attrs, skills, onClose }: { skill: Skill | null; attrs: Attribute[]; skills: Skill[]; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const form = useForm(
    skillInput,
    (skill
      ? {
          name: skill.name,
          description: skill.description,
          attributeId: skill.attributeId,
          parentId: skill.parentId,
          icon: skill.icon,
          unlockLevel: skill.unlockLevel,
          sortOrder: skill.sortOrder,
        }
      : { name: '', description: '', attributeId: null, parentId: null, icon: 'sparkles', unlockLevel: 1, sortOrder: 0 }) as SkillInput,
  );
  const v = form.values;
  const save = useMutation({
    mutationFn: (d: unknown) => (skill ? api.put(`/api/skills/${skill.id}`, d) : api.post('/api/skills', d)),
    onSuccess: () => {
      toast.success('Habilidade salva');
      void qc.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(e),
  });
  return (
    <Modal open onClose={onClose} title={skill ? 'Editar habilidade' : 'Nova habilidade'}>
      <form
        className="space-y-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const d = form.validate();
          if (d) save.mutate(d);
        }}
      >
        <Input label="Nome" value={v.name} onChange={(e) => form.set('name', e.target.value)} error={form.errors.name} />
        <Textarea label="Descrição" value={v.description ?? ''} onChange={(e) => form.set('description', e.target.value)} rows={2} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Atributo"
            value={v.attributeId ?? ''}
            onChange={(e) => form.set('attributeId', e.target.value || null)}
            placeholder="Nenhum"
            options={attrs.filter((a) => !a.archivedAt).map((a) => ({ value: a.id, label: `${a.name} (${a.code})` }))}
          />
          <Select
            label="Habilidade-mãe"
            value={v.parentId ?? ''}
            onChange={(e) => form.set('parentId', e.target.value || null)}
            placeholder="Raiz do ramo"
            options={skills.filter((s) => s.id !== skill?.id).map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            label="Ícone"
            value={v.icon ?? 'sparkles'}
            onChange={(e) => form.set('icon', e.target.value)}
            options={ICON_NAMES.map((n) => ({ value: n, label: n }))}
          />
          <Input
            label="Nível do personagem para o ramo"
            type="number"
            min={1}
            value={v.unlockLevel ?? 1}
            onChange={(e) => form.set('unlockLevel', Number(e.target.value))}
          />
        </div>
        {skill && (
          <p className="text-xs text-faint">
            <Badge>Nível {skill.level}</Badge> {fmt(skill.xp)} XP de maestria — projeção do livro-razão, não editável aqui.
          </p>
        )}
        <div className="flex justify-between">
          {skill ? <ArchiveButton path={`/api/skills/${skill.id}`} archived={Boolean(skill.archivedAt)} /> : <span />}
          <FormActions onCancel={onClose} loading={save.isPending} />
        </div>
      </form>
    </Modal>
  );
}
