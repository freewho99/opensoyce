import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles, AlertCircle, CheckCircle, Clock, GitCommit, List, Shield, HelpCircle } from 'lucide-react';
import { EvidenceFocus, EvidenceTabKey } from './index';

interface EvidenceViewerProps {
  owner: string;
  repo: string;
  activeFocus: EvidenceFocus;
  setFocus: (focus: EvidenceFocus) => void;
  onActionTrigger: (action: string) => void;
}

export default function EvidenceViewer({
  owner,
  repo,
  activeFocus,
  setFocus,
  onActionTrigger,
}: EvidenceViewerProps) {
  const [readmeContent, setReadmeContent] = useState('');
  const [loadingReadme, setLoadingReadme] = useState(false);  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch real README from GitHub API
  useEffect(() => {
    setReadmeContent('');
      setLoadingReadme(true);
      fetch(`https://api.github.com/repos/${owner}/${repo}/readme`)
        .then((res) => {
          if (!res.ok) throw new Error('No README found on GitHub');
          return res.json();
        })
        .then((data) => {
          if (data.content && data.encoding === 'base64') {
            const decoded = decodeBase64(data.content);
            setReadmeContent(decoded);
          } else {
            setReadmeContent(data.content || '');
          }
        })
        .catch((err) => {
          console.error(err);
          setReadmeContent(
            `# ${repo}\n\nFailed to fetch live README from GitHub API.\n\nDescription: Open-source project by ${owner}.\nTopics: No topics found.\n`
          );
        })
        .finally(() => {
          setLoadingReadme(false);
        });
  },[owner, repo]);

  const decodeBase64 = (str: string) => {
      const clean = str.replace(/\s/g, '');
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return atob(str.replace(/\s/g, ''));
    }
  };

  const [selectedTemplate, setSelectedTemplate] = useState<'dependabot' | 'codeql'>('dependabot');
  const [copied, setCopied] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (activeFocus.tab === 'templates' && activeFocus.reason) {
      const reasonLower = activeFocus.reason.toLowerCase();
      if (reasonLower.includes('dependabot')) {
        setSelectedTemplate('dependabot');
      } else if (reasonLower.includes('sast') || reasonLower.includes('codeql')) {
        setSelectedTemplate('codeql');
      }
    }
  }, [activeFocus.tab, activeFocus.reason]);

  const tabs: { key: EvidenceTabKey; name: string }[] = [
    { key: 'readme', name: 'README' },
    { key: 'package', name: 'PACKAGE' },
    { key: 'license', name: 'LICENSE' },
    { key: 'security', name: 'SECURITY' },
    { key: 'commits', name: 'COMMITS' },
    { key: 'dependencies', name: 'DEPENDENCIES' },
    { key: 'templates', name: 'TEMPLATES' },
  ];

  // Helper mock content
  const packageJson = `{
  "name": "${repo.toLowerCase()}",
  "version": "1.0.0",
  "description": "Open-source project by ${owner}",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "test": "jest",
    "build": "tsc"
  },
  "dependencies": {
    "lodash": "^4.17.21",
    "axios": "^1.6.0",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "typescript": "^5.2.2"
  }
}`;

  const licenseContent = `MIT License

Copyright (c) 2026 ${owner}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

  const securityContent = `# Security Policy

## Supported Versions

The following versions of this project are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you find a security bug, please email us directly or submit an advisory report. 
We will investigate immediately and coordinate patches within 48 hours.`;

  const commits = [
    { hash: 'e28a9b1', msg: 'chore: configure automated github security scanner actions', date: '3 hours ago', author: 'dependabot[bot]' },
    { hash: '18bf8d4', msg: 'feat: wire up CodeQL static source analysis pipeline', date: '1 day ago', author: `${owner}` },
    { hash: 'dfb839c', msg: 'docs: update contribution instructions for setup', date: '4 days ago', author: 'co-developer' },
    { hash: '4f2910a', msg: 'fix: address critical memory leaks inside main loops', date: '1 week ago', author: `${owner}` },
    { hash: 'a12bc8f', msg: 'release: publish version 1.1.0 stable updates', date: '2 weeks ago', author: `${owner}` },
  ];

  const dependencies = [
    { name: 'lodash', version: '^4.17.21', status: 'SECURE', vulnerability: 'None', maintainers: 8 },
    { name: 'axios', version: '^1.6.0', status: 'SECURE', vulnerability: 'None', maintainers: 4 },
    { name: 'uuid', version: '^9.0.1', status: 'OUTDATED', vulnerability: '1 Low Severity CVE', maintainers: 3 },
    { name: 'typescript', version: '^5.2.2', status: 'SECURE', vulnerability: 'None', maintainers: 42 },
  ];

  const currentTab = activeFocus.tab;

  const renderActiveContent = () => {
    if (currentTab === 'readme') {
      if (loadingReadme) {
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-12">
            <Loader2 className="animate-spin text-soy-red mb-2" size={24} />
            <span className="text-[10px] font-black uppercase tracking-widest text-soy-label/60">Fetching README...</span>
          </div>
        );
      }
      return (
        <div className="flex-1 flex overflow-hidden">
          <div className="py-4 pl-3 pr-2 text-right select-none text-soy-label/15 bg-[#17130f] border-r border-[#3a3028] min-w-[36px]">
            {readmeContent.split('\n').map((_, i) => (
              <div key={i} className="leading-5 h-5 text-[10px]">{i + 1}</div>
            ))}
          </div>
          <div className="flex-1 p-4 overflow-y-auto text-[11px] leading-5 text-soy-label/80 font-mono whitespace-pre-wrap select-text custom-scrollbar">
            {readmeContent}
          </div>
        </div>
      );
    }

    if (currentTab === 'package') {
      return (
        <div className="flex-1 flex overflow-hidden">
          <div className="py-4 pl-3 pr-2 text-right select-none text-soy-label/15 bg-[#17130f] border-r border-[#3a3028] min-w-[36px]">
            {packageJson.split('\n').map((_, i) => (
              <div key={i} className="leading-5 h-5 text-[10px]">{i + 1}</div>
            ))}
          </div>
          <div className="flex-1 p-4 overflow-y-auto text-[11px] leading-5 text-soy-label/80 font-mono whitespace-pre-wrap select-text custom-scrollbar">
            {packageJson}
          </div>
        </div>
      );
    }

    if (currentTab === 'license') {
      return (
        <div className="flex-1 flex overflow-hidden">
          <div className="py-4 pl-3 pr-2 text-right select-none text-soy-label/15 bg-[#17130f] border-r border-[#3a3028] min-w-[36px]">
            {licenseContent.split('\n').map((_, i) => (
              <div key={i} className="leading-5 h-5 text-[10px]">{i + 1}</div>
            ))}
          </div>
          <div className="flex-1 p-4 overflow-y-auto text-[11px] leading-5 text-soy-label/80 font-mono whitespace-pre-wrap select-text custom-scrollbar">
            {licenseContent}
          </div>
        </div>
      );
    }

    if (currentTab === 'security') {
      return (
        <div className="flex-1 flex overflow-hidden">
          <div className="py-4 pl-3 pr-2 text-right select-none text-soy-label/15 bg-[#17130f] border-r border-[#3a3028] min-w-[36px]">
            {securityContent.split('\n').map((_, i) => (
              <div key={i} className="leading-5 h-5 text-[10px]">{i + 1}</div>
            ))}
          </div>
          <div className="flex-1 p-4 overflow-y-auto text-[11px] leading-5 text-soy-label/80 font-mono whitespace-pre-wrap select-text custom-scrollbar">
            {securityContent}
          </div>
        </div>
      );
    }

    if (currentTab === 'commits') {
      return (
        <div className="flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar">
          {commits.map((commit, index) => (
            <div key={commit.hash} className="bg-[#100d0b] p-3 border border-[#3a3028] rounded flex items-start gap-3">
              <div className="bg-soy-red/10 p-1.5 border border-soy-red/20 rounded mt-0.5">
                <GitCommit size={14} className="text-soy-red" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase text-soy-red tracking-wider">{commit.hash}</span>
                  <span className="text-[9px] opacity-40">by {commit.author}</span>
                  <span className="text-[9px] opacity-40 ml-auto">{commit.date}</span>
                </div>
                <p className="text-[10px] text-soy-label/70 font-mono font-bold leading-tight">{commit.msg}</p>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (currentTab === 'dependencies') {
      return (
        <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
          <div className="w-full border border-[#3a3028] bg-[#100d0b] rounded overflow-hidden">
            <table className="w-full text-left text-[10px]">
              <thead>
                <tr className="bg-[#17130f] border-b border-[#3a3028]">
                  <th className="p-2 font-bold uppercase tracking-wider text-soy-label/40">NAME</th>
                  <th className="p-2 font-bold uppercase tracking-wider text-soy-label/40">VERSION</th>
                  <th className="p-2 font-bold uppercase tracking-wider text-soy-label/40">STATUS</th>
                  <th className="p-2 font-bold uppercase tracking-wider text-soy-label/40">MAINTAINERS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#3a3028]">
                {dependencies.map((dep) => (
                  <tr key={dep.name} className="hover:bg-white/5">
                    <td className="p-2 font-bold text-soy-label/80">{dep.name}</td>
                    <td className="p-2 font-mono text-soy-label/60">{dep.version}</td>
                    <td className="p-2">
                      <span className={`px-1.5 py-0.5 rounded font-black text-[8px] ${
                        dep.status === 'SECURE' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
                      }`}>
                        {dep.status}
                      </span>
                    </td>
                    <td className="p-2 text-soy-label/50">{dep.maintainers} core</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    if (currentTab === 'templates') {
      const dependabotCode = `version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"`;

      const codeqlCode = `name: "CodeQL Analysis"

on:
  push:
    branches: [ "main" ]
  pull_request:
    branches: [ "main" ]

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Initialize CodeQL
      uses: github/codeql-action/init@v3
      with:
        languages: javascript

    - name: Perform CodeQL Analysis
      uses: github/codeql-action/analyze@v3`;

      const activeCode = selectedTemplate === 'dependabot' ? dependabotCode : codeqlCode;
      const fileName = selectedTemplate === 'dependabot' ? '.github/dependabot.yml' : '.github/workflows/codeql.yml';

      return (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Sub-tabs to choose between templates */}
          <div className="flex bg-[#100d0b]/80 border-b border-[#3a3028] px-4 py-2 gap-2">
            <button
              onClick={() => setSelectedTemplate('dependabot')}
              className={`px-3 py-1 text-[10px] font-black uppercase rounded-sm border cursor-pointer transition-all ${
                selectedTemplate === 'dependabot'
                  ? 'bg-soy-red text-white border-soy-red'
                  : 'bg-[#17130f] text-soy-label/60 border-[#3a3028] hover:text-white'
              }`}
            >
              dependabot.yml
            </button>
            <button
              onClick={() => setSelectedTemplate('codeql')}
              className={`px-3 py-1 text-[10px] font-black uppercase rounded-sm border cursor-pointer transition-all ${
                selectedTemplate === 'codeql'
                  ? 'bg-soy-red text-white border-soy-red'
                  : 'bg-[#17130f] text-soy-label/60 border-[#3a3028] hover:text-white'
              }`}
            >
              codeql.yml
            </button>
            
            <button
              onClick={() => handleCopy(activeCode)}
              className="ml-auto px-3 py-1 bg-[#100d0b] text-white border border-[#3a3028] text-[9px] font-black uppercase tracking-wider rounded-sm hover:bg-[#efe8dc]/10 cursor-pointer transition-all flex items-center gap-1.5"
            >
              {copied ? 'Copied ✓' : 'Copy Template'}
            </button>
          </div>

          <div className="flex-1 flex overflow-hidden">
            <div className="py-4 pl-3 pr-2 text-right select-none text-soy-label/15 bg-[#17130f] border-r border-[#3a3028] min-w-[36px]">
              {activeCode.split('\n').map((_, i) => (
                <div key={i} className="leading-5 h-5 text-[10px]">{i + 1}</div>
              ))}
            </div>
            <div className="flex-1 p-4 overflow-y-auto text-[11px] leading-5 text-soy-label/80 font-mono whitespace-pre-wrap select-text custom-scrollbar bg-[#17130f]/30">
              <div className="text-[9px] opacity-40 mb-2 border-b border-[#3a3028] pb-1 uppercase tracking-wider">
                Target Path: {fileName}
              </div>
              {activeCode}
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col h-full bg-[#1b1916] text-soy-label border-r border-[#3a3028] overflow-hidden">
      {/* Evidence Viewer Tabs */}
      <div className="flex bg-[#100d0b] border-b border-[#3a3028] overflow-x-auto select-none custom-scrollbar min-h-[38px]">
        {tabs.map((t) => {
          const isActive = t.key === currentTab;
          return (
            <button
              key={t.key}
              onClick={() => setFocus({ tab: t.key, source: 'file', reason: `Inspecting evidence: ${t.name}` })}
              className={`flex items-center gap-1.5 px-4 py-2.5 border-r border-[#3a3028] text-[10px] font-black tracking-widest uppercase transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#1b1916] text-soy-red border-b-2 border-b-soy-red'
                  : 'text-soy-label/40 hover:bg-white/5'
              }`}
            >
              <FileText size={11} className={isActive ? 'text-soy-red' : 'opacity-40'} />
              <span>{t.name}</span>
            </button>
          );
        })}
      </div>

      {/* Focus Alert Banner */}
      {activeFocus.reason && (
        <div className="bg-[#ef3025]/10 border-b border-[#ef3025]/30 px-4 py-2 flex items-start gap-2 select-none animate-fadeIn">
          <Sparkles size={13} className="text-soy-red shrink-0 mt-0.5 animate-pulse" />
          <div className="text-[9px] font-mono leading-tight">
            <span className="text-soy-red font-black uppercase tracking-wider mr-1.5">Evidence Focus ({activeFocus.source}):</span>
            <span className="text-soy-label/70">{activeFocus.reason}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {renderActiveContent()}

        {/* Action Buttons overlay inside README */}
        {currentTab === 'readme' && !loadingReadme && (
          <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#100d0b]/95 p-1 border border-[#3a3028] shadow-[2px_2px_0px_#000] z-10 select-none">
            <div className="flex items-center gap-1 px-1.5 text-[8px] font-black uppercase tracking-widest text-soy-label/40 border-r border-[#3a3028]">
              <Sparkles size={10} className="text-soy-red" />
              <span>Patches</span>
            </div>
            <button
              onClick={() => onActionTrigger('badge')}
              className="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-soy-red hover:bg-soy-red/80 text-white transition-all cursor-pointer rounded-sm"
            >
              + Add Badge
            </button>
            <button
              onClick={() => onActionTrigger('dependabot')}
              className="px-2 py-0.5 text-[8px] font-black uppercase tracking-wider bg-[#17130f] hover:bg-soy-red hover:text-white text-soy-label transition-all cursor-pointer rounded-sm"
            >
              🛡️ Setup Dependabot
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
