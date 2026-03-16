'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useSubscription } from '@/hooks/useSubscription';
import { FloatingDock, DockItem } from '@/components/ui/floating-dock';
import {
  LayoutDashboard, Upload, LogOut, Sun, Moon, BookOpen, User, Crown,
} from 'lucide-react';

export default function FloatingDockNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { isPremium } = useSubscription();
  const { theme, toggleTheme } = useTheme();

  // Hide dock on fullscreen pages
  const hiddenRoutes = ['/teleprompter'];
  if (hiddenRoutes.some((r) => pathname.startsWith(r))) return null;

  if (!user) {
    if (pathname !== '/pricing') return null;

    const guestItems: DockItem[] = [
      {
        title: 'Home',
        icon: <BookOpen className="h-full w-full" />,
        href: '/',
      },
      {
        title: 'Pricing',
        icon: <Crown className="h-full w-full" />,
        href: '/pricing',
        active: pathname === '/pricing',
      },
      {
        title: 'Sign in',
        icon: <User className="h-full w-full" />,
        href: '/login',
      },
      {
        title: 'Get started',
        icon: <LayoutDashboard className="h-full w-full" />,
        href: '/register',
      },
      {
        title: theme === 'dark' ? 'Light mode' : 'Dark mode',
        icon: theme === 'dark'
          ? <Sun className="h-full w-full" />
          : <Moon className="h-full w-full" />,
        onClick: toggleTheme,
      },
    ];

    return <FloatingDock items={guestItems} />;
  }

  const items: DockItem[] = [
    {
      title: isPremium ? 'Pro Plan' : 'Go Premium',
      icon: <Crown className="h-full w-full" />,
      href: '/pricing',
      active: pathname === '/pricing',
    },

    {
      title: 'Dashboard',
      icon: <LayoutDashboard className="h-full w-full" />,
      href: '/dashboard',
      active: pathname === '/dashboard',
    },
    {
      title: 'Upload',
      icon: <Upload className="h-full w-full" />,
      href: '/upload',
      active: pathname === '/upload',
    },
   
    {
      title: theme === 'dark' ? 'Light mode' : 'Dark mode',
      icon: theme === 'dark'
        ? <Sun className="h-full w-full" />
        : <Moon className="h-full w-full" />,
      onClick: toggleTheme,
    },
    {
      title: 'Sign out',
      icon: <LogOut className="h-full w-full" />,
      onClick: () => { logout(); router.push('/login'); },
    },
  ];

  return <FloatingDock items={items} />;
}
