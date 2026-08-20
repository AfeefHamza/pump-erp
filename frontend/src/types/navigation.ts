import { type LucideIcon } from 'lucide-react';

export interface MenuItem {
  name: string;
  path: string;
  icon?: LucideIcon;
}

export interface MenuSection {
  title: string;
  items: MenuItem[];
}
