import type { DashboardRole } from "../auth/auth.types";

export interface NavigationItem {
  path: string;
  icon?: "dashboard" | "users" | "send" | "template" | "contacts" | "leads" | "pairing" | "accounts" | "channels";
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
