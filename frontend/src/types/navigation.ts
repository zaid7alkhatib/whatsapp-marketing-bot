import type { DashboardRole } from "../auth/auth.types";

export interface NavigationItem {
  path: string;
  label: string;
  title: string;
  description: string;
  section: string;
  labelKey?: string;
  titleKey?: string;
  descriptionKey?: string;
  sectionKey?: string;
  allowedRoles: DashboardRole[];
}
