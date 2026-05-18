import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';

type RepoVisibility = 'public' | 'private' | 'both';
type Ecosystem = 'npm' | 'pnpm' | 'yarn' | 'uv' | 'poetry' | 'mixed';
type Concern =
  | 'vulnerabilities'
  | 'stale dependencies'
  | 'AI packages'
  | 'license risk'
  | 'dependency confusion'
  | 'client audit'
  | 'maintainer trust'
  | 'other';

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

const ALLOWED_PLANS = new Set(['starter', 'team', 'growth', 'enterprise']);

export default function GuardEarlyAccess() {
  const [searchParams] = useSearchParams();
  const rawPlan = searchParams.get('plan') || '';
  const plan = ALLOWED_PLANS.has(rawPlan) ? rawPlan : 'unknown';

  const planLabel = useMemo(() => {
    if (plan === 'unknown') return 'Guard';
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }, [plan]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [githubOrg, setGithubOrg] = useState('');
  const [visibility, setVisibility] = useState<RepoVisibility>('both');
  const [ecosystem, setEcosystem] = useState<Ecosystem>('npm');
  const [concern, setConcern] = useState<Concern>('vulnerabilities');

  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan,
          name: name.trim(),
          email: email.trim(),
          company: company.trim(),
          githubOrg: githubOrg.trim(),
          visibility,
          ecosystem,
          concern,
        }),
      });

      let body: { ok?: boolean; error?: string } = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }

      if (!res.ok || body.ok === false) {
        setStatus('error');
        setErrorMessage(body.error || `Request failed (HTTP ${res.status}). Try again.`);
        return;
      }
      setStatus('success');
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err && err.message ? String(err.message) : 'Network error. Try again.');
    }
  }

  function resetToIdle() {
    setStatus('idle');
    setErrorMessage('');
  }

  if (status === 'success') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24">
        <div className="bg-white border-4 border-soy-bottle p-12 shadow-[8px_8px_0px_#000]">
          <CheckCircle2 className="text-soy-red mb-6" size={56} />
          <h1 className="text-5xl font-black uppercase italic tracking-tighter mb-4">
            Thanks. We'll be in touch.
          </h1>
          <p className="text-base font-bold uppercase tracking-widest opacity-60 leading-relaxed mb-8">
            You're on the {planLabel} early-access list. We onboard new teams personally — expect a real email from us within a few days.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              to="/scanner"
              className="inline-block bg-soy-bottle text-soy-label px-8 py-4 text-sm font-black uppercase tracking-widest border-4 border-soy-bottle hover:bg-soy-red hover:text-white transition-colors"
            >
              Try the free scanner
              <ArrowRight className="inline ml-2" size={14} />
            </Link>
            <Link
              to="/pricing"
              className="inline-block bg-white text-soy-bottle px-8 py-4 text-sm font-black uppercase tracking-widest border-4 border-soy-bottle hover:bg-soy-bottle hover:text-white transition-colors"
            >
              Back to pricing
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const submitting = status === 'submitting';

  return (
    <div className="max-w-3xl mx-auto px-4 py-20">
      <div className="mb-10">
        <p className="text-xs font-black uppercase tracking-widest opacity-60 mb-2">
          {planLabel} plan
        </p>
        <h1 className="text-5xl md:text-6xl font-black uppercase italic tracking-tighter mb-4">
          Guard Early Access
        </h1>
        <p className="text-base md:text-lg font-bold uppercase tracking-widest opacity-60 leading-relaxed">
          Tell us about your repos. We'll onboard you personally — billing turns on after Guard catches something real for you.
        </p>
      </div>

      {status === 'error' && (
        <div className="mb-8 bg-white border-4 border-soy-red p-6 shadow-[6px_6px_0px_#E63322] flex items-start gap-4">
          <AlertTriangle className="text-soy-red shrink-0 mt-1" size={24} />
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-widest mb-2">Submission failed</p>
            <p className="text-xs font-bold uppercase tracking-wide opacity-60 mb-4">{errorMessage}</p>
            <button
              type="button"
              onClick={resetToIdle}
              className="text-xs font-black uppercase tracking-widest bg-soy-red text-white px-4 py-2 hover:bg-soy-bottle transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white border-4 border-soy-bottle p-8 md:p-12 shadow-[8px_8px_0px_#000] space-y-6"
      >
        <input type="hidden" name="plan" value={plan} readOnly />

        <Field label="Name" required>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={submitting}
            className={inputClass}
            autoComplete="name"
          />
        </Field>

        <Field label="Email" required>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            className={inputClass}
            autoComplete="email"
          />
        </Field>

        <Field label="Company / team">
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            disabled={submitting}
            className={inputClass}
            autoComplete="organization"
          />
        </Field>

        <Field label="GitHub org">
          <input
            type="text"
            value={githubOrg}
            onChange={(e) => setGithubOrg(e.target.value)}
            disabled={submitting}
            placeholder="acme-inc"
            className={inputClass}
          />
        </Field>

        <Field label="Public or private repos?" required>
          <div className="flex flex-col sm:flex-row gap-3">
            {(['public', 'private', 'both'] as RepoVisibility[]).map((v) => (
              <label
                key={v}
                className={`flex-1 cursor-pointer border-4 border-soy-bottle px-4 py-3 text-sm font-black uppercase tracking-widest text-center transition-colors ${
                  visibility === v ? 'bg-soy-red text-white' : 'bg-white text-soy-bottle hover:bg-soy-bottle hover:text-white'
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={v}
                  checked={visibility === v}
                  onChange={() => setVisibility(v)}
                  disabled={submitting}
                  className="sr-only"
                />
                {v}
              </label>
            ))}
          </div>
        </Field>

        <Field label="Primary ecosystem" required>
          <select
            value={ecosystem}
            onChange={(e) => setEcosystem(e.target.value as Ecosystem)}
            disabled={submitting}
            className={inputClass}
          >
            <option value="npm">npm</option>
            <option value="pnpm">pnpm</option>
            <option value="yarn">yarn</option>
            <option value="uv">uv</option>
            <option value="poetry">poetry</option>
            <option value="mixed">mixed</option>
          </select>
        </Field>

        <Field label="Biggest concern" required>
          <select
            value={concern}
            onChange={(e) => setConcern(e.target.value as Concern)}
            disabled={submitting}
            className={inputClass}
          >
            <option value="vulnerabilities">Vulnerabilities</option>
            <option value="stale dependencies">Stale dependencies</option>
            <option value="AI packages">AI packages</option>
            <option value="license risk">License risk</option>
            <option value="dependency confusion">Dependency confusion</option>
            <option value="client audit">Client audit</option>
            <option value="maintainer trust">Maintainer trust</option>
            <option value="other">Other</option>
          </select>
        </Field>

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-5 text-lg font-black uppercase tracking-widest border-4 border-soy-bottle bg-soy-red text-white hover:bg-soy-bottle transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting...' : 'Request access'}
          {!submitting && <ArrowRight className="inline ml-2" size={18} />}
        </button>

        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 leading-relaxed text-center">
          We use this to triage early-access teams. No marketing spam. No third parties.
        </p>
      </form>
    </div>
  );
}

const inputClass =
  'w-full bg-white border-4 border-soy-bottle px-4 py-3 text-base font-bold focus:outline-none focus:border-soy-red transition-colors disabled:opacity-50';

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-black uppercase tracking-widest mb-2">
        {label}
        {required && <span className="text-soy-red ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}
