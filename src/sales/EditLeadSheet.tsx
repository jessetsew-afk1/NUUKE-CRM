import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Phone, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/supabase';
import { joinPhones, splitPhones } from '@/lib/phones';
import type { Lead } from '@/lib/types';
import { Button, IconButton, Input, Label, Sheet, Textarea } from '@/ui/kit';
import { useToast } from '@/ui/toast';

const FIELDS = ['name', 'personal_email', 'work_email', 'country', 'service', 'platform', 'lead_date', 'post_link', 'query'] as const;
type Field = (typeof FIELDS)[number];
type Form = Record<Field, string> & { phones: string[] };

const fromLead = (l: Lead): Form => ({
  name: l.name ?? '', personal_email: l.personal_email ?? '', work_email: l.work_email ?? '', country: l.country ?? '',
  service: l.service ?? '', platform: l.platform ?? '', lead_date: l.lead_date ?? '', post_link: l.post_link ?? '', query: l.query ?? '',
  phones: (() => { const p = splitPhones(l.phone); return p.length ? p : ['']; })(),
});

/** Fix or complete a lead's details. Reps can edit their own leads; every change is logged on the lead. */
export function EditLeadSheet({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: (lead: Lead) => void }) {
  const [form, setForm] = useState<Form | null>(null);
  const [key, setKey] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  if ((lead?.id ?? null) !== key) {
    setKey(lead?.id ?? null);
    setForm(lead ? fromLead(lead) : null);
  }
  if (!lead || !form) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setPhone = (i: number, v: string) => set('phones', form.phones.map((p, j) => (j === i ? v : p)));

  const save = async () => {
    const before = fromLead(lead);
    const changes: Record<string, string> = {};
    for (const f of FIELDS) if (form[f].trim() !== before[f].trim()) changes[f] = form[f].trim();
    const phone = joinPhones(form.phones);
    if (phone !== joinPhones(before.phones)) changes.phone = phone;
    if (!Object.keys(changes).length) { onClose(); return; }
    setBusy(true);
    try {
      const saved = await rpc<Lead>('update_lead_details', { p_lead_id: lead.id, p_fields: changes });
      toast({ title: 'Lead updated', body: 'The change is saved on the lead’s history.', tone: 'success' });
      void qc.invalidateQueries({ queryKey: ['leads'] });
      void qc.invalidateQueries({ queryKey: ['lead-history', lead.id] });
      onSaved(saved);
    } catch (e) {
      toast({ title: (e as Error).message, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} width={680} title="Edit lead"
      footer={<><Button variant="glass" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={save}>Save changes</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} />

        <div className="sm:col-span-2">
          <Label hint="each number gets its own Call button">Phone numbers</Label>
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {form.phones.map((p, i) => (
                <motion.div key={i} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2">
                  <Input className="flex-1" value={p} onChange={(e) => setPhone(i, e.target.value)} placeholder="+1 555 123 4567"
                    leading={<Phone className="size-4" />} aria-label={`Phone ${i + 1}`} />
                  {form.phones.length > 1 && (
                    <IconButton label={`Remove number ${i + 1}`} onClick={() => set('phones', form.phones.filter((_, j) => j !== i))}><X className="size-4" /></IconButton>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => set('phones', [...form.phones, ''])}>Add another number</Button>
          </div>
        </div>

        <Input label="Personal email" type="email" value={form.personal_email} onChange={(e) => set('personal_email', e.target.value)} />
        <Input label="Work email" type="email" value={form.work_email} onChange={(e) => set('work_email', e.target.value)} />
        <Input label="Country" value={form.country} onChange={(e) => set('country', e.target.value)} />
        <Input label="Service" value={form.service} onChange={(e) => set('service', e.target.value)} />
        <Input label="Lead platform" value={form.platform} onChange={(e) => set('platform', e.target.value)} placeholder="Bark, Upwork, Website…" />
        <Input label="Enquiry date" type="date" value={form.lead_date} onChange={(e) => set('lead_date', e.target.value)} />
        <Input className="sm:col-span-2" label="Post link" value={form.post_link} onChange={(e) => set('post_link', e.target.value)} placeholder="https://…" />
        <Textarea className="sm:col-span-2" label="Query details" hint="the message ideas are written from this" rows={5} value={form.query} onChange={(e) => set('query', e.target.value)} />
      </div>
    </Sheet>
  );
}
