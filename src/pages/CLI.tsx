import React, { useState } from 'react';
import { Terminal, Copy, Check, Info, ShieldCheck, Zap, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const CodeBlock = ({ code, label, highlight = true }: { code: string; label?: string; highlight?: boolean }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightedCode = () => {
    if (!highlight) return code;
    
    // Split by non-word characters but keep them to preserve formatting and highlight specific patterns
    return code.split(/(\s+|[:{}()[\],!])/).map((part, i) => {
      if (['npx', 'soyce', 'check', 'name', 'run', 'scripts'].includes(part)) {
        return <span key={i} className="text-soy-red">{part}</span>;
      }
      if (part.startsWith('--')) {
        return <span key={i} className="text-amber-500">{part}</span>;
      }
      if (part.startsWith('"') && part.endsWith('"')) {
        return <span key={i} className="text-emerald-500">{part}</span>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="group relative bg-black border-2 border-soy-bottle p-4 overflow-hidden">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 opacity-60 font-mono">
          {label || 'Terminal'}
        </span>
        <button 
          onClick={handleCopy}
          className="text-white hover:text-soy-red transition-colors p-1"
        >
          {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
        </button>
      </div>
      <code className="block font-mono text-sm leading-relaxed text-[#00FF41] break-all">
        {highlightedCode()}
      </code>
      <AnimatePresence>
        {copied && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-2 right-10 bg-soy-red text-white text-[10px] px-2 py-0.5 font-bold uppercase"
          >
            Copied!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function CLI() {
  const [activeTab, setActiveTab] = useState('github');

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      {/* Hero Section */}
      <section className="mb-20">
        <div className="mb-8">
          <h1 className="text-5xl md:text-8xl font-black uppercase italic tracking-tighter mb-4">CLI TOOL</h1>
          <p className="text-xl md:text-2xl font-bold uppercase tracking-widest text-soy-bottle/60 max-w-2xl leading-tight">
            RUN SOYCE IN YOUR CI PIPELINE. <span className="text-soy-red">CATCH DEPENDENCY ROT</span> BEFORE IT SHIPS.
          </p>
        </div>

        <div className="bg-black border-4 border-soy-bottle p-8 shadow-[12px_12px_0px_#302C26] relative group">
          <div className="mb-4 flex gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500"></div>
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          </div>
          <div className="font-mono text-2xl md:text-4xl text-[#00FF41] flex items-center">
            <span className="mr-4 opacity-40">$</span>
            <span>npx soyce check</span>
            <motion.div 
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="ml-2 w-4 h-10 bg-[#00FF41]"
            ></motion.div>
          </div>
          <button 
            onClick={() => {
              navigator.clipboard.writeText('npx soyce check');
            }}
            className="absolute bottom-4 right-4 text-[10px] font-bold text-white/40 uppercase hover:text-[#00FF41] transition-colors flex items-center gap-2"
          >
            <Copy size={12} /> COPY COMMAND
          </button>
        </div>
      </section>

      {/* Install & Usage */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
        <div className="bg-white border-4 border-soy-bottle p-6 space-y-4 shadow-[8px_8px_0px_#000]">
          <h3 className="text-xl font-black uppercase italic">01. QUICK START</h3>
          <CodeBlock code="npx soyce check" label="CLI" highlight={false} />
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
            No install needed. Runs anywhere Node.js environment exists.
          </p>
        </div>
        <div className="bg-white border-4 border-soy-bottle p-6 space-y-4 shadow-[8px_8px_0px_#000]">
          <h3 className="text-xl font-black uppercase italic">02. LOCAL ANALYZE</h3>
          <CodeBlock code="npx soyce check --file package.json" label="CLI" highlight={false} />
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
            Analyze your local project dependencies and generate health report.
          </p>
        </div>
        <div className="bg-white border-4 border-soy-bottle p-6 space-y-4 shadow-[8px_8px_0px_#000]">
          <h3 className="text-xl font-black uppercase italic">03. CI FAIL-SAFE</h3>
          <CodeBlock code="npx soyce check --fail-below 7.0" label="CLI" highlight={false} />
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic">
            Enforce quality standards. Fail the build if scores drop below 7.0.
          </p>
        </div>
      </section>

      {/* Output Preview */}
      <section className="mb-24">
        <h2 className="text-3xl font-black uppercase italic tracking-tight mb-8 flex items-center gap-3">
          <Terminal size={32} className="text-soy-red" /> SAMPLE OUTPUT
        </h2>
        <div className="bg-black border-4 border-soy-bottle p-8 font-mono text-sm shadow-[12px_12px_0px_#302C26]">
          <pre 
            className="text-[#00FF41] whitespace-pre-wrap leading-relaxed" 
            dangerouslySetInnerHTML={{ __html: `┏ OpenSoyce v1.0.0
┃ Scanning 5 dependencies...
┃
┃ react             10.0  ↑ <span class="text-emerald-500">FRESH</span>    <span class="opacity-60">MIT</span>
┃ express            8.2  → <span class="text-amber-500">AGING</span>    <span class="opacity-60">MIT</span>  
┃ lodash             6.1  ↓ <span class="text-soy-red font-bold">STALE</span>    <span class="opacity-60">MIT</span>  <span class="bg-soy-red text-white px-1 font-bold">⚠ SCORE DROP</span>
┃ axios              9.4  ↑ <span class="text-emerald-500">FRESH</span>    <span class="opacity-60">MIT</span>
┃ moment             4.2  ↓ <span class="text-soy-red font-bold">STALE</span>    <span class="opacity-60">MIT</span>  <span class="bg-soy-red text-white px-1 font-bold">⚠ DEPRECATED</span>
┃
┃ OVERALL STACK SCORE: <span class="text-emerald-500 font-bold">7.6 / 10.0</span>
┗ <span class="bg-emerald-500 text-black px-2 font-black italic">PASS</span> (threshold: 7.0)`}}
          />
          <div className="mt-8 pt-4 border-t border-white/10 text-[10px] uppercase font-bold text-white/40 italic flex justify-between">
            <span>Visual representation of terminal output</span>
            <span className="animate-pulse">_ EXECUTION_COMPLETE</span>
          </div>
        </div>
      </section>

      {/* CI Integration */}
      <section className="mb-24">
        <h2 className="text-3xl font-black uppercase italic mb-8">CI INTEGRATION EXAMPLES</h2>
        <div className="flex border-b-4 border-soy-bottle mb-8 overflow-x-auto">
          {['github', 'npm', 'hooks'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-3 text-sm font-black uppercase italic tracking-widest transition-colors ${
                activeTab === tab ? 'bg-soy-bottle text-soy-label' : 'bg-transparent hover:bg-soy-label'
              }`}
            >
              {tab === 'github' ? 'GitHub Actions' : tab === 'npm' ? 'npm Scripts' : 'Pre-commit'}
            </button>
          ))}
        </div>

        <div className="min-h-[150px]">
          {activeTab === 'github' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <CodeBlock 
                label=".github/workflows/soyce.yml"
                code={`- name: Check dependency health
  run: npx soyce check --fail-below 7.0`} 
              />
            </motion.div>
          )}
          {activeTab === 'npm' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <CodeBlock 
                label="package.json"
                code={`"scripts": {
  "soyce": "npx soyce check"
}`} 
              />
            </motion.div>
          )}
          {activeTab === 'hooks' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <CodeBlock 
                label=".pre-commit"
                code={`npx soyce check --fail-below 6.0`} 
              />
            </motion.div>
          )}
        </div>
      </section>

      {/* Badge Section */}
      <section className="mb-24">
        <div className="bg-white border-4 border-soy-bottle p-12 shadow-[12px_12px_0px_#E63322]">
          <h2 className="text-4xl font-black uppercase italic mb-8">ADD A BADGE TO YOUR README</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <p className="text-lg font-bold opacity-60 uppercase tracking-widest italic">
                Display your project's nutritional health directly in your repository.
              </p>
              <CodeBlock 
                label="Markdown Snippet"
                code="[![OpenSoyce Score](https://opensoyce.io/badge/owner/repo.svg)](https://opensoyce.io/projects/owner/repo)" 
              />
            </div>
            <div className="bg-soy-label p-8 border-4 border-dashed border-soy-bottle/20 flex flex-col items-center justify-center text-center">
              <span className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-4">Preview</span>
              <div className="inline-flex items-stretch border-2 border-soy-bottle shadow-[4px_4px_0px_#000]">
                <div className="bg-soy-bottle text-white px-3 py-1 text-[10px] font-black uppercase flex items-center">OpenSoyce Score</div>
                <div className="bg-soy-red text-white px-3 py-1 text-[10px] font-black italic flex items-center">9.8 / 10</div>
              </div>
              <p className="mt-4 text-xs font-bold italic opacity-40 italic">Updates live with your repository metadata.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-soy-bottle text-soy-label"><ShieldCheck /></div>
          <div className="text-[10px] font-black uppercase tracking-widest">Enterprise Validated</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-soy-bottle text-soy-label"><Zap /></div>
          <div className="text-[10px] font-black uppercase tracking-widest">Zero Configuration</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-soy-bottle text-soy-label"><Globe /></div>
          <div className="text-[10px] font-black uppercase tracking-widest">Universal Node Support</div>
        </div>
      </div>
    </div>
  );
}
