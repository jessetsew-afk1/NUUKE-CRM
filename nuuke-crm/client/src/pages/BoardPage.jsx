import { useMemo, useRef, useState } from 'react';
import { Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { BOARDS } from '../boards/boardConfig.js';
import TableView from '../boards/TableView.jsx';
import KanbanView from '../boards/KanbanView.jsx';
import TimelineView from '../boards/TimelineView.jsx';
import ChartView from '../boards/ChartView.jsx';
import ItemDrawer from '../components/ItemDrawer.jsx';
import Modal from '../components/Modal.jsx';
import Menu, { useMenu } from '../components/Menu.jsx';
import Icon from '../components/Icon.jsx';
import { Wordmark } from '../components/Logo.jsx';

import { useAuth } from '../context/AuthContext.jsx';
import { useMeta } from '../context/MetaContext.jsx';
import { useCollection, useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { DEPARTMENTS } from '../lib/palette.js';

const VIEW_LABEL = { table: 'Main table', kanban: 'Kanban', timeline: 'Timeline', chart: 'Charts' };
const VIEW_ICON = { table: 'table', kanban: 'kanban', timeline: 'gantt', chart: 'chart' };

/** Builds a create form from the board's own column definitions. */
function NewItemForm({ board, resource, presets, onCancel, onCreated }) {
  const { options, optionList } = useMeta();
  const { collection, create } = useData();
  const { toast, error } = useToast();

  const fields = board.newFields
    .map((id) => board.columns.find((c) => c.id === id))
    .filter(Boolean);

  const shape = {};
  fields.forEach((c) => {
    if (c.id === board.columns[0].id) shape[c.id] = z.string().trim().min(1, 'This cannot be empty');
    else if (c.type === 'status') shape[c.id] = z.string().optional();
    else if (c.type === 'dept') shape[c.id] = z.enum(DEPARTMENTS);
    else if (c.type === 'ref' || c.type === 'person') shape[c.id] = z.string().optional();
    else if (['money', 'num', 'hours', 'points', 'pct'].includes(c.type)) shape[c.id] = z.string().optional();
    else shape[c.id] = z.string().optional();
  });

  const defaults = {};
  fields.forEach((c) => { defaults[c.id] = presets?.[c.id] != null ? String(presets[c.id]) : ''; });

  const { register, handleSubmit, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(z.object(shape)), defaultValues: defaults });

  const submit = async (values) => {
    const body = {};
    fields.forEach((c) => {
      const raw = values[c.id];
      if (raw === '' || raw === undefined) return;
      if (c.type === 'ref' || c.type === 'person') body[c.id] = Number(raw);
      else if (['money', 'num', 'hours', 'points', 'pct'].includes(c.type)) body[c.id] = Number(raw);
      else body[c.id] = raw;
    });
    try {
      const created = await create(resource, body);
      toast(`Added to ${board.title}`);
      onCreated(created);
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)}>
      {fields.map((c) => {
        const id = `new-${c.id}`;
        return (
          <div className="field" key={c.id}>
            <label htmlFor={id}>{c.label}</label>
            {c.type === 'status' ? (
              <select id={id} className="input" {...register(c.id)}>
                <option value="">—</option>
                {optionList(c.options).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : c.type === 'dept' ? (
              <select id={id} className="input" {...register(c.id)}>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            ) : c.type === 'person' ? (
              <select id={id} className="input" {...register(c.id)}>
                <option value="">Unassigned</option>
                {collection('people').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : c.type === 'ref' ? (
              <select id={id} className="input" {...register(c.id)}>
                <option value="">—</option>
                {collection(c.ref).map((r) => (
                  <option key={r.id} value={r.id}>{r.name ?? r.title ?? r.number}</option>
                ))}
              </select>
            ) : c.type === 'date' ? (
              <input id={id} type="date" className="input" {...register(c.id)} />
            ) : ['money', 'num', 'hours', 'points', 'pct'].includes(c.type) ? (
              <input id={id} type="number" step="any" className="input" {...register(c.id)} />
            ) : (
              <input id={id} className="input" aria-invalid={Boolean(errors[c.id])} {...register(c.id)} />
            )}
            {errors[c.id] && <span className="err">{errors[c.id].message}</span>}
          </div>
        );
      })}
      <div className="modal-f">
        <button type="button" className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>Create</button>
      </div>
    </form>
  );
}

export default function BoardPage() {
  const { resource } = useParams();
  const { openPanel } = useOutletContext();
  const { user } = useAuth();
  const { can, ownField, ready } = useMeta();
  const { update, remove, collection } = useData();
  const { toast } = useToast();
  const { rows, loading } = useCollection(resource);
  const [params, setParams] = useSearchParams();

  const [openRow, setOpenRow] = useState(null);
  const [creating, setCreating] = useState(null);
  const [query, setQuery] = useState('');
  const [groupField, setGroupField] = useState(null);
  const [sort, setSort] = useState(null);

  const groupMenu = useMenu();
  const sortMenu = useMenu();
  const personMenu = useMenu();
  const [personFilter, setPersonFilter] = useState(null);

  const board = BOARDS[resource];
  const view = params.get('view') ?? board?.views[0] ?? 'table';

  const own = ownField(resource);
  const canEditRow = (row) => {
    if (!can(resource, 'write')) return false;
    if (!own) return true;
    return row[own] === user.person_id;
  };

  const visible = useMemo(() => {
    if (!board) return [];
    let list = rows;
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((row) =>
        board.columns.some((c) => {
          const v = row[c.id];
          if (v == null) return false;
          return String(Array.isArray(v) ? v.join(' ') : v).toLowerCase().includes(q);
        }) || String(row.key ?? '').toLowerCase().includes(q)
      );
    }
    if (personFilter) {
      list = list.filter((row) =>
        [row.assignee_id, row.owner_id, row.person_id, row.lead_id, row.account_manager_id, row.reporter_id, row.scrum_master_id]
          .includes(personFilter)
      );
    }
    if (sort) {
      list = [...list].sort((a, b) => {
        const x = a[sort.field] ?? '';
        const y = b[sort.field] ?? '';
        const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    return list;
  }, [rows, query, personFilter, sort, board]);

  if (!board) return <Navigate to="/" replace />;
  if (ready && !can(resource, 'read')) {
    return (
      <div className="empty" style={{ height: '100%' }}>
        <Wordmark height={26} />
        <h3>This board is not part of your role</h3>
        <p>
          Sales pipeline, proposals and billing are kept to owners and managers. Ask Aris if you
          need access.
        </p>
      </div>
    );
  }

  const activeGroup = groupField ?? board.groupBy;
  const patch = async (row, values) => { await update(resource, row.id, values); };
  const deleteRow = async () => {
    const row = openRow;
    setOpenRow(null);
    await remove(resource, row.id);
    toast('Deleted');
  };

  const groupable = board.columns.filter((c) => ['status', 'ref', 'person', 'dept'].includes(c.type));

  return (
    <>
      <header className="bar">
        <div className="bar-top">
          <button type="button" className="btn btn-ghost btn-sm mobile-only" onClick={openPanel} aria-label="Menu">
            <Icon name="menu" />
          </button>
          <div className="bar-title" style={{ minWidth: 0 }}>
            <h1>{board.title}</h1>
            <p>{board.blurb}</p>
          </div>
          <div className="bar-actions">
            {can(resource, 'create') && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating({})}>
                <Icon name="plus" />New item
              </button>
            )}
          </div>
        </div>

        {board.views.length > 1 && (
          <div className="tabs" role="tablist">
            {board.views.map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={`tab${view === v ? ' active' : ''}`}
                onClick={() => setParams({ view: v }, { replace: true })}
              >
                <Icon name={VIEW_ICON[v]} />{VIEW_LABEL[v]}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="toolbar">
        <div className="tool-search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder={`Search ${board.title.toLowerCase()}`}
            aria-label="Search this board"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <button ref={personMenu.anchorRef} type="button" className={`btn btn-sm${personFilter ? ' on' : ''}`} onClick={personMenu.openMenu}>
          <Icon name="person" />Person
        </button>
        {personMenu.open && (
          <Menu
            anchorRef={personMenu.anchorRef}
            title="Filter by person"
            onClose={personMenu.closeMenu}
            items={[
              { label: 'Everyone', checked: !personFilter, onSelect: () => setPersonFilter(null) },
              ...collection('people').map((p) => ({
                label: p.name, key: p.id, personId: p.id,
                checked: personFilter === p.id,
                onSelect: () => setPersonFilter(p.id),
              })),
            ]}
          />
        )}

        {view !== 'chart' && (
          <>
            <button ref={groupMenu.anchorRef} type="button" className="btn btn-sm" onClick={groupMenu.openMenu}>
              <Icon name="filter" />
              Group by: {board.columns.find((c) => c.id === activeGroup)?.label ?? '—'}
            </button>
            {groupMenu.open && (
              <Menu
                anchorRef={groupMenu.anchorRef}
                title="Group items by"
                onClose={groupMenu.closeMenu}
                items={groupable.map((c) => ({
                  label: c.label, key: c.id, checked: activeGroup === c.id,
                  onSelect: () => setGroupField(c.id),
                }))}
              />
            )}
          </>
        )}

        <button ref={sortMenu.anchorRef} type="button" className={`btn btn-sm${sort ? ' on' : ''}`} onClick={sortMenu.openMenu}>
          <Icon name="sort" />
          {sort ? `${board.columns.find((c) => c.id === sort.field)?.label} ${sort.dir === 'desc' ? '↓' : '↑'}` : 'Sort'}
        </button>
        {sortMenu.open && (
          <Menu
            anchorRef={sortMenu.anchorRef}
            title="Sort by"
            onClose={sortMenu.closeMenu}
            items={[
              { label: 'No sorting', onSelect: () => setSort(null) },
              ...board.columns.flatMap((c) => [
                { label: `${c.label} ↑`, key: `${c.id}-asc`, onSelect: () => setSort({ field: c.id, dir: 'asc' }) },
                { label: `${c.label} ↓`, key: `${c.id}-desc`, onSelect: () => setSort({ field: c.id, dir: 'desc' }) },
              ]),
            ]}
          />
        )}

        <span className="spacer" />
        <span className="chip">
          {visible.length}{visible.length !== rows.length ? ` of ${rows.length}` : ''} items
        </span>
        {(query || personFilter) && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); setPersonFilter(null); }}>
            <Icon name="x" />Clear
          </button>
        )}
      </div>

      <div className="stage">
        {loading && !rows.length ? (
          <div className="empty"><p>Loading…</p></div>
        ) : !visible.length ? (
          <div className="empty">
            <Wordmark height={26} />
            <h3>Nothing here yet</h3>
            <p>
              {query || personFilter
                ? 'No items match the current filter.'
                : 'This board is empty. Use “New item” to add the first one.'}
            </p>
          </div>
        ) : view === 'kanban' ? (
          <KanbanView
            board={board}
            rows={visible}
            onOpen={setOpenRow}
            onPatch={patch}
            canEdit={canEditRow}
            onAdd={can(resource, 'create') ? (key, field) => setCreating({ [field]: key }) : null}
          />
        ) : view === 'timeline' ? (
          <TimelineView board={board} resource={resource} rows={visible} groupField={activeGroup} onOpen={setOpenRow} />
        ) : view === 'chart' ? (
          <ChartView board={board} resource={resource} rows={visible} />
        ) : (
          <TableView
            board={board}
            resource={resource}
            rows={visible}
            groupField={activeGroup}
            onOpen={setOpenRow}
            onPatch={patch}
            canEdit={canEditRow}
            onAdd={can(resource, 'create') ? (key, field) => setCreating({ [field]: key }) : null}
          />
        )}
      </div>

      {openRow && (
        <ItemDrawer
          board={board}
          resource={resource}
          row={rows.find((r) => r.id === openRow.id) ?? openRow}
          editable={canEditRow(openRow)}
          canDelete={can(resource, 'remove')}
          onPatch={(values) => patch(openRow, values)}
          onDelete={deleteRow}
          onClose={() => setOpenRow(null)}
        />
      )}

      {creating && (
        <Modal
          title={`New ${board.title.replace(/s$/, '').toLowerCase()}`}
          hint="It lands on this board straight away and everyone with access sees it."
          onClose={() => setCreating(null)}
        >
          <NewItemForm
            board={board}
            resource={resource}
            presets={creating}
            onCancel={() => setCreating(null)}
            onCreated={() => setCreating(null)}
          />
        </Modal>
      )}
    </>
  );
}
