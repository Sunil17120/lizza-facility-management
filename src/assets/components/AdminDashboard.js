import React, { useEffect, useState, useCallback } from 'react';
import { Table, Badge, Form, Container, Row, Col, Card, Spinner, Button } from 'react-bootstrap';
import { UserCog, Activity, Edit3, MapPin, Save } from 'lucide-react'; 

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = useCallback(() => {
    fetch(`/api/admin/employees?admin_email=${adminEmail}`).then(res => res.json()).then(data => { setEmployees(data); setLoading(false); });
    fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`).then(res => res.json()).then(setLiveLocations);
  }, [adminEmail]);

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 30000);
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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });
    if (res.ok) { alert("Updated successfully."); fetchData(); }
  };

  // FIX: Admin side shift logic
  const isOnShift = (s, e) => {
    const now = new Date().toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit' });
    return s <= e ? (now >= s && now <= e) : (now >= s || now <= e);
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>;

  return (
    <Container className="py-5 text-dark">
      <h2 className="fw-bold mb-4"><UserCog className="me-2 text-danger" />Admin Console</h2>
      <Row className="mb-5 g-4">
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white border-0 fw-bold d-flex align-items-center gap-2 pt-3 text-dark">
              <Activity className="text-danger" size={20} /> Live Tracking
            </Card.Header>
            <Card.Body className="overflow-auto" style={{maxHeight: '250px'}}>
              {liveLocations.length > 0 ? liveLocations.map(loc => (
                <div key={loc.email} className="d-flex justify-content-between align-items-center border-bottom py-2">
                  <div><div className="fw-bold small">{loc.name}</div><div className="text-muted small">{loc.email}</div></div>
                  <Badge bg="success"><MapPin size={10} /> {loc.lat.slice(0, 6)}</Badge>
                </div>
              )) : <p className="text-muted small text-center py-4">No active live tracking.</p>}
            </Card.Body>
          </Card>
        </Col>
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100 bg-danger text-white">
            <Card.Header className="bg-transparent border-0 fw-bold d-flex align-items-center gap-2 pt-3 text-white">
              <Edit3 size={20} /> Management
            </Card.Header>
            <Card.Body className="text-center">
              <div className="display-6 fw-bold">{employees.length}</div>
              <div className="small opacity-75">Personnel Registered</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Table responsive hover className="shadow-sm border rounded">
        <thead className="bg-dark text-white">
          <tr><th>Name</th><th>Email</th><th>Shift (24H)</th><th>Role</th><th>Status</th><th>Save</th></tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.id} className="align-middle">
              <td><span className="fw-bold">{emp.full_name}</span></td>
              <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} /></td>
              <td><div className="d-flex gap-1"><Form.Control size="sm" defaultValue={emp.shift_start} id={`start-${emp.id}`} /><Form.Control size="sm" defaultValue={emp.shift_end} id={`end-${emp.id}`} /></div></td>
              <td><Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} disabled={emp.email === adminEmail}><option value="employee">Employee</option><option value="guard">Guard</option><option value="admin">Admin</option></Form.Select></td>
              <td><Badge bg={isOnShift(emp.shift_start, emp.shift_end) ? "success" : "secondary"}>SHIFT</Badge></td>
              <td><Button variant="outline-danger" size="sm" onClick={() => handleUpdate(emp.email, emp.id)}><Save size={14} /></Button></td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Container>
  );
};

export default AdminDashboard;