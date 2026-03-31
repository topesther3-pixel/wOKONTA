import React from 'react';
import { cn } from '../lib/utils';

export const Button = ({ 
  children, onClick, className, variant = 'primary', size = 'md', disabled = false, icon: Icon, type = 'button'
}: { 
  children?: React.ReactNode, onClick?: () => void, className?: string, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent', 
  size?: 'sm' | 'md' | 'lg' | 'xl', disabled?: boolean, icon?: any, type?: 'button' | 'submit'
}) => {
  const variants = {
    primary: 'bg-orange-500 text-white hover:bg-orange-600',
    secondary: 'bg-blue-500 text-white hover:bg-blue-600',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    accent: 'bg-green-500 text-white hover:bg-green-600',
  };
  const sizes = {
    sm: 'p-2 text-sm',
    md: 'p-4 text-base',
    lg: 'p-6 text-xl font-bold',
    xl: 'p-8 text-2xl font-bold',
  };

  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        'rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {Icon && <Icon size={size === 'xl' ? 32 : 24} />}
      {children}
    </button>
  );
};
