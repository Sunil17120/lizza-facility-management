import React, { useEffect, useState, useCallback } from 'react';
import { Table, Badge, Form, Container, Row, Col, Card, Spinner, Button } from 'react-bootstrap';
// 'Lock' removed to fix eslint 'no-unused-vars'
import { UserCog, Activity, Edit3, MapPin, Save } from 'lucide-react'; 

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [liveLocations, setLiveLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const adminEmail = localStorage.getItem('userEmail');

  // Wrapped in useCallback to fix eslint 'react-hooks/exhaustive-deps'
  const fetchData = useCallback(() => {
    setLoading(true);
    // Fetch all employees from PostgreSQL
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(data => { 
        setEmployees(data); 
        setLoading(false); 
      })
      .catch((err) => {
        console.error("Employee fetch error:", err);
        setLoading(false);
      });
    
    // Fetch live data from Redis
    fetch(`/api/admin/live-tracking?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(setLiveLocations)
      .catch((err) => console.error("Live tracking fetch error:", err));
  }, [adminEmail]);

  useEffect(() => { 
    fetchData(); 
    // Refresh live locations every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleUpdate = async (email, updatedData) => {
    const res = await fetch(`/api/admin/update-employee?target_email=${email}&admin_email=${adminEmail}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });
    if (res.ok) {
      alert("Employee data updated successfully.");
      fetchData();
    } else {
      alert("Failed to update employee.");
    }
  };

  const isOnShift = (start, end) => {
    const now = new Date().toTimeString().slice(0, 5);
    return now >= start && now <= end;
  };

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4"><UserCog className="me-2 text-danger" />Admin Console</h2>

      <Row className="mb-5 g-4">
        {/* Card 1: Live Location Tracking (Redis-based) */}
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

        {/* Card 2: Database & Shift Management Summary */}
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
              <p className="mt-4 small opacity-75">Edit shift hours, email IDs, and roles below. All changes are saved directly to the database.</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="danger" /></div>
      ) : (
        <Table responsive hover className="shadow-sm border rounded overflow-hidden">
          <thead className="bg-dark text-white">
            <tr>
              <th>Employee</th>
              <th>Email ID</th>
              <th>Shift Hours (24H)</th>
              <th>Role</th>
              <th>Status</th>
              <th>Save</th>
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.email} className="align-middle">
                <td><div className="fw-bold">{emp.full_name}</div></td>
                <td>
                  <Form.Control size="sm" defaultValue={emp.email} id={`email-${emp.id}`} />
                </td>
                <td>
                  <div className="d-flex gap-1 align-items-center">
                    <Form.Control size="sm" style={{width: '75px'}} defaultValue={emp.shift_start || "09:00"} id={`start-${emp.id}`} />
                    <span className="small text-muted">-</span>
                    <Form.Control size="sm" style={{width: '75px'}} defaultValue={emp.shift_end || "18:00"} id={`end-${emp.id}`} />
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
                  <Button 
                    variant="outline-danger" 
                    size="sm" 
                    onClick={() => handleUpdate(emp.email, {
                      email: document.getElementById(`email-${emp.id}`).value,
                      shift_start: document.getElementById(`start-${emp.id}`).value,
                      shift_end: document.getElementById(`end-${emp.id}`).value,
                      user_type: document.getElementById(`type-${emp.id}`).value,
                    })}
                  >
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