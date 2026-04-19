import type { NavigationItem } from "../types/navigation";

export const NAV_ITEMS: NavigationItem[] = [
  {
    path: "/dashboard",
    label: "Dashboard",
    title: "Dashboard",
    description: "Overview and backend health.",
  },
  {
    path: "/org-units",
    label: "Org Units",
    title: "Org Units",
    description: "Organization units and hierarchy.",
  },
  {
    path: "/channels",
    label: "Channels",
    title: "Channels",
    description: "Configured channel definitions.",
  },
  {
    path: "/channel-accounts",
    label: "Channel Accounts",
    title: "Channel Accounts",
    description: "Provider account bindings.",
  },
  {
    path: "/business-partners",
    label: "Business Partners",
    title: "Business Partners",
    description: "People and company records.",
  },
  {
    path: "/services",
    label: "Services",
    title: "Services",
    description: "Service catalog and settings.",
  },
  {
    path: "/request-types",
    label: "Request Types",
    title: "Request Types",
    description: "Request type definitions per service.",
  },
  {
    path: "/content-templates",
    label: "Content Templates",
    title: "Content Templates",
    description: "Localized template messages.",
  },
  {
    path: "/flows",
    label: "Flows",
    title: "Flows",
    description: "Flow headers and versions.",
  },
  {
    path: "/flow-steps",
    label: "Flow Steps",
    title: "Flow Steps",
    description: "Step-level flow logic.",
  },
  {
    path: "/sessions",
    label: "Sessions",
    title: "Sessions",
    description: "Bot sessions and statuses.",
  },
  {
    path: "/messages",
    label: "Messages",
    title: "Messages",
    description: "Inbound and outbound traffic.",
  },
  {
    path: "/service-requests",
    label: "Service Requests",
    title: "Service Requests",
    description: "Requests created from conversations.",
  },
  {
    path: "/runtime-test",
    label: "Runtime Test",
    title: "Runtime Test",
    description: "Runtime inbound-message test surface.",
  },
];
