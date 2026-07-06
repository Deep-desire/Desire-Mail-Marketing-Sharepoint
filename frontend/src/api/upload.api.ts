import api from './axios';
import { Template, Campaign, SPContactsResponse, SharePointConfig, Recipient } from '../types';

export const uploadApi = {
  // ── SharePoint Config CRUD ──────────────────────────────────────────────
  /** Get all SharePoint list configurations */
  getSharePointConfigs: () =>
    api.get<{ configs: SharePointConfig[] }>('/sharepoint/configs'),

  /** Create a new SharePoint list configuration */
  createSharePointConfig: (data: {
    name: string;
    siteId: string;
    listId: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    sortOrder?: number;
  }) => api.post<SharePointConfig>('/sharepoint/configs', data),

  /** Update an existing SharePoint list configuration */
  updateSharePointConfig: (id: string, data: Partial<{
    name: string;
    siteId: string;
    listId: string;
    tenantId: string | null;
    clientId: string | null;
    clientSecret: string | null;
    isActive: boolean;
    sortOrder: number;
  }>) => api.put<SharePointConfig>(`/sharepoint/configs/${id}`, data),

  /** Delete a SharePoint list configuration */
  deleteSharePointConfig: (id: string) =>
    api.delete<{ message: string }>(`/sharepoint/configs/${id}`),

  /** Test connection to a SharePoint list */
  testSharePointConfig: (id: string) =>
    api.post<{ success: boolean; message: string; fieldCount?: number; fields?: string[] }>(
      `/sharepoint/configs/${id}/test`
    ),

  // ── SharePoint Contacts ─────────────────────────────────────────────────
  /** Fetch & categorise all contacts live from a specific SharePoint list */
  getSharePointContacts: (configId: string, mode: 'incremental' | 'full' = 'full', templateId?: string) => {
    let url = `/sharepoint/contacts?configId=${configId}&mode=${mode}`;
    if (templateId) url += `&templateId=${templateId}`;
    return api.get<SPContactsResponse>(url);
  },

  // ── Campaigns ───────────────────────────────────────────────────────────
  getCampaigns: () => api.get<Campaign[]>('/campaigns'),

  getCampaign: (id: string) => api.get<Campaign>(`/campaigns/${id}`),

  createCampaign: (data: {
    name?: string;
    templateId: string;
    syncMode?: 'incremental' | 'full';
    configId?: string;
    contacts?: { name: string; email: string }[];
  }) => api.post<Campaign>('/campaigns', data),

  deleteCampaign: (id: string) => api.delete(`/campaigns/${id}`),

  getCampaignStats: (id: string) =>
    api.get<{
      id: string;
      status: string;
      totalCount: number;
      sentCount: number;
      failedCount: number;
      pendingCount: number;
      skippedCount: number;
    }>(`/campaigns/${id}/stats`),

  getCampaignRecipients: (id: string, page = 1, limit = 50, status?: string) =>
    api.get<{
      recipients: Recipient[];
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    }>(`/campaigns/${id}/recipients`, { params: { page, limit, status } }),

  sendCampaignBatch: (id: string, data: { recipientIds: string[] }) =>
    api.post<{ sent: number; failed: number }>(`/campaigns/${id}/send-batch`, data),

  finalizeCampaign: (id: string) =>
    api.post<{ status: string }>(`/campaigns/${id}/finalize`),

  getRecipients: () =>
    api.get<{ recipients: (Recipient & { campaign: { name: string } })[] }>('/recipients'),

  updateRecipient: (id: string, data: { name: string; email: string }) =>
    api.put<Recipient>(`/recipients/${id}`, data),

  deleteRecipient: (id: string) =>
    api.delete<{ message: string }>(`/recipients/${id}`),

  // ── Unsubscribed ────────────────────────────────────────────────────────
  getUnsubscribed: () =>
    api.get<{ unsubscribed: { id: string; email: string; token: string; createdAt: string }[] }>('/unsubscribed'),

  addUnsubscribed: (email: string) =>
    api.post<{ id: string; email: string; token: string; createdAt: string }>('/unsubscribed', { email }),

  removeUnsubscribed: (id: string) =>
    api.delete<{ message: string }>(`/unsubscribed/${id}`),

  // ── Dashboard stats ─────────────────────────────────────────────────────
  getDashboardStats: () =>
    api.get<{
      totalCampaigns: number;
      totalTemplates: number;
      totalEmailsSent: number;
      totalFailedEmails: number;
    }>('/campaigns/stats/dashboard'),

  // ── Templates ───────────────────────────────────────────────────────────
  getTemplates: () => api.get<Template[]>('/templates'),

  getTemplate: (id: string) => api.get<Template>(`/templates/${id}`),

  createTemplate: (data: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>) =>
    api.post<Template>('/templates', data),

  updateTemplate: (id: string, data: Partial<Template>) =>
    api.put<Template>(`/templates/${id}`, data),

  deleteTemplate: (id: string) => api.delete(`/templates/${id}`),

  testTemplate: (id: string, testEmail: string) =>
    api.post(`/templates/${id}/test`, { testEmail }),

  getSenderConfig: () =>
    api.get<{ senderEmail: string }>('/config/sender'),
};
