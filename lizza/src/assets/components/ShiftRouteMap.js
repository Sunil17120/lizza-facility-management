import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet marker icons if needed elsewhere
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Auto-adjusts the map zoom to fit both the driving route and the sites
const ChangeMapBounds = ({ path, locations }) => {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    let hasBounds = false;

    if (path && path.length > 0) {
      path.forEach(p => bounds.extend([p.lat, p.lng]));
      hasBounds = true;
    }
    
    if (locations && locations.length > 0) {
      locations.forEach(s => bounds.extend([parseFloat(s.lat), parseFloat(s.lon || s.lng)]));
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [path, locations, map]);
  return null;
};

// Generates custom HTML markers based on visit status
const getCustomIcon = (status) => {
    let bgColor = '#6c757d'; // Unvisited (Gray)
    let iconText = '⚪';

    if (status === 'LOGGED') {
        bgColor = '#28a745'; // Visited & Logged (Green)
        iconText = '✅';
    } else if (status === 'NO_LOG') {
        bgColor = '#ffc107'; // Visited but no log (Yellow)
        iconText = '⚠️';
    }

    return L.divIcon({
        html: `<div style="
            background-color: ${bgColor};
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            border-radius: 50%; border: 3px solid white;
            box-shadow: 0 3px 6px rgba(0,0,0,0.4);
            font-size: 14px;
        ">${iconText}</div>`,
        className: 'custom-site-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
};

const ShiftRouteMap = ({ userId }) => {
  const [routeData, setRouteData] = useState(null);
  const [allSites, setAllSites] = useState([]);
  const [loading, setLoading] = useState(true);

  const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";

  // Fetch BOTH the officer's specific route AND all company locations
  useEffect(() => {
    Promise.all([
        fetch(`${API_BASE_URL}/api/admin/employee-route/${userId}`).then(res => {
            if (!res.ok) throw new Error("No route data");
            return res.json();
        }),
        fetch(`${API_BASE_URL}/api/admin/locations`).then(res => res.ok ? res.json() : [])
    ])
    .then(([route, sites]) => {
        setRouteData(route);
        setAllSites(sites);
        setLoading(false);
    })
    .catch(() => {
        setRouteData({ error: true });
        setLoading(false);
    });
  }, [userId]);

  if (loading) {
    return <div className="p-5 text-center text-muted fw-bold">Compiling day route and site details...</div>;
  }

  if (routeData?.error) {
    return <div className="p-5 text-center text-danger fw-bold">No active tracking route data available for this user today.</div>;
  }

  const polylinePositions = (routeData.snapped_route_path || []).map(point => [parseFloat(point.lat), parseFloat(point.lng)]);
  const stays = routeData.site_stays || [];

  let defaultCenter = [12.9716, 77.5946];
  if (polylinePositions.length > 0) defaultCenter = polylinePositions[0];
  else if (allSites.length > 0) defaultCenter = [parseFloat(allSites[0].lat), parseFloat(allSites[0].lon)];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '600px' }}>
      
      {/* Metrics & Legend Header */}
      <div style={{ display: 'flex', gap: '20px', padding: '15px', background: '#f8f9fa', borderBottom: '1px solid #dee2e6', flexWrap: 'wrap', alignItems: 'center' }}>
        <div><strong>Total Duty:</strong> {routeData.metrics?.total_duty_hours || 0} Hrs</div>
        <div><strong>Travel Time:</strong> {routeData.metrics?.total_travel_hours || 0} Hrs</div>
        <div><strong>Stay Time:</strong> {routeData.metrics?.total_stay_hours || 0} Hrs</div>
        <div><strong>Sites Visited:</strong> {stays.length} / {allSites.length}</div>
        
        {/* Map Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', fontSize: '12px', fontWeight: 'bold' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{width:'12px', height:'12px', background:'#28a745', borderRadius:'50%'}}></div> Visited (Logged)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{width:'12px', height:'12px', background:'#ffc107', borderRadius:'50%'}}></div> Visited (No Evidence)</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{width:'12px', height:'12px', background:'#6c757d', borderRadius:'50%'}}></div> Unvisited</span>
        </div>
      </div>

      {/* Map Container */}
      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        <MapContainer center={defaultCenter} zoom={13} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {polylinePositions.length > 0 && (
            <Polyline positions={polylinePositions} color="#1a73e8" weight={4} opacity={0.8} />
          )}
          
          <ChangeMapBounds path={routeData.snapped_route_path} locations={allSites} />

          {/* Map through ALL sites, classifying them by visit status */}
          {allSites.map((site, idx) => {
            const sLat = parseFloat(site.lat);
            const sLng = parseFloat(site.lon);
            if (isNaN(sLat) || isNaN(sLng)) return null;

            // Find if the officer visited this specific site today
            const matchingStay = stays.find(s => s.name === site.name);
            
            let status = 'UNVISITED';
            let circleColor = '#6c757d'; // Gray

            if (matchingStay) {
                if (matchingStay.has_log) {
                    status = 'LOGGED';
                    circleColor = '#28a745'; // Green
                } else {
                    status = 'NO_LOG';
                    circleColor = '#ffc107'; // Yellow
                }
            }

            return (
              <React.Fragment key={`site-${idx}`}>
                <Circle 
                    center={[sLat, sLng]} 
                    radius={site.radius || 200} 
                    pathOptions={{ 
                      color: circleColor, 
                      fillColor: circleColor, 
                      fillOpacity: status === 'UNVISITED' ? 0.1 : 0.3,
                      weight: status === 'UNVISITED' ? 1 : 2,
                      dashArray: status === 'UNVISITED' ? '5, 5' : null // Dotted line for unvisited
                    }} 
                />
                
                <Marker position={[sLat, sLng]} icon={getCustomIcon(status)}>
                  <Popup>
                    <div style={{ fontSize: '14px', minWidth: '220px' }}>
                      <h5 style={{ margin: '0 0 8px 0', color: circleColor, borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                        {site.name}
                      </h5>
                      
                      {matchingStay ? (
                          <>
                              <div style={{ marginBottom: '4px' }}><strong>Arrival:</strong> {matchingStay.arrival}</div>
                              <div style={{ marginBottom: '4px' }}><strong>Departure:</strong> {matchingStay.departure}</div>
                              <div style={{ marginBottom: '8px' }}><strong>Stay Duration:</strong> {matchingStay.duration_mins} Minutes</div>
                              
                              <div style={{ 
                                padding: '6px', borderRadius: '4px', textAlign: 'center', fontWeight: 'bold',
                                backgroundColor: matchingStay.has_log ? '#d4edda' : '#fff3cd',
                                color: matchingStay.has_log ? '#155724' : '#856404'
                              }}>
                                {matchingStay.has_log ? '✅ Visit Evidence Recorded' : '⚠️ Ghost Stay (No Evidence)'}
                              </div>
                          </>
                      ) : (
                          <div style={{ padding: '15px 10px', textAlign: 'center', color: '#6c757d', fontStyle: 'italic' }}>
                              Not visited by officer today.
                          </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default ShiftRouteMap;