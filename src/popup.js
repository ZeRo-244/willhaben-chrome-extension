function showProgress() {
  document.getElementById('btncontainer').style.display = 'none';
  document.querySelector('.progress-container').style.display = 'block';
}

function hideProgress() {
  document.getElementById('btncontainer').style.display = '';
  document.querySelector('.progress-container').style.display = 'none';
  document.getElementById('progress-text').innerHTML = '';
}

function createButton(searchUrl) {
  const button = document.createElement('button');
  button.textContent = 'Open Map';
  button.className = 'button';
  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'sendDataToBack', url: searchUrl });
    showProgress();
  });

  const btnContainer = document.getElementById('btncontainer');
  (btnContainer || document.body).appendChild(button);
  document.getElementById('description').style.display = 'none';
}

// Ask the content script directly whether the current page has listing data.
// Talking to the content script from the popup (rather than bouncing through
// the service worker) avoids the MV3 service-worker-asleep race that was
// dropping the response and leaving the "Open Map" button unrendered.
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'getJSONDataFromContent' }, (msg) => {
    if (chrome.runtime.lastError) return; // content script not present on this page
    if (msg && msg.found) createButton(msg.url || tab.url);
  });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'loadingDone') {
    hideProgress();
  }
  if (message.type === 'progress') {
    document.getElementById('progress-text').innerHTML = message.text;
  }
});
