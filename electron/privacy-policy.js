/** Pure privacy rules for isolated Chromium tabs. Kept free of Electron for unit tests. */

const TRACKER_SUFFIXES = [
  'doubleclick.net', 'google-analytics.com', 'googletagmanager.com',
  'googleadservices.com', 'googlesyndication.com', 'facebook.net',
  'amazon-adsystem.com', 'scorecardresearch.com', 'chartbeat.com',
  'hotjar.com', 'mouseflow.com', 'fullstory.com', 'clarity.ms',
  'segment.io', 'segment.com', 'mixpanel.com', 'amplitude.com',
  'branch.io', 'appsflyer.com', 'adjust.com', 'criteo.com',
  'adnxs.com', 'rubiconproject.com', 'pubmatic.com', 'openx.net',
];

const parse = value => {
  try { return new URL(value); } catch { return null; }
};

const hostMatches = (host, suffix) => host === suffix || host.endsWith(`.${suffix}`);

// A small site-key heuristic for request isolation, not a public-suffix dependency.
// Common multi-part public suffixes are handled explicitly to avoid cross-site cookies.
function siteKey(value) {
  const url = parse(value);
  if (!url || !url.hostname) return null;
  if (url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(':')) return url.hostname;
  const parts = url.hostname.toLowerCase().split('.').filter(Boolean);
  const multiPart = /^(co|com|net|org|gov|ac)\.[a-z]{2}$/.test(parts.slice(-2).join('.'));
  return parts.slice(multiPart ? -3 : -2).join('.');
}

function isThirdParty(url, documentUrl) {
  const targetSite = siteKey(url);
  const documentSite = siteKey(documentUrl);
  return !!(targetSite && documentSite && targetSite !== documentSite);
}

function isTracker(url, documentUrl) {
  if (!isThirdParty(url, documentUrl)) return false;
  const target = parse(url);
  if (!target) return false;
  return TRACKER_SUFFIXES.some(suffix => hostMatches(target.hostname.toLowerCase(), suffix));
}

function documentForDetails(details) {
  return details.documentURL || details.originURL || details.referrer || '';
}

function shouldBlockRequest(details, shields) {
  if (!shields?.trackers || details.resourceType === 'mainFrame') return null;
  const documentUrl = documentForDetails(details);
  return isTracker(details.url, documentUrl) ? 'tracker' : null;
}

function shouldStripCookie(details, shields) {
  if (!shields?.thirdPartyCookies || details.resourceType === 'mainFrame') return false;
  return isThirdParty(details.url, documentForDetails(details));
}

function removeHeader(headers, name) {
  const lower = name.toLowerCase();
  let removed = false;
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
      removed = true;
    }
  }
  return removed;
}

module.exports = {
  TRACKER_SUFFIXES,
  siteKey,
  isThirdParty,
  isTracker,
  shouldBlockRequest,
  shouldStripCookie,
  removeHeader,
};
