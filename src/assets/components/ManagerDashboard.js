import React, { useState, useEffect } from 'react';
import { Container, Card, Form, Button, Table, Badge } from 'react-bootstrap';
import { UserPlus, ShieldCheck, MapPin } from 'lucide-react';

const ManagerDashboard = () => {
  const [staff, setStaff] = useState([]);
  const [formData, setFormData] = useState({ name: '', email: '', pass: '', start: '09:00', end: '18:00' });
  const managerId = localStorage.getItem('userId'); // Assuming stored on login

  const handleAddStaff = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/manager/add-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            full_name: formData.name, email: formData.email, 
            password: formData.pass, manager_id: managerId,
            shift_start: formData.start, shift_end: formData.end
        })
    });
    if(res.ok) alert("Staff Added to Blockchain Ledger!");
  };

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4">Manager Control Panel</h2>
      <Card className="p-4 border-0 shadow-sm mb-4">
        <h5 className="fw-bold mb-3"><UserPlus className="text-danger me-2"/>Onboard Staff (Blockchain Identity)</h5>
        <Form onSubmit={handleAddStaff} className="row g-3">
            <Col md={4}><Form.Control placeholder="Full Name" onChange={e => setFormData({...formData, name: e.target.value})}/></Col>
            <Col md={4}><Form.Control placeholder="Email" onChange={e => setFormData({...formData, email: e.target.value})}/></Col>
            <Col md={4}><Form.Control type="password" placeholder="Password" onChange={e => setFormData({...formData, pass: e.target.value})}/></Col>
            <Col md={12}><Button type="submit" variant="danger" className="fw-bold w-100">MINT EMPLOYEE ID</Button></Col>
        </Form>
      </Card>
      
      {/* Live tracking view for Manager's own staff only goes here via WebSocket */}
    </Container>
  );
};
export default ManagerDashboard;