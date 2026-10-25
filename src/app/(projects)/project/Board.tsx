'use client';

import { useMemo, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type PointerSensorOptions,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAlignLeft, faPlus } from '@fortawesome/free-solid-svg-icons';
import type { useProjectItems } from '@/lib/use-project-items';
import { PRIORITY_LABELS, STAGES, STAGE_LABELS, isOverdue } from '@/lib/projects';
import { fromDateInput } from '@/lib/date';
import type { ProjectItem, ProjectPriority, ProjectStage } from '@/lib/types';
import Skeleton, { SkeletonBlock } from '../../components/Skeleton';
import ItemModal from './ItemModal';
import styles from './board.module.css';

export type BoardState = ReturnType<typeof useProjectItems>;

type Columns = Record<ProjectStage, string[]>;

const SKELETON_CARDS = 3;

const PRIORITY_CLASS: Record<ProjectPriority, string> = {
  low: styles.priorityLow,
  normal: styles.priorityNormal,
  urgent: styles.priorityUrgent,
};

// Touch goes to TouchSensor and its press delay instead, so a swipe still scrolls the mobile strip.
class MouseAndPenSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (event: ReactPointerEvent, options: PointerSensorOptions) =>
        event.nativeEvent.pointerType !== 'touch' && PointerSensor.activators[0].handler(event, options),
    },
  ];
}

// Space lifts a card; Enter is left to the button, so it opens the card as everywhere else.
const KEYBOARD_CODES = { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter', 'Tab'] };

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// dnd-kit animates in JS, so CSS alone can't switch its motion off.
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

function groupIds(items: ProjectItem[]): Columns {
  const columns = Object.fromEntries(STAGES.map((stage) => [stage, [] as string[]])) as Columns;
  for (const item of items) columns[item.stage].push(item.id);
  return columns;
}

// A droppable id is either a stage (the column itself) or a card id.
function findStage(columns: Columns, id: UniqueIdentifier): ProjectStage | null {
  if ((STAGES as readonly UniqueIdentifier[]).includes(id)) return id as ProjectStage;
  return STAGES.find((stage) => columns[stage].includes(String(id))) ?? null;
}

// The hook's optimistic rows carry a temp id until the server answers; nothing can act on them yet.
function isPending(item: ProjectItem): boolean {
  return item.id.startsWith('temp-');
}

// "Oct 2", with the year only when it isn't this one.
function formatShortDate(date: Date, today: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export default function Board({ board }: { board: BoardState }) {
  const { items, loading, error } = board;
  const reducedMotion = usePrefersReducedMotion();
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingStage, setAddingStage] = useState<ProjectStage | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  // While dragging, the columns follow the pointer here; the hook only hears about the drop.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const baseColumns = useMemo(() => groupIds(items), [items]);
  const columns = dragColumns ?? baseColumns;
  const today = new Date();

  const sensors = useSensors(
    useSensor(MouseAndPenSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: KEYBOARD_CODES,
      scrollBehavior: reducedMotion ? 'auto' : 'smooth',
    }),
  );

  const titleOf = (id: UniqueIdentifier) => itemById.get(String(id))?.title ?? 'item';
  const stageLabelOf = (id: UniqueIdentifier) => {
    const stage = findStage(columns, id);
    return stage ? STAGE_LABELS[stage] : 'the board';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${titleOf(active.id)} is over ${stageLabelOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Dropped ${titleOf(active.id)} in ${stageLabelOf(over.id)}.` : `Dropped ${titleOf(active.id)}.`,
    onDragCancel: ({ active }) => `Cancelled. ${titleOf(active.id)} is back where it was.`,
  };

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setDragColumns(baseColumns);
  }

  // Crossing into another column moves the card there now, so that column opens a gap for it.
  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    setDragColumns((prev) => {
      const current = prev ?? baseColumns;
      const from = findStage(current, active.id);
      const to = findStage(current, over.id);
      if (!from || !to || from === to) return prev;
      const target = current[to];
      const overIndex = target.indexOf(String(over.id));
      const translated = active.rect.current.translated;
      const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
      const index = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);
      return {
        ...current,
        [from]: current[from].filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      };
    });
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const current = dragColumns ?? baseColumns;
    const id = String(active.id);
    setActiveId(null);
    setDragColumns(null);
    const item = itemById.get(id);
    const stage = findStage(current, id);
    if (!over || !item || !stage) return;

    const ids = current[stage];
    const overIndex = ids.indexOf(String(over.id));
    const from = ids.indexOf(id);
    // Its index in the final column is also the number of other cards above it — the API's index.
    const index = arrayMove(ids, from, overIndex < 0 ? from : overIndex).indexOf(id);
    if (stage === item.stage && index === baseColumns[stage].indexOf(id)) return;
    void board.moveItem(id, stage, index);
  }

  function handleDragCancel() {
    setActiveId(null);
    setDragColumns(null);
  }

  if (loading && items.length === 0 && !error) return <BoardSkeleton />;
  if (error && items.length === 0 && !loading) return <p className={styles.message}>{error}</p>;

  const activeItem = activeId ? itemById.get(activeId) : undefined;
  const openItem = openId ? itemById.get(openId) : undefined;

  return (
    <>
      {error && <p className={styles.message}>{error}</p>}

      <DndContext
        id="project-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Press Enter to open this card. Press Space to pick it up, the arrow keys to move it, Space again to drop it, or Escape to cancel.',
          },
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={[styles.board, activeId ? styles.boardDragging : ''].filter(Boolean).join(' ')}>
          {STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              ids={columns[stage]}
              itemById={itemById}
              today={today}
              reducedMotion={reducedMotion}
              adding={addingStage === stage}
              onStartAdding={() => setAddingStage(stage)}
              onStopAdding={() => setAddingStage(null)}
              onAdd={(title) => board.addItem({ title, stage })}
              onOpen={setOpenId}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {activeItem && (
            <div
              className={[styles.card, styles.cardOverlay, activeItem.stage === 'done' ? styles.cardDone : '']
                .filter(Boolean)
                .join(' ')}
            >
              <CardBody item={activeItem} today={today} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {openItem && (
        <ItemModal key={openItem.id} item={openItem} board={board} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}

type ColumnProps = {
  stage: ProjectStage;
  ids: string[];
  itemById: Map<string, ProjectItem>;
  today: Date;
  reducedMotion: boolean;
  adding: boolean;
  onStartAdding: () => void;
  onStopAdding: () => void;
  onAdd: (title: string) => Promise<boolean>;
  onOpen: (id: string) => void;
};

function Column({
  stage,
  ids,
  itemById,
  today,
  reducedMotion,
  adding,
  onStartAdding,
  onStopAdding,
  onAdd,
  onOpen,
}: ColumnProps) {
  // The whole panel is the drop target, so an empty column still catches a card.
  const { setNodeRef } = useDroppable({ id: stage });
  const label = STAGE_LABELS[stage];

  return (
    <section ref={setNodeRef} className={styles.column} aria-label={label}>
      <header className={styles.columnHeader}>
        <h2 className={styles.columnLabel}>{label}</h2>
        <span className={styles.count}>{ids.length}</span>
        <button
          type="button"
          className={styles.addBtn}
          onClick={onStartAdding}
          aria-label={`Add an item to ${label}`}
        >
          <FontAwesomeIcon icon={faPlus} />
        </button>
      </header>

      <SortableContext id={stage} items={ids} strategy={verticalListSortingStrategy}>
        <div className={styles.cards}>
          {ids.map((id) => {
            const item = itemById.get(id);
            return item ? (
              <SortableCard
                key={id}
                item={item}
                today={today}
                reducedMotion={reducedMotion}
                onOpen={() => onOpen(id)}
              />
            ) : null;
          })}
        </div>
      </SortableContext>

      {adding ? (
        <AddItemInput onAdd={onAdd} onClose={onStopAdding} />
      ) : (
        ids.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyText}>Nothing here</p>
            <button type="button" className={styles.emptyAdd} onClick={onStartAdding}>
              Add item
            </button>
          </div>
        )
      )}
    </section>
  );
}

function SortableCard({
  item,
  today,
  reducedMotion,
  onOpen,
}: {
  item: ProjectItem;
  today: Date;
  reducedMotion: boolean;
  onOpen: () => void;
}) {
  const pending = isPending(item);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: pending,
    transition: reducedMotion ? null : undefined,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={[
        styles.card,
        item.stage === 'done' ? styles.cardDone : '',
        isDragging ? styles.cardPlaceholder : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      onClick={onOpen}
      disabled={pending}
      {...attributes}
      {...listeners}
    >
      <CardBody item={item} today={today} />
    </button>
  );
}

function CardBody({ item, today }: { item: ProjectItem; today: Date }) {
  const overdue = isOverdue(item, today);
  return (
    <>
      <span className={styles.cardTitle}>{item.title}</span>
      <span className={styles.cardMeta}>
        created {formatShortDate(new Date(item.createdAt), today)}
        {item.description && (
          <FontAwesomeIcon icon={faAlignLeft} className={styles.noteIcon} title="Has a description" />
        )}
      </span>
      <span className={styles.chips}>
        <span className={`${styles.chip} ${PRIORITY_CLASS[item.priority]}`}>
          {PRIORITY_LABELS[item.priority]}
        </span>
        {item.dueOn && (
          <span className={[styles.chip, overdue ? styles.chipOverdue : ''].filter(Boolean).join(' ')}>
            due {formatShortDate(fromDateInput(item.dueOn), today)}
          </span>
        )}
      </span>
    </>
  );
}

// Enter saves and stays open for the next one; Esc, or leaving it empty, closes it.
function AddItemInput({
  onAdd,
  onClose,
}: {
  onAdd: (title: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');

  async function submit() {
    const title = value.trim();
    if (!title) return;
    setValue('');
    // A failed save gives the text back rather than losing it.
    if (!(await onAdd(title))) setValue((current) => current || title);
  }

  return (
    <input
      className={styles.addInput}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          void submit();
        } else if (e.key === 'Escape') {
          onClose();
        }
      }}
      onBlur={() => {
        if (!value.trim()) onClose();
      }}
      placeholder="Add an item"
      aria-label="New item title"
      maxLength={200}
      autoFocus
    />
  );
}

// The real four columns, each with the same placeholder cards: varying the count
// would invent a density the fetch hasn't reported.
function BoardSkeleton() {
  return (
    <SkeletonBlock label="Loading board" className={styles.board}>
      {STAGES.map((stage) => (
        <section key={stage} className={styles.column}>
          <header className={styles.columnHeader}>
            <h2 className={styles.columnLabel}>{STAGE_LABELS[stage]}</h2>
            <Skeleton width={16} height={12} radius={4} />
            <span className={styles.addBtn} aria-hidden="true" />
          </header>
          <div className={styles.cards}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <div key={i} className={styles.card}>
                <Skeleton width="80%" height={14} radius={4} style={{ margin: '3.5px 0' }} />
                <Skeleton width="45%" height={12} radius={4} style={{ margin: '3px 0' }} />
                <Skeleton width={56} height={20} radius={999} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </SkeletonBlock>
  );
}
