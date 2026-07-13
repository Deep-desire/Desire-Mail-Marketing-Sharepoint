export interface Admin {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface LoginResponse {
  access_token: string;
  admin: Admin;
}

// ─── SharePoint Config ────────────────────────────────────────

export interface SharePointConfig {
  id: string;
  name: string;
  siteId: string;
  listId: string;
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null; // Always '***' or null from API
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ─── SharePoint ───────────────────────────────────────────────

/** A single contact fetched from the SharePoint list */
export interface SPContact {
  name: string;
  email: string;
  status: 'valid' | 'invalid' | 'duplicate' | 'unsubscribed';
  reason: string | null;
  itemId?: string;
  rawFields?: Record<string, any>;
}

/** Response from GET /sharepoint/contacts */
export interface SPContactsResponse {
  contacts: SPContact[];
  total: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  unsubscribedCount: number;
}

// ─── Campaigns ────────────────────────────────────────────────

export interface Campaign {
  id: string;
  name: string;
  status: 'processing' | 'completed' | 'failed' | 'scheduled';
  templateId: string;
  template?: Template;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  pendingCount: number;
  skippedCount: number;
  scheduledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  senderEmail?: string;
  configId?: string | null;
  config?: SharePointConfig | null;
  syncMode?: 'full' | 'incremental';
}

export interface Recipient {
  id: string;
  name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  error: string | null;
  sentAt: string | null;
  campaignId: string;
  createdAt: string;
}

// ─── Templates ────────────────────────────────────────────────

export interface Template {
  id: string;
  name: string;
  subject: string;
  htmlBody: string;
  plainTextBody: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Dashboard ────────────────────────────────────────────────

export interface DashboardStats {
  totalCampaigns: number;
  totalTemplates: number;
  totalEmailsSent: number;
  totalFailedEmails: number;
}
