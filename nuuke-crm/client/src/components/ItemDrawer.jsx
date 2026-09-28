import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';
import Cell from '../boards/Cell.jsx';
import { api } from '../api/client.js';
import { useData } from '../context/DataContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { relativeTime } from '../lib/format.js';

const commentSchema = z.object({ body: z.string().trim().min(1, 'Write something first').max(4000) });
const subtaskSchema = z.object({ text: z.string().trim().min(1, 'Give it a name').max(300) });

function Details({ board, resource, row, editable, onPatch, onDelete, canDelete }) {
  const { collection } = useData();

  const related = [];
  if (resource === 'projects') {
    related.push(['Sprints', collection('sprints').filter((s) => s.project_id === row.id).map((s) => ({ label: s.name, status: s.status, options: 'sprintStatus' }))]);
    related.push(['Open tickets', collection('tasks').filter((t) => t.project_id === row.id && t.status !== 'Done').map((t) => ({ label: t.title, status: t.status, options: 'taskStatus' }))]);
    related.push(['Milestones', collection('milestones').filter((m) => m.project_id === row.id).map((m) => ({ label: m.name, status: m.status, options: 'milestoneStatus' }))]);
  }
  if (resource === 'sprints') {
    related.push(['Tickets', collection('tasks').filter((t) => t.sprint_id === row.id).map((t) => ({ label: t.title, status: t.status, options: 'taskStatus' }))]);
  }
  if (resource === 'clients') {
    related.push(['Projects', collection('projects').filter((p) => p.client_id === row.id).map((p) => ({ label: p.name, status: p.status, options: 'projectStatus' }))]);
  }
  if (resource === 'people') {
    related.push(['Assigned tickets', collection('tasks').filter((t) => t.assignee_id === row.id && t.status !== 'Done').map((t) => ({ label: t.title, status: t.status, options: 'taskStatus' }))]);
  }

  return (
    <>
      {board.columns.slice(1).map((column) => (
        <div className="fld" key={column.id}>
          <label>{column.label}</label>
          <div className="fld-v">
            <Cell column={column} row={row} editable={editable} onChange={onPatch} />
          </div>
        </div>
      ))}

      {related.filter(([, items]) => items.length).map(([label, items]) => (
        <div key={label}>
          <div className="dw-sec">{label} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>{items.length}</span></div>
          {items.slice(0, 12).map((item, i) => (
            <div className="listrow" key={i}>
              <span className="txt" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.label}
              </span>
              <span className="chip" style={{ marginLeft: 'auto' }}>{item.status}</span>
            </div>
          ))}
        </div>
      ))}

      {canDelete && (
        <>
          <div className="dw-sec">Danger zone</div>
          <button type="button" className="btn btn-sm btn-danger" onClick={onDelete}>
            <Icon name="trash" />Delete this item
          </button>
        </>
      )}
    </>
  );
}

function Updates({ resource, id }) {
  const { error } = useToast();
  const [items, setItems] = useState([]);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(commentSchema), defaultValues: { body: '' } });

  useEffect(() => {
    api.get(`/${resource}/${id}/updates`).then(setItems).catch(() => setItems([]));
  }, [resource, id]);

  const onSubmit = async (values) => {
    try {
      const created = await api.post(`/${resource}/${id}/updates`, values);
      setItems((list) => [created, ...list]);
      reset();
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit(onSubmit)}>
        <textarea
          className="input"
          placeholder="Post an update the team will see…"
          aria-invalid={Boolean(errors.body)}
          {...register('body')}
        />
        {errors.body && <span className="err">{errors.body.message}</span>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '8px 0 18px' }}>
          <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>
            <Icon name="send" />Post update
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-3)', fontSize: 13 }}>
          No updates yet. The first one you post shows up on the board as a count beside the item.
        </p>
      ) : (
        items.map((u) => (
          <div className="upd" key={u.id}>
            <Avatar personId={u.author_id} size="sm" />
            <div style={{ minWidth: 0 }}>
              <div className="upd-m">{u.author_name ?? 'Someone'} · {relativeTime(u.created_at)}</div>
              <div style={{ fontSize: 13 }}>{u.body}</div>
            </div>
          </div>
        ))
      )}
    </>
  );
}

function Subtasks({ resource, id, editable }) {
  const { error } = useToast();
  const [items, setItems] = useState([]);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm({ resolver: zodResolver(subtaskSchema), defaultValues: { text: '' } });

  useEffect(() => {
    api.get(`/${resource}/${id}/subtasks`).then(setItems).catch(() => setItems([]));
  }, [resource, id]);

  const toggle = async (item) => {
    setItems((list) => list.map((s) => (s.id === item.id ? { ...s, done: !s.done } : s)));
    try {
      await api.patch(`/${resource}/${id}/subtasks/${item.id}`, { done: !item.done });
    } catch (err) {
      setItems((list) => list.map((s) => (s.id === item.id ? { ...s, done: item.done } : s)));
      error(err.message);
    }
  };

  const onSubmit = async (values) => {
    try {
      const created = await api.post(`/${resource}/${id}/subtasks`, values);
      setItems((list) => [...list, created]);
      reset();
    } catch (err) {
      error(err.message);
    }
  };

  return (
    <>
      {items.length === 0 && <p style={{ color: 'var(--text-3)', fontSize: 13 }}>No checklist on this item yet.</p>}
      {items.map((s) => (
        <label className={`listrow${s.done ? ' done' : ''}`} key={s.id}>
          <input type="checkbox" checked={s.done} disabled={!editable} onChange={() => toggle(s)} />
          <span className="txt">{s.text}</span>
        </label>
      ))}

      {editable && (
        <form onSubmit={handleSubmit(onSubmit)} style={{ marginTop: 14 }}>
          <input className="input" placeholder="Add a checklist item…" aria-invalid={Boolean(errors.text)} {...register('text')} />
          {errors.text && <span className="err">{errors.text.message}</span>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn btn-sm" disabled={isSubmitting}><Icon name="plus" />Add</button>
          </div>
        </form>
      )}
    </>
  );
}

export default function ItemDrawer({ board, resource, row, editable, canDelete, onPatch, onDelete, onClose }) {
  const [tab, setTab] = useState('details');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tabs = ['details', board.comments && 'updates', board.subtasks && 'subtasks'].filter(Boolean);

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Item details">
        <div className="dw-h">
          <div style={{ minWidth: 0 }}>
            <span className="mono">{board.keyField && row[board.keyField] ? row[board.keyField] : board.title}</span>
            <h2>{row[board.columns[0].id] || 'Untitled'}</h2>
          </div>
          <button type="button" className="dw-x" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>

        <div className="dw-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="dw-b">
          {tab === 'details' && (
            <Details
              board={board}
              resource={resource}
              row={row}
              editable={editable}
              onPatch={onPatch}
              onDelete={onDelete}
              canDelete={canDelete}
            />
          )}
          {tab === 'updates' && <Updates resource={resource} id={row.id} />}
          {tab === 'subtasks' && <Subtasks resource={resource} id={row.id} editable={editable} />}
        </div>
      </aside>
    </>
  );
}
