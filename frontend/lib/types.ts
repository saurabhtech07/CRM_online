export type PermAction = "canView" | "canCreate" | "canEdit" | "canDelete" | "canExport";

export interface ModulePermission {
  moduleId: number;
  moduleKey: string;
  moduleName: string;
  sortOrder: number;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export interface AuthUser {
  userId: number;
  fullName: string;
  username: string;
  email: string;
  roleId: number;
  roleName: string;
  permissions: ModulePermission[];
}

export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: AuthUser;
}

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Converted" | "Rejected";

export interface Lead {
  leadId: number;
  leadCode: string;
  fullName: string;
  phone: string;
  email?: string;
  city?: string;
  address?: string;
  sourceId?: number;
  sourceName?: string;
  projectId?: number;
  projectName?: string;
  areaId?: number;
  areaName?: string;
  propertyType?: string;
  budget?: number;
  dealValue?: number;
  status: LeadStatus;
  rejectReason?: string;
  notes?: string;
  assignedToUserId?: number;
  assignedToName?: string;
  leadDate: string;
  convertedDate?: string;
  rejectedDate?: string;
  createdAt: string;
}

export interface LeadHistory {
  historyId: number;
  fromStatus?: string;
  toStatus: string;
  changedByName?: string;
  changedAt: string;
  remark?: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface Lookup {
  id: number;
  name: string;
}

export interface MonthlyStat {
  year: number;
  month: number;
  monthName: string;
  label: string;
  totalLeads: number;
  clients: number;
  rejected: number;
  pending: number;
  revenue: number;
}

export interface DashboardSummary {
  totalLeads: number;
  clients: number;
  rejected: number;
  pending: number;
  revenue: number;
  conversionRate: number;
  leadsChangePct: number;
  clientsChangePct: number;
  rejectedChangePct: number;
  revenueChangePct: number;
}

export interface LookupCount {
  name: string;
  count: number;
  value: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  trend: MonthlyStat[];
  bySource: LookupCount[];
  byProject: LookupCount[];
  byStatus: LookupCount[];
  recentLeads: Lead[];
}

export interface User {
  userId: number;
  fullName: string;
  email: string;
  username: string;
  phone?: string;
  roleId: number;
  roleName: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt: string;
  /** Data scope - which cities / areas / property types this user may see. */
  cities?: string[];
  areaIds?: number[];
  propertyTypes?: string[];
  /** Agents whose assigned leads this user may see in the Leads grid. */
  agentUserIds?: number[];
  /** Per-user module authority. */
  permissions?: ModulePermission[];
}

export interface Role {
  roleId: number;
  roleName: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  userCount: number;
  permissions: ModulePermission[];
}

export interface ModuleDef {
  moduleId: number;
  moduleKey: string;
  moduleName: string;
  sortOrder: number;
}

/* ---------------- Assistant (chatbot) ---------------- */

export interface AssistantHistory {
  fromStatus?: string;
  toStatus: string;
  changedBy?: string;
  changedAt: string;
  remark?: string;
}

export interface AssistantMatch {
  leadId: number;
  leadCode: string;
  fullName: string;
  phone: string;
  email?: string;
  city?: string;
  area?: string;
  source?: string;
  project?: string;
  propertyType?: string;
  budget?: number;
  dealValue?: number;
  status: LeadStatus;
  assignedTo?: string;
  notes?: string;
  rejectReason?: string;
  leadDate: string;
  convertedDate?: string;
  rejectedDate?: string;
  history: AssistantHistory[];
}

export interface AssistantResult {
  query: string;
  matches: AssistantMatch[];
  message?: string;
}

/* ---------------- Site visits ---------------- */

export type VisitStatus = "Ongoing" | "Completed" | "Cancelled";

export interface VisitPoint {
  lat: number;
  lng: number;
  recordedAt: string;
}

export interface SiteVisit {
  visitId: number;
  agentUserId: number;
  agentName: string;
  leadId: number;
  leadCode: string;
  clientName: string;
  clientPhone?: string;
  city?: string;
  area?: string;
  projectName?: string;
  status: VisitStatus;
  purpose?: string;
  remark?: string;
  startLat?: number;
  startLng?: number;
  endLat?: number;
  endLng?: number;
  lastLat?: number;
  lastLng?: number;
  startedAt: string;
  completedAt?: string;
  pointCount: number;
  path: VisitPoint[];
}
