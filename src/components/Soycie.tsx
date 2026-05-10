import React from 'react';
import { motion } from 'motion/react';

interface SoycieProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  mood?: 'happy' | 'suspicious' | 'cool' | 'alert';
}

export default function Soycie({ className = "", size = 'md', mood = 'happy' }: SoycieProps) {
  const sizes = {
    sm: 'w-16 h-16',
    md: 'w-32 h-32',
    lg: 'w-64 h-64',
  };

  return (
    <motion.div 
      animate={{ 
        y: [0, -5, 0],
        rotate: [0, -2, 2, 0]
      }}
      transition={{ 
        repeat: Infinity, 
        duration: 4, 
        ease: "easeInOut" 
      }}
      className={`relative ${sizes[size]} ${className}`}
    >
      {/* Bottle Body */}
      <svg viewBox="0 0 100 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-xl">
        {/* Cap */}
        <path d="M30 10 H70 V30 H30 Z" fill="#D12D2D" stroke="#302C26" strokeWidth="3" />
        {/* Neck */}
        <path d="M40 30 H60 V60 H40 Z" fill="#302C26" />
        {/* Body */}
        <path d="M20 60 H80 L90 180 H10 L20 60 Z" fill="#302C26" stroke="#302C26" strokeWidth="2" />
        {/* Label */}
        <path d="M25 90 H75 V140 H25 Z" fill="#EBE6D9" stroke="#302C26" strokeWidth="1" />
        <text x="50" y="115" fontSize="10" fontWeight="bold" textAnchor="middle" fill="#302C26" fontFamily="JetBrains Mono">SOY</text>
        <text x="50" y="128" fontSize="8" fontWeight="bold" textAnchor="middle" fill="#D12D2D" fontFamily="JetBrains Mono">CE</text>
        
        {/* Eyes */}
        {mood === 'happy' && (
          <>
            <circle cx="40" cy="75" r="4" fill="white" />
            <circle cx="60" cy="75" r="4" fill="white" />
          </>
        )}
        {mood === 'suspicious' && (
          <>
            <rect x="35" y="73" width="10" height="3" fill="white" />
            <rect x="55" y="73" width="10" height="4" fill="white" />
          </>
        )}
        {mood === 'alert' && (
          <>
            <circle cx="40" cy="75" r="5" fill="white" />
            <circle cx="60" cy="75" r="5" fill="white" />
            <circle cx="40" cy="75" r="2" fill="red" />
            <circle cx="60" cy="75" r="2" fill="red" />
          </>
        )}
        
        {/* Mouth */}
        {mood === 'happy' && <path d="M40 85 Q50 90 60 85" stroke="white" strokeWidth="2" fill="none" />}
        {mood === 'suspicious' && <path d="M40 85 H60" stroke="white" strokeWidth="2" fill="none" />}
      </svg>
    </motion.div>
  );
}
