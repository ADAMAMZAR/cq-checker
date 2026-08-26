import {
  IconTrendingUp,
  IconRobot,
  IconEye,
  IconCertificate,
  IconGavel,
  TablerIcon,
} from "@tabler/icons-react";

export interface PortalModule {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: TablerIcon;
  anchor: string;
  isExternal: boolean;
  routePath?: string;
}

export const PORTAL_FEATURES: PortalModule[] = [
  {
    id: "strategic_insights",
    title: "Automating Real-Time Strategic Insights",
    subtitle: "Executive Analytics",
    description: "Financial breakdown, cost impact analysis, and compliance cost metrics portal.",
    icon: IconTrendingUp,
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "procurement_assistant",
    title: "24/7 Autonomous Procurement Assistant",
    subtitle: "AI Assistant",
    description: "SAP Ariba Procurement Assistant for Vendor Onboarding and Sourcing.",
    icon: IconRobot,
    anchor: "https://notebook.google.com/notebook/4bf27118-ca6c-413b-ba77-17b381d3679a?pli=1",
    isExternal: true,
  },
  {
    id: "supplier_visibility",
    title: "Providing Real-Time Supplier Visibility",
    subtitle: "Vendor Intelligence",
    description: "Deep audit engine, certificate cross-checks, and real-time vendor risk monitoring.",
    icon: IconEye,
    anchor: "https://app.powerbi.com/groups/me/apps/3df7b712-6082-4f44-80ec-f8ce1adf648c/reports/18a05110-1a5c-47ba-895d-a8a35b769a9c/3d71ecbf3319379490fa?ctid=3661835b-b3f4-4a97-b533-2461d689290c&experience=power-bi",
    isExternal: true,
  },
  {
    id: "certificate_checker",
    title: "Automating Supplier Compliance Audits",
    subtitle: "Audit Registry Engine",
    description: "Manage, update, and resolve supplier certificate data and audit findings.",
    icon: IconCertificate,
    anchor: "https://chromewebstore.google.com/detail/lhcookcbhcmgbohajfncncpcihdjnjbo?utm_source=item-share-cb",
    isExternal: true,
  },
  {
    id: "e_auction_generator",
    title: "E-Auction Generator",
    subtitle: "Event Document Center",
    description: "Issue and generate official E-Auction Event Information documents & lot structures.",
    icon: IconGavel,
    anchor: "/auction",
    isExternal: false,
    routePath: "/auction",
  },
];

export const HERO_SLIDE_IMAGES = [
  "/hero/hero1.jpg",
  "/hero/hero2.jpg",
  "/hero/hero3.jpg",
];
