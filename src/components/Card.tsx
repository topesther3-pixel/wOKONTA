import React from 'react';
import { cn } from '../lib/utils';

export const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white rounded-3xl p-6 shadow-sm border border-gray-100', className)}>
    {children}
  </div>
);
