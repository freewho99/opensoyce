import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { blogPosts } from '../data/blogPosts';
import { ArrowRight, MessageSquare } from 'lucide-react';

type StartHereCard = {
  id: string;
  prompt: string;
  readFirstSlug: string;
  thenTryPath: string;
  thenTryLabel: string;
};

const START_HERE_CARDS: StartHereCard[] = [
  {
    id: 'choose-repo',
    prompt: 'I want to decide whether to adopt a specific open-source library.',
    readFirstSlug: 'how-to-read-a-soyce-score',
    thenTryPath: '/lookup',
    thenTryLabel: 'LOOKUP',
  },
  {
    id: 'check-deps',
    prompt: "I want to find known vulnerabilities in my own project.",
    readFirstSlug: 'shadow-dependencies-the-breach-you-never-saw-coming',
    thenTryPath: '/scanner',
    thenTryLabel: 'SCANNER',
  },
  {
    id: 'compare-tools',
    prompt: 'I want to weigh two options before committing.',
    readFirstSlug: 'open-source-licensing-wars-mit-vs-gpl-vs-apache',
    thenTryPath: '/compare',
    thenTryLabel: 'COMPARE',
  },
];

const START_HERE_HEADLINES: Record<string, string> = {
  'choose-repo': 'Choose a repo safely',
  'check-deps': "Check my app's dependencies",
  'compare-tools': 'Compare tools and frameworks',
};

export default function Blog() {
  const [selectedCategory, setSelectedCategory] = React.useState('All');
  const categories = ['All', 'ANALYSIS', 'HOT TAKE', 'DEEP DIVE', 'FRAMEWORK WARS', 'SECURITY', 'PRODUCT'];

  const filteredPosts = selectedCategory === 'All'
    ? blogPosts
    : blogPosts.filter(p => p.category.toUpperCase() === selectedCategory.toUpperCase());

  const featuredPost = filteredPosts[0];
  const otherPosts = filteredPosts.slice(1);

  // Resolve each Start Here card's article at render time. Skip silently if not found.
  const resolvedStartHereCards = START_HERE_CARDS
    .map(card => {
      const post = blogPosts.find(p => p.slug === card.readFirstSlug);
      return post ? { card, post } : null;
    })
    .filter((entry): entry is { card: StartHereCard; post: typeof blogPosts[number] } => entry !== null);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ANALYSIS': return 'bg-black text-white';
      case 'HOT TAKE': return 'bg-soy-red text-white';
      case 'DEEP DIVE': return 'bg-gray-800 text-white';
      case 'FRAMEWORK WARS': return 'bg-blue-600 text-white';
      case 'SECURITY': return 'bg-orange-600 text-white';
      case 'PRODUCT': return 'bg-emerald-600 text-white';
      default: return 'bg-soy-bottle text-soy-label';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-16">
      <header className="mb-10 text-center md:text-left">
        <h1 className="text-6xl md:text-9xl font-black uppercase italic tracking-tighter mb-4 leading-none">
          THE SAUCE REPORT
        </h1>
        <p className="text-2xl md:text-3xl font-bold uppercase tracking-widest text-soy-red italic">
          ANALYSIS. OPINIONS. SCORECARDS.
        </p>
      </header>

      {/* Category Filters */}
      <section className="mb-12">
        <div className="flex flex-wrap gap-2 justify-center md:justify-start">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 border-2 text-xs font-black uppercase tracking-widest transition-all ${
                selectedCategory === cat
                  ? 'bg-black text-white border-black shadow-[2px_2px_0px_#000]'
                  : 'bg-white text-soy-bottle border-soy-bottle/20 hover:border-soy-bottle hover:shadow-[2px_2px_0px_#000]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Start Here Section — routes readers into product surfaces */}
      {resolvedStartHereCards.length > 0 && (
        <section data-testid="start-here-section" className="mb-24 -mx-4 px-4 py-12 bg-black border-y-8 border-soy-red">
          <div className="max-w-7xl mx-auto">
            <div className="mb-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-soy-red text-white px-4 py-2 text-xs font-black uppercase tracking-widest italic shadow-[4px_4px_0px_rgba(255,255,255,0.2)]">
                  START HERE
                </div>
                <div className="flex-1 h-[3px] bg-soy-red/40" />
              </div>
              <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tighter mb-3 text-white">
                Pick the prompt that matches what you're trying to do.
              </h2>
              <p className="text-sm font-bold uppercase tracking-widest text-white/50 italic">
                Each path starts with the right article, then routes you to the tool that solves it.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {resolvedStartHereCards.map(({ card, post }) => (
                <div
                  key={card.id}
                  data-testid={`start-here-card-${card.id}`}
                  className="bg-white border-4 border-white p-8 shadow-[8px_8px_0px_#E63322] hover:shadow-[12px_12px_0px_#E63322] transition-all flex flex-col h-full"
                >
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-soy-red mb-4">
                    {START_HERE_HEADLINES[card.id]}
                  </p>
                  <h3 className="text-xl font-black uppercase italic tracking-tighter leading-tight mb-8 flex-1">
                    "{card.prompt}"
                  </h3>
                  <div className="space-y-3 border-t-2 border-black/10 pt-5">
                    <Link
                      to={`/blog/${post.slug}`}
                      className="flex items-center justify-between text-[11px] font-black uppercase tracking-[0.2em] text-black hover:text-soy-red transition-colors group"
                    >
                      <span>READ FIRST</span>
                      <ArrowRight size={14} strokeWidth={3} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                    <Link
                      to={card.thenTryPath}
                      className="flex items-center justify-between bg-black text-white px-4 py-3 text-[12px] font-black uppercase italic tracking-[0.2em] hover:bg-soy-red transition-colors group"
                    >
                      <span>THEN TRY: {card.thenTryLabel}</span>
                      <ArrowRight size={14} strokeWidth={3} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured Post */}
      {featuredPost ? (
        <section className="mb-24">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-black border-4 border-soy-bottle p-8 md:p-16 text-white shadow-[16px_16px_0px_#E63322] relative overflow-hidden"
          >
            <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="space-y-8">
                <span className={`inline-block px-4 py-1 text-xs font-black uppercase tracking-widest ${getCategoryColor(featuredPost.category)}`}>
                  {featuredPost.category}
                </span>
                <div>
                  <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter leading-none mb-6">
                    {featuredPost.title}
                  </h2>
                  <p className="text-xl font-bold uppercase tracking-widest opacity-60 leading-tight italic">
                    {featuredPost.subtitle}
                  </p>
                </div>
                <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest opacity-40">
                  <span>{featuredPost.date}</span>
                  <span>{featuredPost.readTime}</span>
                </div>
                <Link 
                  to={`/blog/${featuredPost.slug}`}
                  className="inline-flex items-center gap-4 bg-soy-red text-white px-10 py-5 text-xl font-black uppercase italic hover:bg-white hover:text-black transition-all group"
                >
                  READ THE PIECE <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                </Link>
              </div>
              <div className="hidden md:flex justify-end pr-8">
                <span className="text-[200px] leading-none opacity-20 hover:opacity-100 transition-opacity cursor-default animate-pulse">
                  {featuredPost.emoji}
                </span>
              </div>
            </div>
          </motion.div>
        </section>
      ) : (
        <div className="py-20 text-center border-4 border-dashed border-soy-bottle/20 rounded-lg mb-24">
          <p className="text-xl font-medium opacity-40 uppercase italic tracking-widest">
            No articles match this category.
          </p>
        </div>
      )}

      {/* More from Sauce Section */}
      {otherPosts.length > 0 && (
        <>
          <div className="mb-12">
            <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-4">
              MORE FROM THE SAUCE REPORT
            </h2>
            <div className="h-1 bg-soy-red w-full mb-12" />
          </div>

          {/* Grid Posts */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12 mb-24">
            {otherPosts.map((post, index) => {
              const getTagColors = (cat: string) => {
                switch(cat) {
                  case 'ANALYSIS': return 'bg-blue-600';
                  case 'HOT TAKE': return 'bg-orange-600';
                  case 'DEEP DIVE': return 'bg-purple-600';
                  case 'FRAMEWORK WARS': return 'bg-emerald-600';
                  case 'SECURITY': return 'bg-red-600';
                  case 'PRODUCT': return 'bg-teal-600';
                  default: return 'bg-black';
                }
              };
              
              return (
                <motion.div
                  key={post.slug}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="group"
                >
                  <Link to={`/blog/${post.slug}`}>
                    <div className="bg-white border-4 border-black p-8 h-full shadow-[8px_8px_0px_#333] hover:shadow-[12px_12px_0px_#E63322] transition-all flex flex-col">
                      <div className="flex justify-between items-start mb-10">
                        <span className="text-5xl grayscale group-hover:grayscale-0 transition-all">{post.emoji}</span>
                        <span className={`px-4 py-1 text-[8px] font-black uppercase tracking-widest text-white shadow-[2px_2px_0px_#000] ${getTagColors(post.category)}`}>
                          {post.category}
                        </span>
                      </div>
                      <div className="flex-1 space-y-4 mb-10">
                        <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none group-hover:text-soy-red transition-all">
                          {post.title}
                        </h3>
                        <p className="text-[11px] font-bold uppercase tracking-widest opacity-60 italic leading-relaxed">
                          {post.subtitle}
                        </p>
                      </div>
                      <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-[0.2em] opacity-40 border-t border-soy-bottle/10 pt-6">
                        <span>{post.date}</span>
                        <span>{post.readTime}</span>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </section>
        </>
      )}

      {/* Submit CTA */}
      <section className="bg-soy-bottle p-12 md:p-20 text-center shadow-[12px_12px_0px_#E63322]">
        <h2 className="text-4xl md:text-6xl font-black uppercase italic tracking-tighter text-white mb-8">
          WANT TO CONTRIBUTE?
        </h2>
        <p className="text-xl font-bold uppercase tracking-widest text-soy-label opacity-60 mb-12 max-w-2xl mx-auto">
          WE ARE ALWAYS LOOKING FOR HARD-HITTING ANALYSIS AND UNPOPULAR OPINIONS ABOUT THE ECOSYSTEM. 
        </p>
        <button className="bg-soy-red text-white px-12 py-6 text-2xl font-black uppercase italic hover:scale-105 transition-transform flex items-center gap-4 mx-auto">
          <MessageSquare size={32} /> SUBMIT A HOT TAKE
        </button>
      </section>
    </div>
  );
}
