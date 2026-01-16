import React, { useEffect, useState } from 'react';
import { Table, Badge, Form, Container, Row, Col, Card, Spinner, Button } from 'react-bootstrap';
import { UserCog, Lock, Activity, Edit3, MapPin, Save } from 'lucide-react';

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const adminEmail = localStorage.getItem('userEmail');

  const fetchData = () => {
    setLoading(true);
    // Fetch Employees
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(data => { setEmployees(data); setLoading(false); });
    
    // Fetch Live Tracking (Redis)
    fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(setLiveLocations);
  };

  useEffect(() => { fetchData(); }, [adminEmail]);

  const handleUpdate = async (email, updatedData) => {
    const res = await fetch(`/api/admin/update-employee?target_email=${email}&admin_email=${adminEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });
    if (res.ok) fetchData();
  };

  const isOnShift = (start, end) => {
    const now = new Date().toTimeString().slice(0, 5);
    return now >= start && now <= end;
  };

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4"><UserCog className="me-2 text-danger" />Admin Console</h2>

      <Row className="mb-5 g-4">
        {/* Card 1: Live Tracking */}
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100">
            <Card.Header className="bg-white border-0 fw-bold d-flex align-items-center gap-2 pt-3">
              <Activity className="text-danger" size={20} /> Live Employee Tracking
            </Card.Header>
            <Card.Body className="overflow-auto" style={{maxHeight: '250px'}}>
              {liveLocations.length > 0 ? liveLocations.map(loc => (
                <div key={loc.email} className="d-flex justify-content-between align-items-center border-bottom py-2">
                  <div>
                    <div className="fw-bold small">{loc.name}</div>
                    <div className="text-muted" style={{fontSize: '10px'}}>{loc.email}</div>
                  </div>
                  <Badge bg="success" className="d-flex align-items-center gap-1">
                    <MapPin size={10} /> {loc.lat.slice(0, 6)}, {loc.lon.slice(0, 6)}
                  </Badge>
                </div>
              )) : <p className="text-muted small text-center py-4">No employees currently on active shift.</p>}
            </Card.Body>
          </Card>
        </Col>

        {/* Card 2: Quick Management Stats */}
        <Col md={6}>
          <Card className="border-0 shadow-sm h-100 bg-danger text-white">
            <Card.Header className="bg-transparent border-0 fw-bold d-flex align-items-center gap-2 pt-3">
              <Edit3 size={20} /> Database Overview
            </Card.Header>
            <Card.Body>
              <Row className="text-center">
                <Col xs={6} className="border-end">
                  <div className="display-6 fw-bold">{employees.length}</div>
                  <div className="small opacity-75">Total Personnel</div>
                </Col>
                <Col xs={6}>
                  <div className="display-6 fw-bold">
                    {employees.filter(e => isOnShift(e.shift_start, e.shift_end)).length}
                  </div>
                  <div className="small opacity-75">Currently On-Shift</div>
                </Col>
              </Row>
              <p className="mt-4 small opacity-75">Update shift, role, and mail id directly in the table below. Changes sync instantly to PostgreSQL.</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {loading ? <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div> : (
        <Table responsive hover className="shadow-sm border rounded">
          <thead className="bg-dark text-white">
            <tr>
              <th>Employee</th>
              <th>Email Address</th>
              <th>Shift Hours</th>
              <th>Designation</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.email} className="align-middle">
                <td><div className="fw-bold">{emp.full_name}</div></td>
                <td><Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} /></td>
                <td>
                  <div className="d-flex gap-1 align-items-center">
                    <Form.Control size="sm" style={{width: '70px'}} defaultValue={emp.shift_start} id={`start-${emp.id}`} />
                    <span className="small text-muted">-</span>
                    <Form.Control size="sm" style={{width: '70px'}} defaultValue={emp.shift_end} id={`end-${emp.id}`} />
                  </div>
                </td>
                <td>
                  <Form.Select size="sm" defaultValue={emp.user_type} id={`type-${emp.id}`} disabled={emp.user_type === 'admin'}>
                    <option value="employee">Employee</option>
                    <option value="official staff">Official Staff</option>
                    <option value="guard">Guard</option>
                    <option value="admin">Admin</option>
                  </Form.Select>
                </td>
                <td>
                  <Badge bg={isOnShift(emp.shift_start, emp.shift_end) ? "success" : "secondary"}>
                    {isOnShift(emp.shift_start, emp.shift_end) ? "ON SHIFT" : "OFF SHIFT"}
                  </Badge>
                </td>
                <td>
                  <Button variant="outline-danger" size="sm" onClick={() => handleUpdate(emp.email, {
                    email: document.getElementById(`email-${emp.id}`).value,
                    shift_start: document.getElementById(`start-${emp.id}`).value,
                    shift_end: document.getElementById(`end-${emp.id}`).value,
                    user_type: document.getElementById(`type-${emp.id}`).value,
                  })}>
                    <Save size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Container>
  );
};

export default AdminDashboard;