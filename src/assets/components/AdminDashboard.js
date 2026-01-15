import React, { useEffect, useState } from 'react';
import { Table, Badge, Form, Container } from 'react-bootstrap';

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const adminEmail = localStorage.getItem('userEmail'); // Assumes you store email on login

  useEffect(() => {
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(data => setEmployees(data));
  }, [adminEmail]);

  const handleRoleChange = async (email, newRole) => {
    const res = await fetch(`/api/admin/update-role?target_email=${email}&new_type=${newRole}&admin_email=${adminEmail}`, {
      method: 'POST'
    });
    if (res.ok) window.location.reload(); // Refresh to show changes
  };

  return (
    <Container className="py-5">
      <h2 className="fw-bold mb-4">Admin Management Console</h2>
      <Table responsive hover className="shadow-sm">
        <thead className="bg-dark text-white">
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {employees.map(emp => (
            <tr key={emp.email}>
              <td>{emp.full_name}</td>
              <td>{emp.email}</td>
              <td>
                <Badge bg={emp.user_type === 'admin' ? 'danger' : 'primary'}>
                  {emp.user_type.toUpperCase()}
                </Badge>
              </td>
              <td>
                <Form.Select 
                  size="sm" 
                  onChange={(e) => handleRoleChange(emp.email, e.target.value)}
                  defaultValue={emp.user_type}
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </Form.Select>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Container>
  );
};