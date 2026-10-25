'use client';

import { useRef, useState } from 'react';
import DatePicker from 'react-date-picker';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalendar, faXmark } from '@fortawesome/free-solid-svg-icons';
import { PRIORITIES, PRIORITY_LABELS, STAGES, STAGE_LABELS, isOverdue } from '@/lib/projects';
import { fromDateInput, toDateInput } from '@/lib/date';
import type { ProjectItem, ProjectItemPatch, ProjectStage } from '@/lib/types';
import Modal from '../../components/Modal';
import type { BoardState } from './Board';
import { formatDay, useTwoTapDelete } from './project-ui';
// The date-picker overrides live with the capture modal; DateTimeFields shares them the same way.
import pickerStyles from '../../components/captureModal.module.css';
import styles from './itemModal.module.css';

type Props = {
  item: ProjectItem;
  board: BoardState;
  onClose: () => void;
};

// One card, edited in place. Text saves on blur or close; the pickers save as they change.
export default function ItemModal({ item, board, onClose }: Props) {
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? '');
  // What the server last heard, so a blur followed by a close never sends the same edit twice.
  const saved = useRef({ title: item.title, description: item.description ?? '' });
  const remove = useTwoTapDelete();

  function commitText() {
    const patch: ProjectItemPatch = {};
    const nextTitle = title.trim();
    // A title can't be blank, so clearing it puts the old one back.
    if (!nextTitle) setTitle(saved.current.title);
    else if (nextTitle !== saved.current.title) patch.title = nextTitle;
    // A blank description clears it server-side; PATCH reads only null as "unchanged".
    const nextDescription = description.trim();
    if (nextDescription !== saved.current.description) patch.description = nextDescription;
    if (patch.title === undefined && patch.description === undefined) return;

    const previous = saved.current;
    saved.current = {
      title: patch.title ?? previous.title,
      description: patch.description ?? previous.description,
    };
    void board.updateItem(item.id, patch).then((ok) => {
      if (!ok) saved.current = previous;
    });
  }

  function close() {
    commitText();
    onClose();
  }

  function handleStage(stage: ProjectStage) {
    const others = board.items.filter((i) => i.stage === stage && i.id !== item.id).length;
    void board.moveItem(item.id, stage, others);
  }

  function handleDue(value: Date | null) {
    if (!value) {
      if (item.dueOn) void board.clearDue(item.id);
      return;
    }
    const dueOn = toDateInput(value);
    if (dueOn !== item.dueOn) void board.updateItem(item.id, { dueOn });
  }

  function handleDelete() {
    if (!remove.confirm()) return;
    // Closed first and without saving: a pending edit to a deleted item would only 404.
    onClose();
    void board.deleteItem(item.id);
  }

  return (
    <Modal open eyebrow="Item" onClose={close} width={520} height={600}>
      <div className={styles.form}>
        <textarea
          className={styles.title}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            // A title is one line: Enter commits it instead of adding a newline.
            if (e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          rows={2}
          maxLength={200}
          aria-label="Title"
        />

        <textarea
          className={styles.description}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitText}
          placeholder="Add a description"
          rows={6}
          aria-label="Description"
        />

        <div className={styles.field}>
          <span className={styles.label}>Priority</span>
          <div className={styles.segmented}>
            {PRIORITIES.map((priority) => (
              <button
                key={priority}
                type="button"
                className={[styles.segment, item.priority === priority ? styles.segmentActive : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={item.priority === priority}
                onClick={() => {
                  if (priority !== item.priority) void board.updateItem(item.id, { priority });
                }}
              >
                {PRIORITY_LABELS[priority]}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Stage</span>
            <select
              className={styles.select}
              value={item.stage}
              onChange={(e) => handleStage(e.target.value as ProjectStage)}
            >
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage]}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.field}>
            <span className={styles.label}>
              Due
              {isOverdue(item, new Date()) && <span className={styles.overdue}> · overdue</span>}
            </span>
            <div className={pickerStyles.datePicker}>
              <DatePicker
                value={item.dueOn ? fromDateInput(item.dueOn) : null}
                onChange={(value) => handleDue(value as Date | null)}
                format="y-MM-dd"
                locale="en-US"
                dayPlaceholder="dd"
                monthPlaceholder="mm"
                yearPlaceholder="yyyy"
                calendarIcon={<FontAwesomeIcon icon={faCalendar} />}
                clearIcon={item.dueOn ? <FontAwesomeIcon icon={faXmark} /> : null}
                clearAriaLabel="Clear due date"
                calendarAriaLabel="Pick a due date"
                calendarProps={{ prev2Label: null, next2Label: null }}
              />
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <span className={styles.meta}>created {formatDay(toDateInput(new Date(item.createdAt)))}</span>
          <button
            type="button"
            className={[styles.deleteBtn, remove.armed ? styles.deleteBtnArmed : ''].filter(Boolean).join(' ')}
            onClick={handleDelete}
          >
            {remove.armed ? 'Tap again to delete' : 'Delete item'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
