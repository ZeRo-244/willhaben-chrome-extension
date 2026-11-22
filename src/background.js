// Extract the willhaben search JSON from a page's HTML.
// Inlined (instead of require('./common.js')) so this service worker can run
// unbundled — no webpack step needed to drop it into an unpacked extension.
function extractJSONFromHTML(html) {
  try {
    const jsonStart = html.indexOf('<script id="__NEXT_DATA__"');
    const jsonEnd = html.indexOf('</script>', jsonStart);
    const jsonDataString = html.slice(jsonStart, jsonEnd);
    const jsonData = JSON.parse(jsonDataString.match(/{.*}/)[0]);
    return jsonData.props.pageProps.searchResult;
  } catch (error) {
    console.error('Error getting JSON:', error);
    return null;
  }
}

const maxRowRequest = 200;
let latestScrapedData;

// Single, non-async message listener. An async listener returns a Promise,
// which in current Chrome can hijack/close the response channel of a sibling
// listener before it responds. Keeping this synchronous avoids that.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'sendDataToBack') {
    scrapeDataAndOpenMap(message.url);
    return;
  }
  if (message.type === 'newTabLoaded') {
    sendResponse(latestScrapedData);
    return;
  }
});

async function scrapeDataAndOpenMap(searchUrl) {
  try {
    const initMaxRowFirstPageURL = replacePageParameter(replaceRowParameter(searchUrl, maxRowRequest), 1);
    const initialJSON = extractJSONFromHTML(await fetchPage(initMaxRowFirstPageURL));
    const totalPages = Math.ceil(initialJSON.rowsFound / initialJSON.rowsRequested);
    const pageUrls = Array.from({ length: totalPages }, (_, i) => replacePageParameter(initMaxRowFirstPageURL, i + 1));

    notifyPopup({ type: 'progress', text: '1 / ' + totalPages });

    const fetchedData = [];
    fetchedData.push(initialJSON);
    for (let i = 1; i < pageUrls.length; i++) {
      const html = await fetchPage(pageUrls[i]);
      const extractedData = extractJSONFromHTML(html);
      if (extractedData) {
        fetchedData.push(extractedData);
      }
      notifyPopup({ type: 'progress', text: i + ' / ' + totalPages });
    }

    let mergedData = mergeData(fetchedData);

    mergedData = mergedData.filter(item => item.attributes.attribute.filter(e => e.name == 'PRICE_FOR_DISPLAY')[0]);
    mergedData = mergedData.filter(item => item.contextLinkList.contextLink.filter((e) => e.id == 'iadShareLink')[0]);
    const coordinates = await resolveCoordinates(mergedData);
    const dataToSend = mergedData
      .filter(item => coordinates[item.id])
      .map(item => ({
        coordinates: coordinates[item.id],
        imageUrl: item.advertImageList.advertImage.length > 0 ? item.advertImageList.advertImage[0].mainImageUrl : '',
        detailUrl: item.contextLinkList.contextLink.filter((e) => e.id == 'iadShareLink')[0].uri,
        price: item.attributes.attribute.filter((e) => e.name == 'PRICE_FOR_DISPLAY')[0].values[0],
        description: item.description
      }));
    openMap(dataToSend);
  } catch (error) {
    console.log('Error fetching Data', error);
  }
  notifyPopup({ type: 'loadingDone' });
}

// willhaben's search results no longer carry the COORDINATES attribute; only the
// ad detail page does. Use the search attribute when present, else a cached value,
// else fetch the detail page. Coordinates are cached per ad id in storage.local.
const detailConcurrency = 8;
const coordCacheKey = 'coordCache';

function searchCoordinates(item) {
  const attr = item.attributes.attribute.find(e => e.name == 'COORDINATES');
  return attr ? attr.values[0] : null;
}

async function fetchDetailCoordinates(item) {
  const url = item.contextLinkList.contextLink.find(e => e.id == 'iadShareLink').uri;
  const html = await fetchPage(url);
  const match = html && html.match(/"name":"COORDINATES","values":\["([^"]+)"/);
  return match ? match[1] : null;
}

async function resolveCoordinates(items) {
  const cache = (await chrome.storage.local.get(coordCacheKey))[coordCacheKey] || {};
  const result = {};
  const missing = [];
  for (const item of items) {
    const coords = searchCoordinates(item) || cache[item.id];
    if (coords) result[item.id] = coords;
    else missing.push(item);
  }

  let done = 0;
  let next = 0;
  async function worker() {
    while (next < missing.length) {
      const item = missing[next++];
      const coords = await fetchDetailCoordinates(item);
      if (coords) result[item.id] = cache[item.id] = coords;
      done++;
      notifyPopup({ type: 'progress', text: 'Koordinaten ' + done + ' / ' + missing.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(detailConcurrency, missing.length) }, worker));

  if (missing.length) await chrome.storage.local.set({ [coordCacheKey]: cache });
  return result;
}

async function fetchPage(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return html;
  } catch (error) {
    console.error('Error fetching page:', error);
    return null;
  }
}

function replacePageParameter(url, page) {
  const urlObject = new URL(url);
  urlObject.searchParams.set('page', page);
  return urlObject.toString();
}

function replaceRowParameter(url, rows) {
  const urlObject = new URL(url);
  urlObject.searchParams.set('rows', rows);
  return urlObject.toString();
}

function mergeData(dataArray) {
  return dataArray.flatMap((x) => x.advertSummaryList.advertSummary);
}

function showNotification() {
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: 'red' });
}

function clearNotification() {
  chrome.action.setBadgeText({ text: '' });
}

// Keep the toolbar badge in sync with whether the current tab is a willhaben
// search page that has listing data.
function refreshBadgeForTab(tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'getJSONDataFromContent' }, (msg) => {
    if (chrome.runtime.lastError || !msg || !msg.found) {
      clearNotification();
    } else {
      showNotification();
    }
  });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  refreshBadgeForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    refreshBadgeForTab(tabId);
  }
});

function openMap(data) {
  latestScrapedData = data;
  const url = chrome.runtime.getURL('map.html');
  chrome.tabs.create({ url: url });
}

// Progress updates go to the popup, which may already be closed; ignore the
// resulting "Receiving end does not exist" rejection.
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}
