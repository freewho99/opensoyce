import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useProjects } from '../context/ProjectContext';
import { ArrowLeft, GitFork, Save, FlaskConical as Sauce, Terminal, BrainCircuit } from 'lucide-react';
import { motion } from 'motion/react';
import NutritionLabel from '../components/NutritionLabel';

export default function ForkProject() {
  const { owner, repo } = useParams();
  const navigate = useNavigate();
  const { getProject, forkProject } = useProjects();
  
  const originalProject = getProject(owner || '', repo || '');
  
  const [name, setName] = useState('');
  const [techStack, setTechStack] = useState<string[]>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [recipeTitle, setRecipeTitle] = useState('');
  const [recipeDesc, setRecipeDesc] = useState('');
  const [recipeOutcome, setRecipeOutcome] = useState('');

  useEffect(() => {
    if (originalProject) {
      setName(`${originalProject.name}-adapted`);
      setTechStack(originalProject.techStack);
      setRecipeTitle(`Adapted: ${originalProject.name} Solution`);
      setRecipeDesc(`A custom adaptation of ${originalProject.name} for a specific use case.`);
    }
  }, [originalProject]);

  if (!originalProject) {
    return <div className="p-20 text-center uppercase italic font-bold">Project not found for seasoning.</div>;
  }

  const handleAddIngredient = () => {
    if (newIngredient && !techStack.includes(newIngredient)) {
      setTechStack([...techStack, newIngredient]);
      setNewIngredient('');
    }
  };

  const handleRemoveIngredient = (ing: string) => {
    setTechStack(techStack.filter(i => i !== ing));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    forkProject(originalProject.id, {
      name,
      owner: 'current-user', // Mock user
      techStack: techStack
    }, {
      title: recipeTitle,
      description: recipeDesc,
      ingredients: techStack,
      outcome: recipeOutcome
    });
    
    navigate(`/projects/current-user/${name}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <Link to={`/projects/${owner}/${repo}`} className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest mb-8 hover:text-soy-red transition-all">
        <ArrowLeft size={16} /> Cancel and Back to Project
      </Link>

      <div className="flex flex-col lg:flex-row gap-12">
        <div className="lg:col-span-8 flex-1">
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-4">
               <div className="bg-soy-red p-2 rotate-12">
                <GitFork size={32} className="text-white" />
              </div>
              <h1 className="text-5xl font-bold uppercase italic tracking-tighter">Fork & Adapt</h1>
            </div>
            <p className="text-xl font-medium opacity-60">Repurpose the infrastructure. Change the ingredients. Save your recipe.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-10">
             {/* Basic Info */}
             <div className="space-y-4">
              <label className="block text-xs font-bold uppercase tracking-widest opacity-40">Adaptation Name</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white border-4 border-soy-bottle p-6 font-bold text-2xl uppercase italic outline-none focus:ring-4 focus:ring-soy-red transition-all"
                placeholder="PROD-READY-FORK"
                required
              />
              <p className="text-[10px] uppercase font-bold opacity-40">Original: {originalProject.owner}/{originalProject.name}</p>
            </div>

            {/* Ingredients / Tech Stack */}
            <div className="space-y-6">
              <h3 className="text-xs font-bold uppercase tracking-[0.3em] opacity-40 flex items-center gap-2">
                <Terminal size={14} /> Modify Ingredients (Tech Stack)
              </h3>
              <div className="flex flex-wrap gap-3 mb-4">
                {techStack.map(tech => (
                  <button 
                    key={tech} 
                    type="button"
                    onClick={() => handleRemoveIngredient(tech)}
                    className="bg-white border-2 border-soy-bottle px-4 py-2 font-mono text-sm font-bold flex items-center gap-2 hover:bg-soy-red hover:text-white transition-all group"
                  >
                    {tech} <span className="opacity-0 group-hover:opacity-100 italic text-[10px]">Remove</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newIngredient}
                  onChange={(e) => setNewIngredient(e.target.value)}
                  className="flex-1 bg-white border-2 border-soy-bottle p-3 font-mono font-bold outline-none"
                  placeholder="Add new ingredient (e.g. Tailwind, Node.js)"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddIngredient())}
                />
                <button 
                  type="button" 
                  onClick={handleAddIngredient}
                  className="bg-soy-bottle text-soy-label px-6 font-bold uppercase tracking-widest hover:bg-soy-red transition-all"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Recipe Outcome */}
            <div className="space-y-6 bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#302C26]">
               <div className="flex items-center gap-2 mb-2">
                <Sauce className="text-soy-red" size={24} />
                <h3 className="text-lg font-bold uppercase italic tracking-tighter">Your Secret Sauce</h3>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1 opacity-40">Recipe Title</label>
                  <input 
                    type="text" 
                    value={recipeTitle}
                    onChange={(e) => setRecipeTitle(e.target.value)}
                    className="w-full border-b-2 border-soy-bottle bg-transparent p-2 font-bold focus:border-soy-red outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase mb-1 opacity-40">Intended Outcome</label>
                  <textarea 
                    value={recipeOutcome}
                    onChange={(e) => setRecipeOutcome(e.target.value)}
                    className="w-full border-b-2 border-soy-bottle bg-transparent p-2 font-medium focus:border-soy-red outline-none resize-none"
                    rows={2}
                    placeholder="e.g. A multi-agent system that reviews code and creates structured feedback."
                  />
                </div>
              </div>
            </div>

            <div className="pt-6">
              <button 
                type="submit"
                className="w-full bg-soy-red text-white py-6 text-2xl font-bold uppercase tracking-[0.2em] italic flex items-center justify-center gap-4 hover:bg-soy-bottle transition-all shadow-[10px_10px_0px_#EBE6D9,10px_10px_0px_2px_#302C26]"
              >
                Save Adaptation <Save />
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview / Nutrition Label */}
        <div className="lg:col-span-4 flex flex-col items-center gap-8">
           <div className="sticky top-24">
             <div className="mb-4 text-center">
               <span className="text-[10px] font-bold uppercase tracking-[0.3em] opacity-40">Live Label Preview</span>
             </div>
             <NutritionLabel project={{
               ...originalProject,
               name: name || originalProject.name,
               techStack: techStack,
               owner: 'current-user',
               status: 'Unverified'
             }} />
             
             <div className="mt-8 p-6 bg-amber-50 border-2 border-amber-200 text-amber-800 text-sm font-medium italic">
               "Adapting infrastructure is like moving from a React kitchen to an Angular pantry. Same heat, different spices." - Chef Soycie
             </div>
           </div>
        </div>
      </div>
    </div>
  );
}
