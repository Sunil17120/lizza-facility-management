import React, { useEffect, useState, useCallback } from 'react';
import { Table, Badge, Form, Container, Card, Spinner, Button } from 'react-bootstrap';
import { UserCog, Map as MapIcon, Save } from 'lucide-react'; 
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'; // Added useMap
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet marker configuration fix
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ 
    iconUrl: markerIcon, 
    shadowUrl: markerShadow, 
    iconSize: [25, 41], 
    iconAnchor: [12, 41] 
});
L.Marker.prototype.options.icon = DefaultIcon;

// NEW: Component to automatically zoom the map to active workers
const RecenterMap = ({ locations }) => {
  const map = useMap();
  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(loc => [parseFloat(loc.lat), parseFloat(loc.lon)]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 }); // Focuses on the "nearby area"
    }
  }, [locations, map]);
  return null;
};

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(() => {
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(data => { setEmployees(data); setLoading(false); });
    
    fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(setLiveLocations);
  }, [adminEmail]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const isOnShift = (s, e) => {
    const now = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
    return s <= e ? (now >= s && now <= e) : (now >= s || now <= e); // Midnight crossing logic
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <h2 className="fw-bold mb-4"><UserCog className="me-2 text-danger" />Admin Console</h2>
      
      <Card className="border-0 shadow-sm mb-5 overflow-hidden">
        <Card.Header className="bg-white fw-bold d-flex align-items-center gap-2 pt-3">
          <MapIcon className="text-danger" size={20} /> Live Tracking Area (IST)
        </Card.Header>
        <div style={{ height: '450px', width: '100%' }}>
          <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <RecenterMap locations={liveLocations} />
            {liveLocations.map(loc => (
              <Marker key={loc.email} position={[parseFloat(loc.lat), parseFloat(loc.lon)]}>
                <Popup>
                    <div className="text-dark">
                        <strong>{loc.name}</strong><br/>
                        <span className="small text-muted">{loc.email}</span>
                    </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </Card>

      <Table responsive hover className="shadow-sm border rounded">
        <thead className="bg-dark text-white text-center">
          <tr><th>Name</th><th>Email</th><th>Shift (24H)</th><th>Role</th><th>Status</th><th>Save</th></tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id} className="align-middle text-center">
              <td><span className="fw-bold">{emp.full_name}</span></td>
              <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} /></td>
              <td>
                <div className="d-flex gap-1">
                  <Form.Control size="sm" defaultValue={emp.shift_start} id={`start-${emp.id}`} />
                  <Form.Control size="sm" defaultValue={emp.shift_end} id={`end-${emp.id}`} />
                </div>
              </td>
              <td>
                <Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} disabled={emp.email === adminEmail}>
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </Form.Select>
              </td>
              <td><Badge bg={isOnShift(emp.shift_start, emp.shift_end) ? "success" : "secondary"}>SHIFT</Badge></td>
              <td><Button variant="outline-danger" size="sm"><Save size={14} /></Button></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Container>
  );
};

export default AdminDashboard;