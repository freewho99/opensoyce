import React, { useMemo, useState } from 'react';
import { CheckCircle2, X, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { OTS_PATTERN_DEFINITIONS } from '../shared/otsPatterns.js';

// Subset of the candidate shape the form actually needs to pre-fill from.
export type PromoteFormCandidate = {
  id: string;
  title: string;
  source_url: string | null;
  parsed_package: string | null;
  parsed_version: string | null;
  parsed_ecosystem: 'npm' | 'PyPI' | null;
};

export type PromoteIncidentPayload = {
  id: string;
  name: string;
  date: string;
  target: string;
  sourceUrl: string;
  corroboratingSourceUrl?: string;
  sourceConfidence: 'primary' | 'authoritative-secondary' | 'unverified';
  description: string;
  context: string;
  whatHappened: string;
  triggeredPatternIds: string[];
  preventionStrategy: string;
};

export type PromoteFormProps = {
  candidate: PromoteFormCandidate;
  /** Called with the full payload when the reviewer submits. Receives the
   *  candidate id + the incident payload separately so the parent can route
   *  to /api/exceptions?action=candidate-promote with both. */
  onSubmit: (candidateId: string, incident: PromoteIncidentPayload, reviewNotes: string) => Promise<{ ok: boolean; prUrl?: string; error?: string }>;
  onCancel: () => void;
};

// Autogenerate a kebab-case slug from a candidate title or package name.
// Reviewer can override; this is just the starting suggestion.
function suggestSlug(seed: string): string {
  return seed
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function PromoteIncidentForm({ candidate, onSubmit, onCancel }: PromoteFormProps) {
  // Pre-fill heuristics (per the agreed design: pre-fill from candidate
  // where we can, default sourceConfidence to 'unverified', reviewer
  // edits whatever they want before submit).
  const initial: PromoteIncidentPayload = useMemo(() => {
    const seedForSlug = candidate.parsed_package || candidate.title;
    return {
      id: suggestSlug(seedForSlug),
      name: candidate.title,
      date: todayISO(),
      target:
        candidate.parsed_package && candidate.parsed_version
          ? `${candidate.parsed_package}@${candidate.parsed_version}`
          : candidate.parsed_package || '',
      sourceUrl: candidate.source_url || '',
      corroboratingSourceUrl: '',
      sourceConfidence: 'unverified',
      description: '',
      context: '',
      whatHappened: '',
      triggeredPatternIds: [],
      preventionStrategy: '',
    };
  }, [candidate]);

  const [form, setForm] = useState<PromoteIncidentPayload>(initial);
  const [reviewNotes, setReviewNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; prUrl?: string; error?: string } | null>(null);

  const set = <K extends keyof PromoteIncidentPayload>(k: K, v: PromoteIncidentPayload[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const togglePattern = (id: string) => {
    setForm((prev) => ({
      ...prev,
      triggeredPatternIds: prev.triggeredPatternIds.includes(id)
        ? prev.triggeredPatternIds.filter((p) => p !== id)
        : [...prev.triggeredPatternIds, id],
    }));
  };

  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.id);
  const requiredFilled =
    !!form.id.trim() &&
    !!form.name.trim() &&
    !!form.date.trim() &&
    !!form.target.trim() &&
    !!form.sourceUrl.trim() &&
    !!form.description.trim() &&
    !!form.context.trim() &&
    !!form.whatHappened.trim() &&
    !!form.preventionStrategy.trim() &&
    form.triggeredPatternIds.length > 0;
  const canSubmit = slugValid && requiredFilled && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setResult(null);
    try {
      const payload: PromoteIncidentPayload = {
        ...form,
        // Strip optional empty strings so the API gets undefined, not ""
        corroboratingSourceUrl: form.corroboratingSourceUrl?.trim() ? form.corroboratingSourceUrl.trim() : undefined,
      };
      const r = await onSubmit(candidate.id, payload, reviewNotes.trim());
      setResult(r);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setSubmitting(false);
    }
  };

  // After success, show the PR link in place of the form
  if (result?.ok && result.prUrl) {
    return (
      <div className="border-4 border-emerald-500 bg-emerald-50 p-6 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 className="text-emerald-600 shrink-0" size={20} />
          <h4 className="text-sm font-black uppercase tracking-widest text-emerald-800">
            PROMOTE PR OPENED
          </h4>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-900 mb-4 leading-relaxed">
          The candidate is now <code className="bg-white px-1 border border-emerald-700">status=promoted</code>. The bot has opened a PR that appends the new incident to <code className="bg-white px-1 border border-emerald-700">src/data/promotedIncidents.json</code>. When that PR is reviewed and merged, the incident appears in the public OTS catalog.
        </p>
        <a
          href={result.prUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-emerald-700"
        >
          <ExternalLink size={12} /> Open promote PR
        </a>
        <div className="mt-4 pt-4 border-t-2 border-emerald-700/30">
          <button
            type="button"
            onClick={onCancel}
            className="text-[10px] font-black uppercase tracking-widest text-emerald-900 hover:underline"
          >
            Close form
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="border-4 border-emerald-500 bg-white p-6 mt-4 space-y-4">
      <div className="flex items-center justify-between border-b-2 border-emerald-500/30 pb-3 mb-2">
        <h4 className="text-sm font-black uppercase tracking-widest text-emerald-700">
          PROMOTE TO PUBLIC INCIDENT
        </h4>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-black hover:text-soy-red disabled:opacity-50"
          aria-label="Close form"
        >
          <X size={16} />
        </button>
      </div>

      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-relaxed">
        Submit opens a PR via the OpenSoyce promote-bot. Nothing is published until that PR is reviewed and merged. The candidate flips to <code className="bg-soy-label/20 px-1">promoted</code> with the PR URL stored as audit anchor.
      </p>

      {/* Two-column grid for short fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Slug (incident.id) — kebab-case
          </span>
          <input
            type="text"
            value={form.id}
            onChange={(e) => set('id', e.target.value)}
            disabled={submitting}
            className={`w-full border-2 px-3 py-2 text-xs font-mono focus:outline-none ${
              slugValid ? 'border-black bg-white' : 'border-soy-red bg-red-50'
            }`}
          />
          {!slugValid && (
            <span className="text-[9px] font-bold text-soy-red mt-1 block">
              Must be lowercase letters/digits/hyphens (e.g. ua-parser-js-compromise)
            </span>
          )}
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Date (YYYY-MM-DD or "March 14–15, 2025")
          </span>
          <input
            type="text"
            value={form.date}
            onChange={(e) => set('date', e.target.value)}
            disabled={submitting}
            className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Name (incident.name)
          </span>
          <input
            type="text"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            disabled={submitting}
            className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Target (e.g. ua-parser-js@0.7.29)
          </span>
          <input
            type="text"
            value={form.target}
            onChange={(e) => set('target', e.target.value)}
            disabled={submitting}
            className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Source URL (required)
          </span>
          <input
            type="url"
            value={form.sourceUrl}
            onChange={(e) => set('sourceUrl', e.target.value)}
            disabled={submitting}
            className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Corroborating Source URL (optional)
          </span>
          <input
            type="url"
            value={form.corroboratingSourceUrl || ''}
            onChange={(e) => set('corroboratingSourceUrl', e.target.value)}
            disabled={submitting}
            className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none"
          />
        </label>

        <label className="block md:col-span-2">
          <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
            Source Confidence
          </span>
          <select
            value={form.sourceConfidence}
            onChange={(e) => set('sourceConfidence', e.target.value as PromoteIncidentPayload['sourceConfidence'])}
            disabled={submitting}
            className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none"
          >
            <option value="unverified">unverified — awaiting corroboration</option>
            <option value="authoritative-secondary">authoritative-secondary — established outlet, not primary</option>
            <option value="primary">primary — vendor advisory, official postmortem, or first-hand source</option>
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
          Description (one-paragraph summary; ~1–2 sentences)
        </span>
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          disabled={submitting}
          className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none min-h-[60px]"
        />
      </label>

      <label className="block">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
          Context (why this matters; ecosystem stakes; reach)
        </span>
        <textarea
          value={form.context}
          onChange={(e) => set('context', e.target.value)}
          disabled={submitting}
          className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none min-h-[80px]"
        />
      </label>

      <label className="block">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
          What Happened (incident timeline + technical detail)
        </span>
        <textarea
          value={form.whatHappened}
          onChange={(e) => set('whatHappened', e.target.value)}
          disabled={submitting}
          className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none min-h-[100px]"
        />
      </label>

      <label className="block">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
          Prevention Strategy (what consumers should do)
        </span>
        <textarea
          value={form.preventionStrategy}
          onChange={(e) => set('preventionStrategy', e.target.value)}
          disabled={submitting}
          className="w-full border-2 border-black bg-white px-3 py-2 text-xs font-mono focus:outline-none min-h-[80px]"
        />
      </label>

      <fieldset className="border-2 border-black bg-soy-label/10 p-3">
        <legend className="text-[9px] font-black uppercase tracking-widest opacity-70 px-1">
          Triggered Patterns (select 1 or more from the existing catalog)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 max-h-[180px] overflow-y-auto">
          {OTS_PATTERN_DEFINITIONS.map((p: { id: string; name: string }) => (
            <label
              key={p.id}
              className="flex items-start gap-2 text-[10px] font-bold tracking-wide cursor-pointer hover:bg-white p-1"
            >
              <input
                type="checkbox"
                checked={form.triggeredPatternIds.includes(p.id)}
                onChange={() => togglePattern(p.id)}
                disabled={submitting}
                className="mt-0.5 shrink-0"
              />
              <span>
                <code className="font-mono text-[9px] opacity-70">{p.id}</code>
                <br />
                <span className="opacity-90">{p.name}</span>
              </span>
            </label>
          ))}
        </div>
        {form.triggeredPatternIds.length === 0 && (
          <p className="text-[9px] font-bold text-soy-red mt-2">
            Select at least one pattern.
          </p>
        )}
      </fieldset>

      <label className="block">
        <span className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1 block">
          Reviewer notes (optional — stored on the candidate row, not in the public incident)
        </span>
        <textarea
          value={reviewNotes}
          onChange={(e) => setReviewNotes(e.target.value)}
          disabled={submitting}
          maxLength={2000}
          className="w-full border-2 border-black bg-soy-label/10 px-3 py-2 text-xs font-mono focus:outline-none min-h-[50px]"
        />
      </label>

      {result && !result.ok && (
        <div className="bg-soy-red text-white border-2 border-black p-3 text-[10px] font-black uppercase tracking-widest flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{result.error || 'Promote failed.'}</span>
        </div>
      )}

      <div className="pt-4 border-t-2 border-emerald-500/30 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="bg-emerald-500 text-white px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black shadow-[2px_2px_0px_#000] hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {submitting ? <Loader2 className="animate-spin" size={12} /> : <CheckCircle2 size={12} />}
          {submitting ? 'Opening promote PR…' : 'Open promote PR'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="bg-white text-black px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-2 border-black hover:bg-black hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
