import { useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import { DeptChip, Pill } from '../components/Pill.jsx';
import Icon from '../components/Icon.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useData } from '../context/DataContext.jsx';
import { DEPARTMENT_COLOR } from '../lib/palette.js';
import { formatDay, money } from '../lib/format.js';

const WIP_LIMIT = { 'In progress': 6 };

export default function KanbanView({ board, rows, onOpen, onPatch, canEdit, onAdd }) {
  const { options, optionColor } = useMeta();
  const { nameOf } = useData();
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);

  const field = board.kanbanBy;
  const column = board.columns.find((c) => c.id === field);
  const columnKeys =
    column?.type === 'dept'
      ? Object.keys(DEPARTMENT_COLOR)
      : (options[column?.options] ?? []).map(([label]) => label);

  const colorFor = (key) =>
    column?.type === 'dept' ? DEPARTMENT_COLOR[key] ?? 'var(--line-strong)' : optionColor(column?.options, key);

  const buckets = new Map(columnKeys.map((k) => [k, []]));
  rows.forEach((row) => {
    const key = row[field] ?? columnKeys[0];
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  });

  const cardColumn = board.columns.find((c) => c.id === board.cardColor);
  const pointsColumn = board.columns.find((c) => c.type === 'points');
  const dueColumn = board.columns.find((c) => c.type === 'date' && /due|target|close|sent|reported|opened/.test(c.id));

  const handleDrop = (key) => {
    setOverColumn(null);
    const row = rows.find((r) => r.id === dragId);
    setDragId(null);
    if (!row || row[field] === key) return;
    if (!canEdit(row)) return;
    onPatch(row, { [field]: key });
  };

  return (
    <div className="kb">
      {[...buckets.entries()].map(([key, items]) => {
        const limit = field === 'status' ? WIP_LIMIT[key] : null;
        return (
          <section
            key={key}
            className={`kcol${overColumn === key ? ' over' : ''}`}
            style={{ '--kc': colorFor(key) }}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverColumn(key); } }}
            onDragLeave={() => setOverColumn((c) => (c === key ? null : c))}
            onDrop={(e) => { e.preventDefault(); handleDrop(key); }}
          >
            <div className="kcol-head">
              <h3>{key}</h3>
              <span className="cnt">{items.length}</span>
              {limit && (
                <span className={`wip${items.length > limit ? ' over' : ''}`}>WIP {items.length}/{limit}</span>
              )}
            </div>

            <div className="kcol-body">
              {items.map((row) => {
                const accent = cardColumn
                  ? cardColumn.type === 'dept'
                    ? DEPARTMENT_COLOR[row[board.cardColor]] ?? 'var(--line-strong)'
                    : optionColor(cardColumn.options, row[board.cardColor])
                  : colorFor(key);
                const assignee = row.assignee_id ?? row.owner_id ?? row.person_id ?? row.lead_id ?? row.account_manager_id;

                return (
                  <article
                    key={row.id}
                    className={`kcard${dragId === row.id ? ' dragging' : ''}`}
                    style={{ '--pc': accent }}
                    draggable={canEdit(row)}
                    onDragStart={() => setDragId(row.id)}
                    onDragEnd={() => { setDragId(null); setOverColumn(null); }}
                    onClick={() => onOpen(row)}
                  >
                    <div className="kcard-top">
                      {board.keyField && row[board.keyField] && (
                        <span className="kcard-id mono">{row[board.keyField]}</span>
                      )}
                      {cardColumn && cardColumn.type !== 'dept' && (
                        <Pill label={row[board.cardColor]} color={accent} style={{ fontSize: 10, padding: '1px 7px' }} />
                      )}
                      {cardColumn?.type === 'dept' && <DeptChip value={row[board.cardColor]} />}
                      <span className="cell-open" style={{ opacity: 0.55, marginLeft: 'auto' }}><Icon name="expand" /></span>
                    </div>

                    <h4>{row[board.columns[0].id] || 'Untitled'}</h4>

                    <div className="kcard-meta">
                      {row.department && board.cardColor !== 'department' && <DeptChip value={row.department} />}
                      {row.project_id != null && <span className="chip">{nameOf('projects', row.project_id)}</span>}
                      {row.client_id != null && <span className="chip">{nameOf('clients', row.client_id)}</span>}
                    </div>

                    <div className="kcard-foot">
                      <Avatar personId={assignee} size="sm" />
                      <span style={{ fontSize: 11.5, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {assignee ? nameOf('people', assignee) : 'Unassigned'}
                      </span>
                      <span className="sp">
                        {row.value != null && <span className="num" style={{ fontWeight: 600, color: 'var(--text)' }}>{money(row.value)}</span>}
                        {row.amount != null && <span className="num" style={{ fontWeight: 600, color: 'var(--text)' }}>{money(row.amount)}</span>}
                        {pointsColumn && row[pointsColumn.id] != null && <span className="mono">{row[pointsColumn.id]}p</span>}
                        {dueColumn && row[dueColumn.id] && (
                          <>
                            <Icon name="clock" size={12} />
                            <span>{formatDay(row[dueColumn.id])}</span>
                          </>
                        )}
                      </span>
                    </div>
                  </article>
                );
              })}

              {onAdd && (
                <button type="button" className="kadd" onClick={() => onAdd(key, field)}>
                  <Icon name="plus" />Add
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
