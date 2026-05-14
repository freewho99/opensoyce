import React from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { blogPosts } from '../data/blogPosts';
import { ArrowLeft, ArrowRight, Clock, Calendar, Share2 } from 'lucide-react';

type ProductActionKey = 'scanner' | 'lookup' | 'methodology' | 'leaderboards' | 'compare';

const PRODUCT_ACTIONS: Record<ProductActionKey, {
  headline: string;
  body: string;
  ctaLabel: string;
  ctaPath: string;
  chipLabel: string;
}> = {
  scanner: {
    headline: "Scan your package-lock.json",
    body: "Find known vulnerabilities in your resolved dependency tree. OSV-backed advisory matching, npm-only.",
    ctaLabel: "OPEN SCANNER",
    ctaPath: "/scanner",
    chipLabel: "SCANNER",
  },
  lookup: {
    headline: "Look up a GitHub repo",
    body: "Score any repo on 13 GitHub signals across maintenance, community, security, documentation, and activity.",
    ctaLabel: "OPEN LOOKUP",
    ctaPath: "/lookup",
    chipLabel: "LOOKUP",
  },
  methodology: {
    headline: "See how the score is built",
    body: "Read the v2 scoring methodology — what each pillar measures, why scores changed, and what the verdict bands mean.",
    ctaLabel: "READ METHODOLOGY",
    ctaPath: "/methodology",
    chipLabel: "METHODOLOGY",
  },
  leaderboards: {
    headline: "Browse the leaderboards",
    body: "See the highest-scoring open-source projects across categories. Filter, compare, and discover.",
    ctaLabel: "OPEN LEADERBOARDS",
    ctaPath: "/leaderboards",
    chipLabel: "LEADERBOARDS",
  },
  compare: {
    headline: "Compare projects side-by-side",
    body: "Pull two or more repos into a comparison view and weigh them across all 13 signals.",
    ctaLabel: "OPEN COMPARE",
    ctaPath: "/compare",
    chipLabel: "COMPARE",
  },
};

const PRODUCT_ACTION_ORDER: ProductActionKey[] = ['scanner', 'lookup', 'methodology', 'leaderboards', 'compare'];

// Render inline tokens: markdown links [text](url) and bold **text**.
// Defensive against unmatched brackets — falls through as literal text.
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenRe = /(\[[^\]\n]+\]\([^)\s]+\)|\*\*[^*\n]+\*\*)/g;
  const segments = text.split(tokenRe);
  return segments.map((segment, idx) => {
    if (!segment) return null;
    // Markdown link
    const linkMatch = segment.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      const linkClass = 'text-soy-red hover:underline font-bold';
      if (url.startsWith('/')) {
        return (
          <Link key={`${keyPrefix}-${idx}`} to={url} className={linkClass}>
            {label}
          </Link>
        );
      }
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return (
          <a
            key={`${keyPrefix}-${idx}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {label}
          </a>
        );
      }
      return (
        <a key={`${keyPrefix}-${idx}`} href={url} className={linkClass}>
          {label}
        </a>
      );
    }
    // Bold
    if (segment.startsWith('**') && segment.endsWith('**') && segment.length >= 4) {
      return (
        <strong key={`${keyPrefix}-${idx}`} className="font-black text-soy-bottle">
          {segment.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${keyPrefix}-${idx}`}>{segment}</React.Fragment>;
  });
}

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
      return (
        <p key={i} className="text-lg leading-relaxed mb-6 opacity-90">
          {renderInline(trimmed, `p-${i}`)}
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

            {/* Product CTA Block — only renders if primaryProductAction is set */}
            {post.primaryProductAction && PRODUCT_ACTIONS[post.primaryProductAction] && (
              <aside
                data-testid="product-cta-block"
                className="my-12 bg-soy-red text-white border-4 border-black shadow-[8px_8px_0px_#000] p-8 md:p-10"
              >
                <h3 className="text-3xl md:text-4xl font-black uppercase italic tracking-tighter leading-none mb-4">
                  {PRODUCT_ACTIONS[post.primaryProductAction].headline}
                </h3>
                <p className="text-base md:text-lg font-bold leading-relaxed mb-8 opacity-90">
                  {PRODUCT_ACTIONS[post.primaryProductAction].body}
                </p>
                <Link
                  to={PRODUCT_ACTIONS[post.primaryProductAction].ctaPath}
                  className="inline-flex items-center gap-4 bg-black text-white px-8 py-4 text-lg font-black uppercase italic tracking-widest hover:bg-white hover:text-black transition-all group"
                >
                  {PRODUCT_ACTIONS[post.primaryProductAction].ctaLabel}
                  <ArrowRight className="group-hover:translate-x-2 transition-transform" />
                </Link>
              </aside>
            )}

            <div className="pt-12 flex flex-wrap gap-3">
              {post.tags.map(tag => (
                <span key={tag} className="bg-soy-label text-[10px] font-black uppercase tracking-widest px-3 py-1 border border-soy-bottle/10">
                  #{tag}
                </span>
              ))}
            </div>

            {/* Related Tools Strip — always renders */}
            <div
              data-testid="related-tools-strip"
              className="border-t-2 border-black/20 mt-12 pt-6"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-3">Related Tools</p>
              <div className="flex flex-wrap gap-3">
                {PRODUCT_ACTION_ORDER
                  .filter(key => key !== post.primaryProductAction)
                  .map(key => (
                    <Link
                      key={key}
                      to={PRODUCT_ACTIONS[key].ctaPath}
                      className="inline-flex items-center px-4 py-2 text-[11px] font-black uppercase italic tracking-[0.2em] border-2 border-black bg-white text-black hover:bg-soy-red hover:text-white hover:border-soy-red transition-colors"
                    >
                      {PRODUCT_ACTIONS[key].chipLabel}
                    </Link>
                  ))}
              </div>
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