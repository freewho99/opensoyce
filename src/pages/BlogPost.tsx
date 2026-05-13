import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { blogPosts } from '../data/blogPosts';
import { ArrowLeft, Clock, Calendar, Share2 } from 'lucide-react';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = blogPosts.find(p => p.slug === slug);

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const relatedPosts = blogPosts
    .filter(p => p.slug !== post.slug && p.tags.some(tag => post.tags.includes(tag)))
    .slice(0, 2);

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

  // Render content: support [img:url:caption] markers for inline images
  const renderContent = (content: string) => {
    const paragraphs = content.split('\n\n');
    return paragraphs.map((para, i) => {
      // Trim each paragraph so leading newlines / whitespace in the article
      // template literal don't break heading detection.
      const trimmed = para.trim();
      if (!trimmed) return null;
      const imgMatch = trimmed.match(/^\[img:([^:]+):([^\]]+)\]$/);
      if (imgMatch) {
        return (
          <figure key={i} className="my-10">
            <img
              src={imgMatch[1]}
              alt={imgMatch[2]}
              className="w-full rounded-lg object-contain max-h-[600px]"
            />
            <figcaption className="text-center text-xs font-black uppercase tracking-widest opacity-50 mt-3">
              {imgMatch[2]}
            </figcaption>
          </figure>
        );
      }
      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={i} className="text-2xl font-black uppercase italic tracking-tight mt-10 mb-4 text-soy-bottle">
            {trimmed.slice(4)}
          </h3>
        );
      }
      if (trimmed.startsWith('## ')) {
        return (
          <h2 key={i} className="text-3xl font-black uppercase italic tracking-tight mt-12 mb-6 text-soy-bottle border-b-2 border-soy-red pb-3">
            {trimmed.slice(3)}
          </h2>
        );
      }
      if (trimmed.startsWith('# ')) {
        return (
          <h1 key={i} className="text-4xl font-black uppercase italic tracking-tight mt-12 mb-6 text-soy-bottle">
            {trimmed.slice(2)}
          </h1>
        );
      }
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      return (
        <p key={i} className="text-lg leading-relaxed mb-6 opacity-90">
          {parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={j} className="font-black text-soy-bottle">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </p>
      );
    });
  };
  return (
    <div className="max-w-4xl mx-auto px-4 py-20">
      <Link
        to="/blog"
        className="inline-flex items-center gap-2 font-black uppercase tracking-widest text-xs hover:text-soy-red transition-colors mb-12"
      >
        <ArrowLeft size={16} strokeWidth={3} />
        BACK TO THE SAUCE REPORT
      </Link>

      <article>
        <header className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <span className={`px-4 py-1 text-xs font-black uppercase tracking-widest ${getCategoryColor(post.category)}`}>
              {post.category}
            </span>
            <span className="text-4xl">{post.emoji}</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter leading-[0.9] mb-8">
            {post.title}
          </h1>
          <p className="text-2xl font-bold uppercase tracking-widest opacity-60 italic mb-8 max-w-2xl leading-tight">
            {post.subtitle}
          </p>
          <div className="flex flex-wrap items-center gap-8 pt-8 border-t-4 border-soy-bottle text-xs font-black uppercase tracking-widest">
            <div className="flex items-center gap-2 opacity-60">
              <Calendar size={16} />
              {post.date}
            </div>
            <div className="flex items-center gap-2 opacity-60">
              <Clock size={16} />
              {post.readTime}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button className="flex items-center gap-2 hover:text-soy-red transition-colors">
                <Share2 size={16} />
                SHARE PIECE
              </button>
            </div>
          </div>
        </header>

        {/* Hero Image */}
        {post.heroImage && (
          <div className="mb-16">
            <img
              src={post.heroImage}
              alt={post.title}
              className="w-full h-auto max-h-[520px] object-contain border-4 border-soy-bottle shadow-[8px_8px_0px_#E63322] bg-black"
            />
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-16">
          {/* Main Content */}
          <div className="md:col-span-8 space-y-8">
            {renderContent(post.content)}
            <div className="pt-12 flex flex-wrap gap-3">
              {post.tags.map(tag => (
                <span key={tag} className="bg-soy-label text-[10px] font-black uppercase tracking-widest px-3 py-1 border border-soy-bottle/10">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <aside className="md:col-span-4 space-y-12">
            {post.tags.includes('scoring') && (
              <div className="bg-white border-4 border-soy-bottle p-6 shadow-[8px_8px_0px_#E63322]">
                <h4 className="text-[10px] font-black uppercase tracking-[.2em] mb-4 opacity-40">SOYCE SCORE REFERENCED</h4>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-black uppercase italic tracking-tighter text-3xl">METRIC.JS</span>
                  <div className="bg-soy-red text-white px-3 py-1 text-2xl font-black italic">8.5</div>
                </div>
                <div className="h-2 bg-soy-label w-full mb-4">
                  <div className="h-full bg-soy-red w-[85%]" />
                </div>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic leading-tight">
                  THIS ENTIRE ARTICLE REVOLVES AROUND TRANSPARENCY IN SCORING METHODOLOGY.
                </p>
              </div>
            )}
            <div className="border-t-4 border-soy-bottle pt-8">
              <h4 className="text-sm font-black uppercase tracking-widest mb-6 italic">MAINTAINER NOTE</h4>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic leading-relaxed">
                ARTICLES IN THE SAUCE REPORT ARE INDEPENDENT ANALYSIS. OPINIONS EXPRESSED ARE THOSE OF THE AUTHORS AND DO NOT NECESSARILY REFLECT OFFICIAL SCORING ALGORITHMS.
              </p>
            </div>
          </aside>
        </div>
      </article>

      {/* Footer / Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="mt-32 pt-20 border-t-8 border-soy-bottle">
          <h3 className="text-3xl font-black uppercase italic tracking-tight mb-12">MORE FROM THE SAUCE REPORT</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {relatedPosts.map(rp => (
              <Link key={rp.slug} to={`/blog/${rp.slug}`} className="group">
                <div className="bg-white border-4 border-soy-bottle p-8 shadow-[8px_8px_0px_#000] group-hover:shadow-[8px_8px_0px_#E63322] transition-all h-full">
                  {rp.heroImage && (
                    <img src={rp.heroImage} alt={rp.title} className="w-full h-40 object-cover mb-4 border-2 border-soy-bottle" />
                  )}
                  <div className="flex justify-between mb-4">
                    <span className="text-3xl">{rp.emoji}</span>
                    <span className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest ${getCategoryColor(rp.category)}`}>
                      {rp.category}
                    </span>
                  </div>
                  <h4 className="text-xl font-black uppercase italic tracking-tight group-hover:text-soy-red transition-colors mb-2 leading-none">
                    {rp.title}
                  </h4>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 italic line-clamp-2">
                    {rp.subtitle}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}