chrome.runtime.sendMessage({ type: 'newTabLoaded' },(resp)=>{
  loadMapData(resp);
});

function loadMapData(data)
{
  if (!data || data.length === 0) {
    document.getElementById('map').textContent = 'Keine Inserate mit Koordinaten gefunden.';
    return;
  }
  let coordinates = data.map((elem)=>elem.coordinates.split(","))
  // Create map
  const map = L.map('map').setView(coordinates[0], 10); // Set initial view to first coordinate
  // OSM's volunteer tile servers block browser-extension traffic, and CARTO's
  // basemaps now watermark keyless use ("API KEY REQUIRED"). Esri's ArcGIS
  // World Street Map raster tiles are keyless and unwatermarked.
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, HERE, Garmin, &copy; OpenStreetMap contributors'
  }).addTo(map);
  
  // Add markers
  data.forEach(datapoint => {
    const marker = L.marker(datapoint.coordinates.split(",")).addTo(map);
    marker.bindPopup(`
    <div class="tooltip-container">
      <img src="${datapoint.imageUrl}" class="tooltip-img">
      <div class="tooltip-content">
        <div class="tooltip-title">${datapoint.description}</div>
        <div class="tooltip-price">${datapoint.price}</div>
        <a href="${datapoint.detailUrl}" class="tooltip-link" target="_blank">Mehr Information</a>
      </div>
    </div>
  `,{ maxWidth : 300});
  
  });
}