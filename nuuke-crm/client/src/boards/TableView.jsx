import { useState } from 'react';
import Cell, { useGrouping } from './Cell.jsx';
import Icon from '../components/Icon.jsx';
import { GROUP_PALETTE, DEPARTMENT_COLOR, DONE_LIKE } from '../lib/palette.js';
import { useMeta } from '../context/MetaContext.jsx';
import { groupBy, money, sum } from '../lib/format.js';

export default function TableView({ board, resource, rows, groupField, onOpen, onPatch, canEdit, onAdd }) {
  const { optionColor } = useMeta();
  const { groupOf, orderKeys } = useGrouping(board, resource);
  const [collapsed, setCollapsed] = useState({});

  const template = board.columns.map((c) => `${c.width}px`).join(' ');
  const grouped = groupBy(rows, (row) => groupOf(row, groupField).key);
  const keys = orderKeys([...grouped.keys()], groupField);

  const statusColumn = board.columns.find((c) => c.type === 'status');
  const moneyColumn = board.columns.find((c) => c.type === 'money');
  const pointsColumn = board.columns.find((c) => c.type === 'points');

  return (
    <div className="tv">
      {keys.map((key, index) => {
        const items = grouped.get(key);
        const info = groupOf(items[0], groupField);
        const color = info.color ?? (info.dept ? DEPARTMENT_COLOR[info.dept] : null) ?? GROUP_PALETTE[index % GROUP_PALETTE.length];
        const isCollapsed = collapsed[key];

        const distribution = statusColumn
          ? [...groupBy(items, (r) => r[statusColumn.id] ?? '—').entries()]
          : [];
        const done = items.filter((r) => statusColumn && DONE_LIKE.has(r[statusColumn.id])).length;

        return (
          <section className={`grp${isCollapsed ? ' collapsed' : ''}`} key={key}>
            <div className="grp-head">
              <button
                type="button"
                className="grp-caret"
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${info.label}`}
                onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
              >
                <Icon name="chev" />
              </button>
              <span className="grp-name" style={{ color }}>{info.label}</span>
              <span className="grp-count">{items.length} item{items.length === 1 ? '' : 's'}</span>
            </div>

            <div className="grp-body" style={{ '--grp-color': color }}>
              <div className="row head" style={{ gridTemplateColumns: template }}>
                {board.columns.map((c, i) => (
                  <div className={`cell${i === 0 ? ' cell-name' : ''}`} key={c.id}>{c.label}</div>
                ))}
              </div>

              {items.map((row) => (
                <div
                  className="row"
                  key={row.id}
                  style={{ gridTemplateColumns: template }}
                  onClick={() => onOpen(row)}
                >
                  {board.columns.map((column, i) =>
                    i === 0 ? (
                      <div className="cell cell-name" key={column.id}>
                        <span className="txt">
                          {board.keyField && row[board.keyField] && (
                            <span className="mono" style={{ color: 'var(--text-3)', fontSize: 11, marginRight: 7 }}>
                              {row[board.keyField]}
                            </span>
                          )}
                          {row[column.id] || 'Untitled'}
                        </span>
                        <span className="cell-open" aria-hidden="true"><Icon name="expand" /></span>
                      </div>
                    ) : (
                      <div
                        className={`cell${column.type === 'status' ? ' fill' : ''}`}
                        key={column.id}
                        onClick={(e) => { if (column.type === 'status' || column.type === 'person') e.stopPropagation(); }}
                      >
                        <Cell
                          column={column}
                          row={row}
                          editable={canEdit(row)}
                          onChange={(patch) => onPatch(row, patch)}
                        />
                      </div>
                    )
                  )}
                </div>
              ))}

              {onAdd && (
                <button type="button" className="addrow" onClick={() => onAdd(key, groupField)}>
                  <Icon name="plus" />
                  Add item
                </button>
              )}
            </div>

            {statusColumn && !isCollapsed && (
              <div className="grp-sum">
                <div className="sumbar">
                  {distribution.map(([status, group]) => (
                    <i
                      key={status}
                      title={`${status}: ${group.length}`}
                      style={{ width: `${(group.length / items.length) * 100}%`, background: optionColor(statusColumn.options, status) }}
                    />
                  ))}
                </div>
                <span className="sum-lbl">{Math.round((done / items.length) * 100)}% complete</span>
                {moneyColumn && <span className="sum-lbl">· {moneyColumn.label} {money(sum(items, (r) => r[moneyColumn.id]))}</span>}
                {pointsColumn && <span className="sum-lbl">· {sum(items, (r) => r[pointsColumn.id])} pts</span>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
