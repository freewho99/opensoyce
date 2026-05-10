import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

export default function NotFound() {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 text-center">
      <motion.h1 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-[120px] md:text-[180px] font-black italic tracking-tighter text-soy-red leading-none"
      >
        404
      </motion.h1>
      <h2 className="text-4xl md:text-5xl font-black uppercase italic tracking-tight mb-4">
        PAGE NOT FOUND
      </h2>
      <p className="text-sm font-bold uppercase tracking-widest opacity-60 mb-12">
        THIS REPO DOESN'T EXIST. BUT YOURS MIGHT.
      </p>
      
      <div className="flex flex-col md:flex-row gap-4 w-full max-w-md">
        <Link 
          to="/" 
          className="flex-1 bg-black text-white py-6 font-black uppercase tracking-widest italic hover:bg-soy-bottle transition-all border-2 border-black shadow-[4px_4px_0px_#E63322]"
        >
          GO HOME
        </Link>
        <Link 
          to="/lookup" 
          className="flex-1 bg-soy-red text-white py-6 font-black uppercase tracking-widest italic hover:bg-black transition-all border-2 border-black shadow-[4px_4px_0px_#000]"
        >
          ANALYZE A REPO
        </Link>
      </div>
    </div>
  );
}
