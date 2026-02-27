import React, { useState, useEffect, useCallback } from 'react';
import { Container, Card, Row, Col, Badge, Table, Modal, Spinner, InputGroup, Form, Button, Alert } from 'react-bootstrap';
import { Users, Map as MapIcon, ShieldCheck, Search, UserPlus } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import EmployeeOnboardForm from './EmployeeOnboardForm'; 
import 'leaflet/dist/leaflet.css';

const ManagerDashboard = () => {
  const [myEmployees, setMyEmployees] = useState([]);
  const [locations, setLocations] = useState([]); 
  const [liveStaff, setLiveStaff] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const managerId = localStorage.getItem('userId'); 

  const fetchData = useCallback(async () => {
    if (!managerId) { setLoading(false); return; }
    try {
        const cleanId = parseInt(managerId, 10);
        const [staffRes, liveRes, locRes] = await Promise.all([
            fetch(`/api/manager/my-employees?manager_id=${cleanId}`),
            fetch(`/api/manager/live-tracking?manager_id=${cleanId}`),
            fetch(`/api/admin/locations`)
        ]);
        if (staffRes.ok) setMyEmployees(await staffRes.json());
        if (locRes.ok) setLocations(await locRes.json());
        if (liveRes.ok) {
            const liveData = await liveRes.json();
            const liveMap = {};
            liveData.forEach(loc => { liveMap[loc.email] = loc; });
            setLiveStaff(liveMap);
        }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [managerId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="text-center py-5"><Spinner animation="grow" variant="danger" /></div>;

  return (
    <Container className="py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0"><Users className="me-2 text-danger" />Manager Panel</h2>
        <Button variant="danger" onClick={() => setShowAddEmp(true)}><UserPlus size={18} className="me-2"/> Onboard Staff</Button>
      </div>
      
      <Row className="g-4">
        <Col lg={12}>
          <Card className="border-0 shadow-sm overflow-hidden" style={{ height: '400px' }}>
            <MapContainer center={[22.5726, 88.3639]} zoom={5} style={{ height: '100%' }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {locations.map(loc => (
                  <Circle key={loc.id} center={[loc.lat, loc.lon]} radius={loc.radius} pathOptions={{ color: 'red' }} />
              ))}
              {Object.entries(liveStaff).map(([email, data]) => (
                  <Marker key={email} position={[data.lat, data.lon]}>
                      <Popup>{data.name} - {data.present ? "Inside" : "Outside"}</Popup>
                  </Marker>
              ))}
            </MapContainer>
          </Card>
        </Col>

        <Col md={12}>
          <Card className="border-0 shadow-sm p-4">
            <h5 className="fw-bold mb-3"><ShieldCheck className="text-success me-2" /> Team Attendance</h5>
            <Table responsive hover className="align-middle mb-0">
              <thead className="table-light">
                <tr><th>Employee</th><th>Site</th><th>Geofence</th><th>Status</th></tr>
              </thead>
              <tbody>
                {myEmployees.filter(e => e.full_name?.toLowerCase().includes(empSearch.toLowerCase())).map(emp => (
                    <tr key={emp.id}>
                        <td className="fw-bold">{emp.full_name}</td>
                        <td>{locations.find(l => l.id === emp.location_id)?.name || 'Unassigned'}</td>
                        <td>
                            {liveStaff[emp.email] ? (
                                <Badge bg={liveStaff[emp.email].present ? "success" : "danger"}>
                                    {liveStaff[emp.email].present ? "Inside" : "Outside"}
                                </Badge>
                            ) : "Offline"}
                        </td>
                        <td>{emp.is_present ? "Present" : "Absent"}</td>
                    </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </Col>
      </Row>

      <Modal show={showAddEmp} onHide={() => setShowAddEmp(false)} size="lg" centered>
        <Modal.Header closeButton className="bg-light"><Modal.Title className="h5 fw-bold">Team Onboarding</Modal.Title></Modal.Header>
        <Modal.Body className="p-4">
            <EmployeeOnboardForm locations={locations} onCancel={() => setShowAddEmp(false)} onSuccess={() => { setShowAddEmp(false); fetchData(); }} />
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default ManagerDashboard;