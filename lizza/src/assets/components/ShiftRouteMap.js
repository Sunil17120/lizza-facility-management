import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ChangeMapBounds = ({ path }) => {
  const map = useMap();
  useEffect(() => {
    if (path && path.length > 0) {
      const bounds = L.latLngBounds(path.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [path, map]);
  return null;
};

const ShiftRouteMap = ({ userId }) => {
  const [routeData, setRouteData] = useState(null);
  const [loading, setLoading] = useState(true);
  const API_BASE_URL = 'https://lizza-facility-management.vercel.app';

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/admin/employee-route/${userId}`)
      .then(res => {
          if (!res.ok) throw new Error("No route data found");
          return res.json();
      })
      .then(data => {
        setRouteData(data);
        setLoading(false);
      })
      .catch(err => {
        setRouteData({ error: true });
        setLoading(false);
      });
  }, [userId]);

  if (loading) {
    return <div className="p-5 text-center text-muted fw-bold">Compiling day route details...</div>;
  }

  if (routeData?.error) {
    return <div className="p-5 text-center text-danger fw-bold">No active tracking route data available for this user today.</div>;
  }

  const polylinePositions = routeData.snapped_route_path.map(point => [point.lat, point.lng]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '600px' }}>
      <div style={{ display: 'flex', gap: '20px', padding: '15px', background: '#f4f6f9', borderBottom: '1px solid #ddd' }}>
        <div><strong>Total Travel:</strong> {routeData.metrics.total_travel_hours} Hours</div>
        <div><strong>Total Stay:</strong> {routeData.metrics.total_stay_hours} Hours</div>
        <div><strong>Sites Visited:</strong> {routeData.site_stays.length}</div>
      </div>

      <div style={{ flex: 1, width: '100%' }}>
        <MapContainer center={[12.9716, 77.5946]} zoom={13} style={{ width: '100%', height: '100%' }}>
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {polylinePositions.length > 0 && (
            <>
              <Polyline positions={polylinePositions} color="#1a73e8" weight={4} opacity={0.8} />
              <ChangeMapBounds path={routeData.snapped_route_path} />
            </>
          )}

          {routeData.site_stays.map((stay, idx) => (
            <Marker key={idx} position={[stay.lat, stay.lng]}>
              <Popup>
                <div style={{ fontSize: '14px', maxWidth: '250px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#1a73e8' }}>Site Stay Detected</h4>
                  <p style={{ margin: '0 0 10px 0', fontWeight: 'bold' }}>{stay.address}</p>
                  <strong>Arrival:</strong> {stay.arrival}<br />
                  <strong>Departure:</strong> {stay.departure}<br />
                  <strong>Duration:</strong> {stay.duration_mins} Minutes
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
};

export default ShiftRouteMap;