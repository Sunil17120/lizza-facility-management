import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ChangeMapBounds = ({ path, stays }) => {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLngBounds([]);
    let hasBounds = false;

    if (path && path.length > 0) {
      path.forEach(p => bounds.extend([p.lat, p.lng]));
      hasBounds = true;
    }
    
    if (stays && stays.length > 0) {
      stays.forEach(s => bounds.extend([parseFloat(s.lat), parseFloat(s.lng)]));
      hasBounds = true;
    }

    if (hasBounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [path, stays, map]);
  return null;
};

const ShiftRouteMap = ({ userId }) => {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const API_BASE_URL = 'https://lizza-facility-management.vercel.app';

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/employee-route/${userId}`)
      .then(res => {
          if (!res.ok) {
              setRouteData({ error: true });
              setLoading(false);
              return;
          }
          res.json().then(data => {
              setRouteData(data);
              setLoading(false);
          });
      });
  }, [userId]);

  if (loading) {
    return <div className="p-5 text-center text-muted fw-bold">Compiling day route details...</div>;
  }

  if (routeData?.error) {
    return <div className="p-5 text-center text-danger fw-bold">No active tracking route data available for this user today.</div>;
  }

  const polylinePositions = (routeData.snapped_route_path || []).map(point => [parseFloat(point.lat), parseFloat(point.lng)]);
  const stays = routeData.site_stays || [];

  let defaultCenter = [12.9716, 77.5946];
  if (polylinePositions.length > 0) defaultCenter = polylinePositions[0];
  else if (stays.length > 0) defaultCenter = [parseFloat(stays[0].lat), parseFloat(stays[0].lng)];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '600px' }}>
      <div style={{ display: 'flex', gap: '20px', padding: '15px', background: '#f4f6f9', borderBottom: '1px solid #ddd', flexWrap: 'wrap' }}>
        <div><strong>Total Duty Time:</strong> {routeData.metrics?.total_duty_hours || 0} Hrs</div>
        <div><strong>Travel Time:</strong> {routeData.metrics?.total_travel_hours || 0} Hrs</div>
        <div><strong>Site Stay Time:</strong> {routeData.metrics?.total_stay_hours || 0} Hrs</div>
        <div><strong>Breaks:</strong> {routeData.metrics?.total_break_hours || 0} Hrs</div>
        <div><strong>Sites Visited:</strong> {stays.length}</div>
      </div>

      <div style={{ flex: 1, width: '100%', position: 'relative' }}>
        <MapContainer center={defaultCenter} zoom={13} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {polylinePositions.length > 0 && (
            <Polyline positions={polylinePositions} color="#1a73e8" weight={4} opacity={0.8} />
          )}
          
          <ChangeMapBounds path={routeData.snapped_route_path} stays={stays} />

          {stays.map((stay, idx) => {
            const sLat = parseFloat(stay.lat);
            const sLng = parseFloat(stay.lng);
            if (isNaN(sLat) || isNaN(sLng)) return null;

            return (
              <React.Fragment key={`stay-${idx}`}>
                <Circle 
                    center={[sLat, sLng]} 
                    radius={stay.radius || 200} 
                    pathOptions={{ 
                      color: stay.has_log ? '#28a745' : '#dc3545', 
                      fillColor: stay.has_log ? '#28a745' : '#dc3545', 
                      fillOpacity: 0.25,
                      weight: 2
                    }} 
                />
                <Marker position={[sLat, sLng]}>
                  <Popup>
                    <div style={{ fontSize: '14px', minWidth: '200px' }}>
                      <h5 style={{ margin: '0 0 8px 0', color: '#1a73e8', borderBottom: '1px solid #eee', paddingBottom: '4px' }}>
                        {stay.name}
                      </h5>
                      <div style={{ marginBottom: '4px' }}><strong>Arrival:</strong> {stay.arrival}</div>
                      <div style={{ marginBottom: '4px' }}><strong>Departure:</strong> {stay.departure}</div>
                      <div style={{ marginBottom: '8px' }}><strong>Stay Duration:</strong> {stay.duration_mins} Minutes</div>
                      
                      <div style={{ 
                        padding: '6px', 
                        borderRadius: '4px', 
                        backgroundColor: stay.has_log ? '#d4edda' : '#f8d7da',
                        color: stay.has_log ? '#155724' : '#721c24',
                        fontWeight: 'bold',
                        textAlign: 'center'
                      }}>
                        {stay.has_log ? '✅ Visit Log Recorded' : '❌ No Evidence Uploaded'}
                      </div>
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