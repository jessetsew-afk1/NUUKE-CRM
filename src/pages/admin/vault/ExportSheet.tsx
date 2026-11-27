import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Check, FileDown, FileText, Layers } from 'lucide-react';
import { KINDS, KIND_ORDER, monthLabel, periodLabel, type Kind } from '@/lib/finance';
import { Button, Picker, Segmented, Sheet } from '@/ui/kit';
import { useToast } from '@/ui/toast';
import { monthOptions, periodMonths, useV, type Period, type PeriodPreset } from './parts';
import type { Detail, ExportWhat } from './pdf';

export interface ExportPreset { what?: string; team?: string }

/**
 * Choose what goes in a PDF: the whole business, an investor's team, one kind of money or one type;
 * the period; and a short summary or the full breakdown.
 */
export function ExportSheet({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: ExportPreset }) {
  const { data, period: viewPeriod, knownMonths } = useV();
  const toast = useToast();
  const [what, setWhat] = useState('overall');
  const [team, setTeam] = useState('company');
  const [period, setPeriod] = useState<Period>(viewPeriod);
  const [detail, setDetail] = useState<Detail>('simple');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setWhat(preset?.what ?? 'overall'); setTeam(preset?.team ?? 'company'); setPeriod(viewPeriod);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const months = useMemo(() => periodMonths(period, knownMonths), [period, knownMonths]);
  const opts = monthOptions(knownMonths);

  const used = useMemo(() => new Set(data.entries.map((e) => e.kind)), [data.entries]);
  const usedCats = useMemo(() => new Set(data.entries.map((e) => e.category_id)), [data.entries]);
  const whatOptions = [
    { value: 'overall', label: 'Everything (full financial report)', group: 'Overall' },
    ...KIND_ORDER.filter((k) => used.has(k)).map((k) => ({ value: `kind:${k}`, label: KINDS[k].label, hint: KINDS[k].plain, dot: KINDS[k].color, group: 'One kind of money' })),
    ...KIND_ORDER.flatMap((k) => data.categories.filter((c) => c.kind === k && usedCats.has(c.id))
      .map((c) => ({ value: `cat:${c.id}`, label: c.name, hint: KINDS[k].label, dot: KINDS[k].color, group: 'One type' }))),
  ];

  const go = async () => {
    setBusy(true);
    try {
      const t = team === 'company' ? 'company' : Number(team);
      const w: ExportWhat = what === 'overall' ? { type: 'overall', team: t, months, detail }
        : what.startsWith('kind:') ? { type: 'kind', kind: what.slice(5) as Kind, team: t, months, detail }
        : { type: 'category', id: Number(what.slice(4)), team: t, months, detail };
      const { downloadPdf } = await import('./pdf');
      const file = await downloadPdf(data, w);
      toast({ title: 'PDF downloaded', body: file, tone: 'success' });
      onClose();
    } catch (e) {
      toast({ title: 'Could not make the PDF', body: (e as Error).message, tone: 'danger' });
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Export a PDF" width={620}
      footer={<div className="flex w-full items-center gap-2">
        <span className="text-3 min-w-0 flex-1 truncate text-[12.5px]">{periodLabel(months)} · {detail === 'detailed' ? 'Detailed' : 'Summary'}</span>
        <Button variant="glass" onClick={onClose}>Cancel</Button>
        <Button variant="iris" loading={busy} icon={<FileDown className="size-4" />} onClick={() => void go()}>{busy ? 'Making the PDF…' : 'Download PDF'}</Button>
      </div>}>
      <div className="space-y-5">
        <Picker label="What to include" value={what} onChange={setWhat} options={whatOptions} />
        <Picker label="Whose numbers" value={team} onChange={setTeam}
          options={[{ value: 'company', label: 'The whole company (all teams)' }, ...data.investors.map((i) => ({ value: String(i.id), label: `${i.name}'s team` }))]} />

        <div>
          <div className="text-2 mb-1.5 text-[13px] font-semibold">Period</div>
          <div className="scroll-x no-scrollbar max-w-full">
            <Segmented<PeriodPreset> className="whitespace-nowrap" size="sm" value={period.preset} onChange={(preset) => setPeriod({ ...period, preset })}
              options={[
                { value: 'month', label: 'Month' }, { value: 'quarter', label: 'Quarter to date' }, { value: 'ytd', label: 'Year to date' },
                { value: '12m', label: '12 months' }, { value: 'all', label: 'All time' }, { value: 'custom', label: 'Custom' },
              ]} />
          </div>
          {period.preset !== 'all' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {period.preset === 'custom' && <><Picker className="w-[170px]" value={period.from} onChange={(from) => setPeriod({ ...period, from })} options={opts} /><span className="text-3 text-[13px]">to</span></>}
              <Picker className="w-[170px]" value={period.to} onChange={(to) => setPeriod({ ...period, to })} options={opts} />
              <span className="text-3 text-[12.5px]">{months.length > 1 ? `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}` : ''}</span>
            </div>
          )}
        </div>

        <div>
          <div className="text-2 mb-1.5 text-[13px] font-semibold">How much detail</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['simple', 'Summary', 'A short read: headline numbers, the trend, the P&L and where the money went.', FileText],
              ['detailed', 'Detailed', what === 'overall' ? 'Every type under each line, month-by-month tables, balance sheet, investors and every metric.' : 'Adds month-by-month figures and every single line.', Layers],
            ] as const).map(([v, t, sub, Icon]) => (
              <button key={v} type="button" aria-pressed={detail === v} onClick={() => setDetail(v)}
                className={clsx('relative flex items-start gap-3 rounded-[18px] border-2 p-3.5 text-left transition-[transform,background-color] outline-none focus-visible:ring-2 focus-visible:ring-iris/40',
                  detail === v ? 'border-iris bg-[linear-gradient(135deg,rgba(124,92,255,.16),rgba(90,184,255,.12))]' : 'fill border-transparent hover:-translate-y-0.5')}>
                <Icon className={clsx('mt-0.5 size-5 shrink-0', detail === v ? 'text-iris' : 'text-3')} />
                <span className="pr-5"><span className="block text-[14px] font-bold">{t}</span><span className="text-2 block text-[12.5px] leading-snug">{sub}</span></span>
                {detail === v && <span className="absolute right-3 top-3 grid size-5 place-items-center rounded-full bg-iris text-white"><Check className="size-3" /></span>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
