import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Github, Loader2, Check, AlertCircle, ShieldCheck, ArrowRight, ArrowLeft, ClipboardList, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { trackEvent } from '../utils/analytics';
import NutritionLabel from '../components/NutritionLabel';
import { Project } from '../types';
import { useAuth } from '../context/AuthContext';

type Question = {
  id: number;
  text: string;
  options: { label: string; value: string; points: number; isHonestBad?: boolean }[];
};

const QUESTIONS: Question[] = [
  {
    id: 1,
    text: "How often do you merge pull requests?",
    options: [
      { label: "DAILY", value: "daily", points: 1.0 },
      { label: "WEEKLY", value: "weekly", points: 0.8 },
      { label: "MONTHLY", value: "monthly", points: 0.4 },
      { label: "RARELY", value: "rarely", points: 0.1, isHonestBad: true }
    ]
  },
  {
    id: 2,
    text: "Do you have a SECURITY.md or vulnerability disclosure policy?",
    options: [
      { label: "YES", value: "yes", points: 1.0 },
      { label: "NO", value: "no", points: 0.0, isHonestBad: true },
      { label: "IN PROGRESS", value: "in-progress", points: 0.5 }
    ]
  },
  {
    id: 3,
    text: "What is your average issue response time?",
    options: [
      { label: "UNDER 24H", value: "under-24h", points: 1.0 },
      { label: "1-3 DAYS", value: "1-3d", points: 0.7 },
      { label: "1 WEEK+", value: "1w+", points: 0.3 },
      { label: "I DON'T TRACK IT", value: "no-track", points: 0.0, isHonestBad: true }
    ]
  },
  {
    id: 4,
    text: "Do you enforce semantic versioning (semver)?",
    options: [
      { label: "STRICTLY", value: "strictly", points: 1.0 },
      { label: "LOOSELY", value: "loosely", points: 0.6 },
      { label: "NO", value: "no", points: 0.0, isHonestBad: true }
    ]
  },
  {
    id: 5,
    text: "Is there a CHANGELOG or release notes for every version?",
    options: [
      { label: "YES, ALWAYS", value: "yes", points: 1.0 },
      { label: "SOMETIMES", value: "sometimes", points: 0.5 },
      { label: "NO", value: "no", points: 0.0, isHonestBad: true }
    ]
  },
  {
    id: 6,
    text: "Do you have automated tests with >60% coverage?",
    options: [
      { label: "YES", value: "yes", points: 1.0 },
      { label: "NO", value: "no", points: 0.0, isHonestBad: true },
      { label: "PARTIAL", value: "partial", points: 0.6 }
    ]
  },
  {
    id: 7,
    text: "Is your project's license clearly stated in the root?",
    options: [
      { label: "YES", value: "yes", points: 1.0 },
      { label: "NO", value: "no", points: 0.0, isHonestBad: true }
    ]
  },
  {
    id: 8,
    text: "Do you have a CODE_OF_CONDUCT.md?",
    options: [
      { label: "YES", value: "yes", points: 1.0 },
      { label: "NO", value: "no", points: 0.0, isHonestBad: true },
      { label: "DRAFTING ONE", value: "drafting", points: 0.4 }
    ]
  },
  {
    id: 9,
    text: "How many active maintainers does this project have?",
    options: [
      { label: "JUST ME", value: "me", points: 0.3, isHonestBad: true },
      { label: "2-3", value: "2-3", points: 0.8 },
      { label: "4+", value: "4+", points: 1.0 },
      { label: "IT VARIES", value: "varies", points: 0.5 }
    ]
  },
  {
    id: 10,
    text: "Would you describe this project as production-ready?",
    options: [
      { label: "YES, BATTLE-TESTED", value: "yes", points: 1.0 },
      { label: "MOSTLY", value: "mostly", points: 0.7 },
      { label: "BETA", value: "beta", points: 0.4 },
      { label: "EXPERIMENTAL", value: "experimental", points: 0.2, isHonestBad: true }
    ]
  }
];

export default function Claim() {
  const { user, isLoggedIn, login, isLoading: isAuthLoading } = useAuth();
  
  useEffect(() => {
    trackEvent('page_view', { page: '/claim' });
  }, []);
  
  const [step, setStep] = useState(0); // 0: Auth, 1: Select Repo, 2: Questionnaire, 3: Score, 4: Confirmed
  const [selectedRepo, setSelectedRepo] = useState('');
  const [manualOwner, setManualOwner] = useState('');
  const [manualRepo, setManualRepo] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [auditScore, setAuditScore] = useState(0);
  const [isTransparent, setIsTransparent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [repoData, setRepoData] = useState<Project | null>(null);

  // Sync step with login state
  useEffect(() => {
    if (isLoggedIn && step === 0) setStep(1);
    if (!isLoggedIn && step !== 0) setStep(0);
  }, [isLoggedIn, step]);

  const handleSelectRepo = async () => {
    const fullRepo = selectedRepo || `${manualOwner}/${manualRepo}`;
    if (!fullRepo || !fullRepo.includes('/')) return;

    setLoading(true);
    try {
      const [owner, repo] = fullRepo.split('/');
      const res = await fetch(`/api/github/${owner}/${repo}`);
      if (res.ok) {
        const data = await res.json();
        setRepoData(data);
      }
      setStep(2);
    } catch (err) {
      setStep(2); // Fallback even if repo data fails
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionId: number, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  };

  const calculateResults = () => {
    let totalPoints = 0;
    let honestBadCount = 0;

    QUESTIONS.forEach(q => {
      const answerValue = answers[q.id];
      const option = q.options.find(o => o.value === answerValue);
      if (option) {
        totalPoints += option.points;
        if (option.isHonestBad) honestBadCount++;
      }
    });

    setAuditScore(totalPoints); // totalPoints is 0-10 since max points per Q is 1.0 and 10 Qs
    setIsTransparent(honestBadCount >= 3);
    setStep(3);
  };

  const finalizeClaim = () => {
    const repo = selectedRepo || `${manualOwner}/${manualRepo}`;
    trackEvent('badge_claim_click', { repo, score: auditScore, transparent: isTransparent });
    
    const claims = JSON.parse(localStorage.getItem('soyce_claims') || '[]');
    const newClaim = {
      repo,
      score: auditScore,
      transparent: isTransparent,
      date: new Date().toISOString()
    };
    localStorage.setItem('soyce_claims', JSON.stringify([...claims, newClaim]));
    setStep(4);
  };

  const currentQuestion = QUESTIONS[currentQuestionIndex];

  return (
    <div className="max-w-4xl mx-auto px-4 py-20 min-h-[80vh]">
      <AnimatePresence mode="wait">
        {/* Step 0: Auth Gate */}
        {step === 0 && (
          <motion.div 
            key="step0"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex flex-col items-center text-center py-20"
          >
            <div className="bg-soy-red text-white p-6 rotate-3 mb-8 shadow-[8px_8px_0px_#000]">
              <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter">YOU NEED TO VERIFY YOUR IDENTITY FIRST.</h2>
            </div>
            <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-12 max-w-xl">
              Maintainer credentials are required to audit projects. We use GitHub OAuth for secure identity verification.
            </p>
            <button 
              onClick={() => login()}
              disabled={isAuthLoading}
              className="group relative bg-soy-red text-white px-12 py-6 text-2xl font-black uppercase italic shadow-[8px_8px_0px_#000] hover:translate-x-1 hover:-translate-y-1 transition-transform disabled:opacity-50"
            >
              <div className="flex items-center gap-4">
                <Github size={32} />
                {isAuthLoading ? 'CONNECTING TO GITHUB...' : 'SIGN IN WITH GITHUB →'}
              </div>
            </button>
          </motion.div>
        )}

        {/* Step 1: Select Repo */}
        {step === 1 && user && (
          <motion.div 
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-4">WELCOME, {user.name.toUpperCase()}.</h2>
            <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-12">Select the repository you want to claim.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
              {user.repos.map(repo => (
                <button 
                  key={repo}
                  onClick={() => setSelectedRepo(repo)}
                  className={`p-6 border-4 text-left transition-colors flex justify-between items-center ${
                    selectedRepo === repo ? 'bg-soy-red text-white border-soy-bottle shadow-[4px_4px_0px_#000]' : 'bg-white border-soy-bottle hover:bg-soy-label'
                  }`}
                >
                  <span className="font-black uppercase italic tracking-tight">{repo}</span>
                  <div className={`w-6 h-6 border-2 border-current rounded-none flex items-center justify-center`}>
                    {selectedRepo === repo && <Check size={16} strokeWidth={4} />}
                  </div>
                </button>
              ))}
            </div>

            <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26] mb-12">
              <h3 className="text-sm font-black uppercase tracking-widest mb-6 opacity-40 italic">OR ENTER REPO MANUALLY</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <input 
                  type="text"
                  placeholder="OWNER"
                  value={manualOwner}
                  onChange={(e) => { setManualOwner(e.target.value); setSelectedRepo(''); }}
                  className="bg-soy-label/20 border-2 border-soy-bottle p-4 font-black italic outline-none focus:ring-2 focus:ring-soy-red"
                />
                <input 
                  type="text"
                  placeholder="REPO"
                  value={manualRepo}
                  onChange={(e) => { setManualRepo(e.target.value); setSelectedRepo(''); }}
                  className="bg-soy-label/20 border-2 border-soy-bottle p-4 font-black italic outline-none focus:ring-2 focus:ring-soy-red"
                />
              </div>
            </div>

            <button 
              onClick={handleSelectRepo}
              disabled={(!selectedRepo && (!manualOwner || !manualRepo)) || loading}
              className="w-full bg-soy-bottle text-soy-label py-6 text-2xl font-black uppercase tracking-widest hover:bg-soy-red transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : 'CONTINUE →'}
            </button>
          </motion.div>
        )}

        {/* Step 2: Questionnaire */}
        {step === 2 && (
          <motion.div 
            key="step2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-white border-4 border-soy-bottle shadow-[12px_12px_0px_#000] overflow-hidden"
          >
            {/* Progress Bar */}
            <div className="h-2 bg-soy-label w-full">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${((currentQuestionIndex + 1) / QUESTIONS.length) * 100}%` }}
                className="h-full bg-soy-red"
              />
            </div>

            <div className="p-8 md:p-12">
              <div className="flex justify-between items-center mb-8">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-soy-red">SAUCE AUDIT</span>
                <span className="text-xs font-black uppercase tracking-widest opacity-40">QUESTION {currentQuestionIndex + 1} OF {QUESTIONS.length}</span>
              </div>

              <h2 className="text-3xl md:text-5xl font-black uppercase italic tracking-tighter leading-tight mb-12">
                {currentQuestion.text}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                {currentQuestion.options.map(opt => (
                  <button 
                    key={opt.value}
                    onClick={() => handleAnswer(currentQuestion.id, opt.value)}
                    className={`p-8 border-2 text-left transition-all ${
                      answers[currentQuestion.id] === opt.value 
                        ? 'bg-soy-red text-white border-soy-bottle shadow-[4px_4px_0px_#000]' 
                        : 'bg-white border-soy-bottle hover:bg-soy-label'
                    } group`}
                  >
                    <span className="text-2xl font-black uppercase italic tracking-tight block group-hover:translate-x-2 transition-transform">
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>

              <div className="flex justify-between gap-4">
                <button 
                  onClick={() => currentQuestionIndex > 0 && setCurrentQuestionIndex(prev => prev - 1)}
                  disabled={currentQuestionIndex === 0}
                  className="flex items-center gap-2 font-black uppercase tracking-widest disabled:opacity-20 hover:text-soy-red transition-colors"
                >
                  <ArrowLeft size={16} strokeWidth={3} /> BACK
                </button>
                
                {currentQuestionIndex === QUESTIONS.length - 1 ? (
                  <button 
                    onClick={calculateResults}
                    disabled={!answers[currentQuestion.id]}
                    className="bg-soy-bottle text-soy-label px-12 py-4 text-xl font-black uppercase tracking-widest hover:bg-soy-red transition-colors disabled:opacity-50"
                  >
                    SEE AUDIT RESULTS →
                  </button>
                ) : (
                  <button 
                    onClick={() => setCurrentQuestionIndex(prev => prev + 1)}
                    disabled={!answers[currentQuestion.id]}
                    className="bg-soy-bottle text-soy-label px-12 py-4 text-xl font-black uppercase tracking-widest hover:bg-soy-red transition-colors disabled:opacity-50"
                  >
                    NEXT →
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Score Preview */}
        {step === 3 && (
          <motion.div 
            key="step3"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
          >
            <div className="bg-white border-4 border-soy-bottle p-12 shadow-[12px_12px_0px_#000] text-center">
              <h2 className="text-xl font-black uppercase tracking-[0.3em] mb-4 opacity-40">YOUR SAUCE AUDIT SCORE</h2>
              <div className="flex flex-col items-center gap-4 mb-8">
                <div className="text-9xl font-black italic tracking-tighter text-soy-red">
                  {(auditScore ?? 0).toFixed(1)}
                </div>
                <div className="text-2xl font-black uppercase italic opacity-60">/ 10.0</div>
              </div>

              {isTransparent && (
                <div className="inline-flex items-center gap-2 bg-soy-bottle text-soy-label px-4 py-2 font-black uppercase tracking-widest italic mb-12 shadow-[4px_4px_0px_#E63322]">
                  <ShieldCheck size={20} />
                  TRANSPARENT MAINTAINER
                </div>
              )}

              <p className="text-xl font-bold uppercase tracking-widest opacity-60 mb-12">
                BASED ON YOUR AUDIT RESPONSES, WE HAVE CALCULATED A PUBLIC HEALTH SCORE OF <span className="text-soy-bottle">{(auditScore ?? 0).toFixed(1)}</span>.
              </p>

              <div className="space-y-4 max-w-lg mx-auto mb-12 border-t-2 border-soy-label pt-8">
                <h4 className="text-left text-[10px] font-black uppercase tracking-widest opacity-40">AUDIT SUMMARY</h4>
                {QUESTIONS.map(q => {
                  const opt = q.options.find(o => o.value === answers[q.id]);
                  return (
                    <div key={q.id} className="flex justify-between items-center text-[10px] uppercase font-black">
                      <span className="opacity-60">{q.text}</span>
                      <span className={opt?.points && opt.points > 0.5 ? 'text-emerald-500' : 'text-soy-red'}>
                        {opt?.label} (+{(opt?.points ?? 0).toFixed(1)})
                      </span>
                    </div>
                  );
                })}
              </div>

              <button 
                onClick={finalizeClaim}
                className="w-full bg-soy-red text-white py-6 text-3xl font-black uppercase italic tracking-tighter hover:bg-soy-bottle transition-all shadow-[8px_8px_0px_#000]"
              >
                SUBMIT CLAIM →
              </button>
            </div>
            
            <button 
              onClick={() => { setStep(2); setCurrentQuestionIndex(9); }}
              className="w-full text-center font-black uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
            >
              ← GO BACK AND EDIT ANSWERS
            </button>
          </motion.div>
        )}

        {/* Step 4: Confirmation */}
        {step === 4 && (
          <motion.div 
            key="step4"
            initial={{ opacity: 0, rotate: -2 }}
            animate={{ opacity: 1, rotate: 0 }}
            className="flex flex-col items-center"
          >
            <div className="bg-emerald-500 text-white p-12 shadow-[12px_12px_0px_#000] text-center w-full mb-12">
              <Check size={80} className="mx-auto mb-8" strokeWidth={4} />
              <h2 className="text-6xl md:text-8xl font-black uppercase italic tracking-tighter mb-4 leading-none">REPO CLAIMED.</h2>
              <p className="text-2xl font-black uppercase tracking-widest italic opacity-80">VERIFICATION PENDING.</p>
            </div>

            <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000] w-full max-w-2xl text-center space-y-10">
              <div className="flex justify-center gap-4">
                 <div className="inline-flex items-stretch border-2 border-soy-bottle shadow-[4px_4px_0px_#000]">
                  <div className="bg-soy-bottle text-white px-3 py-1 text-[10px] font-black uppercase flex items-center">OpenSoyce Score</div>
                  <div className="bg-soy-red text-white px-3 py-1 text-[10px] font-black italic flex items-center">{(auditScore ?? 0).toFixed(1)} / 10</div>
                </div>
              </div>

              <div>
                <p className="text-sm font-black uppercase tracking-widest leading-relaxed mb-8">
                  YOUR DASHBOARD IS READY. START TRACKING YOUR SOYCE SCORE.
                </p>
                <div className="flex flex-col gap-4">
                  <Link 
                    to="/dashboard"
                    className="w-full bg-soy-red text-white py-6 text-2xl font-black uppercase italic tracking-tighter hover:bg-black transition-all shadow-[8px_8px_0px_#000]"
                  >
                    GO TO DASHBOARD
                  </Link>
                  <button className="w-full bg-soy-label border-2 border-black py-4 text-[10px] font-black uppercase tracking-widest hover:bg-black hover:text-white transition-all italic">
                    SHARE YOUR STATUS
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t-2 border-soy-label">
                <p className="text-[10px] font-bold uppercase tracking-widest leading-relaxed opacity-40">
                  WE WILL VERIFY YOUR GITHUB OWNERSHIP WITHIN 24 HOURS. <br/>
                  <span className="text-soy-bottle">ADD THE TOPIC <span className="underline italic">opensoyce-verified</span> TO YOUR REPO TO SPEED UP VERIFICATION.</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
