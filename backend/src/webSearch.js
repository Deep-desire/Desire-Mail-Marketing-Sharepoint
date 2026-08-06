const axios = require('axios');

/**
 * Performs a web search query for company website or LinkedIn details.
 * Implements a 6-second timeout and soft-fail protection.
 */
async function performGoogleSearch(query) {
  if (!query || typeof query !== 'string') return null;

  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await axios.get(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 6000
    });

    const html = response.data;
    if (!html || typeof html !== 'string') return null;

    const results = [];
    const resultRegex = /<a class="result__url"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;

    while ((match = resultRegex.exec(html)) !== null && results.length < 3) {
      const link = match[1].replace(/<[^>]+>/g, '').trim();
      const rawTitle = match[2].replace(/<[^>]+>/g, '').trim();
      const rawSnippet = match[3].replace(/<[^>]+>/g, '').trim();

      if (link && rawSnippet) {
        results.push({
          title: rawTitle,
          snippet: rawSnippet,
          link: link
        });
      }
    }

    return results.length > 0 ? results : null;
  } catch (err) {
    console.warn(`[Google/Web Search Engine] Search soft-skip for '${query}': ${err.message}`);
    return null;
  }
}

/**
 * Safely scrapes key metadata and content highlights from a prospect's company website.
 * Uses zero-dependency HTML parsing with regex and strict 6-second timeout.
 */
async function scrapeWebsiteInfo(url) {
  if (!url || typeof url !== 'string') return null;

  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 6000,
      maxRedirects: 3
    });

    const html = response.data;
    if (!html || typeof html !== 'string') return null;

    // 1. Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // 2. Extract meta description / og:description
    const descMatch = 
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i) ||
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // 3. Extract key headings (H1, H2)
    const headings = [];
    const headingRegex = /<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi;
    let match;
    while ((match = headingRegex.exec(html)) !== null && headings.length < 5) {
      const clean = match[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
      if (clean.length > 5 && clean.length < 140) {
        headings.push(clean);
      }
    }

    // 4. Extract text snippet from main paragraph
    let aboutSnippet = '';
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let pMatch;
    while ((pMatch = pRegex.exec(html)) !== null) {
      const clean = pMatch[1].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
      if (clean.length > 40 && clean.length < 300) {
        aboutSnippet = clean;
        break;
      }
    }

    return {
      url: targetUrl,
      title: title.substring(0, 150),
      description: description.substring(0, 300),
      keyHeadings: headings.join(' | ').substring(0, 300),
      aboutSnippet: aboutSnippet.substring(0, 300)
    };
  } catch (err) {
    console.warn(`[WebSearch Scraper] Soft-skip for '${targetUrl}': ${err.message}`);
    return null;
  }
}

/**
 * Inspects a contact row context dictionary, identifies website & LinkedIn URLs,
 * runs Google/Web searches for company & LinkedIn profile, and attaches intelligence.
 */
async function enrichContactContext(contactData) {
  if (!contactData || typeof contactData !== 'object') {
    return contactData;
  }

  let websiteUrl = null;
  let linkedinUrl = null;
  let companyName = contactData['Company Name'] || contactData.Company || contactData.company || '';
  let fullName = contactData['Full Name'] || contactData.Name || contactData.name || '';

  // Search through contactData keys for website and LinkedIn URLs
  for (const [key, val] of Object.entries(contactData)) {
    if (!val || typeof val !== 'string') continue;
    const k = key.toLowerCase();
    const valStr = val.trim();

    if ((k.includes('website') || k.includes('site') || k.includes('url') || k === 'domain') && valStr.startsWith('http') && !k.includes('linkedin')) {
      if (!websiteUrl) websiteUrl = valStr;
    }
    if ((k.includes('linkedin') || k.includes('xing')) && valStr.startsWith('http')) {
      if (!linkedinUrl) linkedinUrl = valStr;
    }
  }

  // Strategy 1: Scrape target website directly if available
  const webScrape = websiteUrl ? await scrapeWebsiteInfo(websiteUrl) : null;

  // Strategy 2: Run Google / Web search for company services & LinkedIn if companyName exists
  let googleCompanySearch = null;
  let googleLinkedinSearch = null;

  if (companyName) {
    const companyQuery = `${companyName} official website services products`;
    googleCompanySearch = await performGoogleSearch(companyQuery);
  }

  if (fullName && companyName) {
    const linkedinQuery = `${fullName} ${companyName} LinkedIn profile`;
    googleLinkedinSearch = await performGoogleSearch(linkedinQuery);
  }

  // Construct enriched object
  const enriched = {
    ...contactData,
    _aiWebResearch: {
      websiteScraped: webScrape,
      linkedinUrl: linkedinUrl || null,
      googleSearchInsights: {
        companySearchResults: googleCompanySearch,
        linkedinSearchResults: googleLinkedinSearch
      },
      scrapedAt: new Date().toISOString()
    }
  };

  return enriched;
}

module.exports = { scrapeWebsiteInfo, performGoogleSearch, enrichContactContext };
