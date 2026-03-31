import React from 'react';
import { cn } from '../lib/utils';

export const PinInput = ({ value, onChange, length = 4 }: { value: string, onChange: (val: string) => void, length?: number }) => {
  return (
    <div className="flex justify-center gap-4">
      {Array.from({ length }).map((_, i) => (
        <div 
          key={i}
          className={cn(
            'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all',
            value.length > i ? 'bg-orange-500 border-orange-500' : 'bg-gray-100 border-gray-200'
          )}
        >
          {value.length > i && <div className="w-3 h-3 bg-white rounded-full" />}
        </div>
      ))}
    </div>
  );
};
