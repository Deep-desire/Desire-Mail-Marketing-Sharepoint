# AI Web & LinkedIn Search Enrichment Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated web intelligence and search scraper module (`backend/src/webSearch.js`) that extracts real-time company website content (meta descriptions, main products/services, tech focus) and LinkedIn metadata for each recipient, feeding enriched context into Azure OpenAI (`gpt-4o`) for hyper-personalized outreach draft generation.

**Architecture:** 
1. Create `backend/src/webSearch.js` using `axios`, `cheerio`, and search fallback to automatically scrape company websites (meta titles, description, about us summaries, tech stack cues) and LinkedIn public handles.
2. Integrate `webSearch.js` into `backend/src/ai.js` so `generateRecipientDraft` automatically enriches contact row context prior to calling Azure OpenAI (`gpt-4o`).
3. Update frontend preview modal ([SharePointContacts.tsx](file:///c:/Desire-Mail-Marketing-Sharepoint/frontend/src/pages/SharePointContacts.tsx)) and delivery log ([CampaignDetails.tsx](file:///c:/Desire-Mail-Marketing-Sharepoint/frontend/src/pages/CampaignDetails.tsx)) to display scraped web intelligence badges alongside recipient drafts.

**Tech Stack:** Node.js, Axios, Cheerio (HTML parsing), Azure OpenAI (`gpt-4o`), React, TypeScript.

---

## Global Constraints

- SENDER BRANDING: Meet Modi, Senior Technology Consultant | Desire InfoWeb (meet@desireinfoweb.in, https://desireinfoweb.com).
- FAIL-SAFE: 6-second timeout for web scraping so offline/protected target websites never block email generation.

---

## Task 1: Install `cheerio` & Create `backend/src/webSearch.js`

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/webSearch.js`
- Test: `backend/test_webSearch.js`

- [ ] **Step 1: Install `cheerio` in backend**
  Add `"cheerio": "^1.0.0-rc.12"` to `backend/package.json` dependencies.

- [ ] **Step 2: Create `backend/src/webSearch.js` module**
  Implement HTML scraper and metadata parser for company website and search snippets:
  ```javascript
  const axios = require('axios');
  const cheerio = require('cheerio');

  async function scrapeWebsiteInfo(url) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return null;
    try {
      const res = await axios.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 6000
      });
      const $ = cheerio.load(res.data);
      const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '';
      const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
      
      const headings = [];
      $('h1, h2').slice(0, 5).each((_, el) => {
        const text = $(el).text().trim().replace(/\s+/g, ' ');
        if (text && text.length > 5 && text.length < 120) headings.push(text);
      });

      return {
        url,
        title,
        description,
        keyHeadings: headings.join(' | ')
      };
    } catch (err) {
      console.warn(`[WebSearch] Could not scrape ${url}: ${err.message}`);
      return null;
    }
  }

  async function enrichContactContext(contactData) {
    let websiteUrl = null;
    let linkedinUrl = null;

    for (const [key, val] of Object.entries(contactData || {})) {
      if (typeof val !== 'string') continue;
      const k = key.toLowerCase();
      if ((k.includes('website') || k.includes('site') || k.includes('domain')) && val.startsWith('http')) {
        websiteUrl = val;
      }
      if (k.includes('linkedin') && val.startsWith('http')) {
        linkedinUrl = val;
      }
    }

    const webScrape = websiteUrl ? await scrapeWebsiteInfo(websiteUrl) : null;

    return {
      ...contactData,
      _aiWebResearch: {
        websiteScraped: webScrape,
        linkedinUrl: linkedinUrl || null
      }
    };
  }

  module.exports = { enrichContactContext, scrapeWebsiteInfo };
  ```

---

## Task 2: Integrate Web Enrichment Engine into `backend/src/ai.js`

**Files:**
- Modify: `backend/src/ai.js`

- [ ] **Step 1: Import `enrichContactContext` in `ai.js`**
  ```javascript
  const { enrichContactContext } = require('./webSearch');
  ```

- [ ] **Step 2: Enrich contact context before calling Azure OpenAI (`gpt-4o`)**
  ```javascript
  const enrichedContactData = await enrichContactContext(contactData);
  ```

- [ ] **Step 3: Update system prompt to utilize `_aiWebResearch` insights**
  Instruct Azure OpenAI to reference specific products, meta descriptions, or website headings discovered in `_aiWebResearch` when drafting Meet Modi's outreach email.

---

## Task 3: Display Web Intelligence Insights in Frontend Modals

**Files:**
- Modify: `frontend/src/pages/SharePointContacts.tsx`
- Modify: `frontend/src/pages/CampaignDetails.tsx`

- [ ] **Step 1: Add Scraped Web Insights Badge to `SharePointContacts.tsx` preview modal**
  Show scraped website title, meta description, and discovered headings inside the preview modal banner.

- [ ] **Step 2: Add Web Insights badge to `CampaignDetails.tsx` recipient detail view**
  Render web intelligence tags in recipient logs.
