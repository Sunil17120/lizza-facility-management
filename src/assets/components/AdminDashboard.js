import React, { useEffect, useState, useCallback } from 'react';
import { Table, Badge, Form, Container, Card, Spinner, Button, Row, Col } from 'react-bootstrap';
import { UserCog, Map as MapIcon, Save, Navigation, Settings } from 'lucide-react'; 
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Leaflet marker fix
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({ 
    iconUrl: markerIcon, 
    shadowUrl: markerShadow, 
    iconSize: [25, 41], 
    iconAnchor: [12, 41] 
});
L.Marker.prototype.options.icon = DefaultIcon;

// Component to automatically zoom map to active workers
const RecenterMap = ({ locations }) => {
  const map = useMap();
  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map(loc => [parseFloat(loc.lat), parseFloat(loc.lon)]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [locations, map]);
  return null;
};

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [geo, setGeo] = useState({ lat: 22.5726, lon: 88.3639, radius: 200 });
  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(async () => {
    try {
      // Fetch all employees
      const empRes = await fetch(`/api/admin/employees?admin_email=${adminEmail}`);
      if (empRes.ok) {
        const data = await empRes.json();
        setEmployees(data);
      }

      // Fetch live GPS coordinates from Redis
      const liveRes = await fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`);
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        setLiveLocations(liveData);
      }
      setLoading(false);
    } catch (err) {
      console.error("Fetch error:", err);
      setLoading(false);
    }
  }, [adminEmail]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleUpdate = async (originalEmail, id) => {
    const updatedData = {
      new_email: document.getElementById(`email-${id}`).value,
      shift_start: document.getElementById(`start-${id}`).value,
      shift_end: document.getElementById(`end-${id}`).value,
      user_type: document.getElementById(`type-${id}`).value,
    };

    const res = await fetch(`/api/admin/update-employee?target_email=${originalEmail}&admin_email=${adminEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });

    if (res.ok) {
      alert("Employee details updated successfully.");
      fetchData();
    } else {
      const err = await res.json();
      alert(err.detail || "Update failed");
    }
  };

  const updateOffice = async () => {
    const res = await fetch(`/api/admin/set-office?admin_email=${adminEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geo)
    });
    if (res.ok) alert("Global Office Geofence Updated!");
  };

  const isOnShift = (s, e) => {
    const now = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const endTime = e === "00:00" ? "23:59" : e;
    return s <= endTime ? (now >= s && now <= endTime) : (now >= s || now <= endTime);
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><UserCog className="me-2 text-danger" />Admin Console</h2>
        <Badge bg="dark" className="p-2 px-3">Administrator Mode</Badge>
      </div>

      <Row className="mb-5 g-4">
        {/* Global Geofence Settings */}
        <Col lg={4}>
          <Card className="border-0 shadow-sm p-4 h-100">
            <h5 className="fw-bold mb-3 d-flex align-items-center">
              <Settings className="text-danger me-2" size={20} /> Office Geofence
            </h5>
            <p className="small text-muted mb-4">Set the central coordinates for all attendance tracking.</p>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Latitude</Form.Label>
                <Form.Control type="number" value={geo.lat} onChange={e => setGeo({...geo, lat: parseFloat(e.target.value)})} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold">Longitude</Form.Label>
                <Form.Control type="number" value={geo.lon} onChange={e => setGeo({...geo, lon: parseFloat(e.target.value)})} />
              </Form.Group>
              <Form.Group className="mb-4">
                <Form.Label className="small fw-bold">Radius (Meters)</Form.Label>
                <Form.Control type="number" value={geo.radius} onChange={e => setGeo({...geo, radius: parseInt(e.target.value)})} />
              </Form.Group>
              <Button variant="danger" className="w-100 fw-bold" onClick={updateOffice}>
                SAVE OFFICE LOCATION
              </Button>
            </Form>
          </Card>
        </Col>

        {/* Live Tracking Area */}
        <Col lg={8}>
          <Card className="border-0 shadow-sm overflow-hidden h-100">
            <Card.Header className="bg-white fw-bold d-flex align-items-center gap-2 pt-3">
              <MapIcon className="text-danger" size={20} /> Live Tracking (IST)
            </Card.Header>
            <div style={{ height: '400px', width: '100%' }}>
              <MapContainer center={[20.5937, 78.9629]} zoom={5} style={{ height: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <RecenterMap locations={liveLocations} />
                {liveLocations.map((loc) => (
                  <Marker key={loc.email} position={[parseFloat(loc.lat), parseFloat(loc.lon)]}>
                    <Popup>
                      <div className="text-dark">
                        <strong>{loc.name}</strong><br/>
                        <span className="small text-muted">{loc.email}</span>
                        <div className="mt-1 text-success small">● Active Now</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          </Card>
        </Col>
      </Row>

      {/* User Management Table */}
      <Card className="border-0 shadow-sm p-4">
        <h5 className="fw-bold mb-4 d-flex align-items-center">
          <Navigation className="text-danger me-2" size={20} /> User Directory & Roles
        </h5>
        <Table responsive hover className="align-middle">
          <thead className="table-light">
            <tr className="small text-uppercase text-muted">
              <th>Full Name</th>
              <th>Email</th>
              <th>Shift (24H)</th>
              <th>Role</th>
              <th>Status</th>
              <th className="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td><span className="fw-bold">{emp.full_name}</span></td>
                <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} className="bg-light border-0" /></td>
                <td>
                  <div className="d-flex gap-1">
                    <Form.Control size="sm" defaultValue={emp.shift_start} id={`start-${emp.id}`} className="bg-light border-0 text-center" />
                    <Form.Control size="sm" defaultValue={emp.shift_end} id={`end-${emp.id}`} className="bg-light border-0 text-center" />
                  </div>
                </td>
                <td>
                  {/* Updated Role Select to include 'manager' */}
                  <Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} disabled={emp.email === adminEmail} className="bg-light border-0">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </Form.Select>
                </td>
                <td>
                  <Badge bg={isOnShift(emp.shift_start, emp.shift_end) ? "success" : "secondary"}>
                    {isOnShift(emp.shift_start, emp.shift_end) ? "ON SHIFT" : "OFF SHIFT"}
                  </Badge>
                </td>
                <td className="text-center">
                  <Button variant="outline-danger" size="sm" onClick={() => handleUpdate(emp.email, emp.id)}>
                    <Save size={14} className="me-1" /> Save
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Container>
  );
};

export default AdminDashboard;