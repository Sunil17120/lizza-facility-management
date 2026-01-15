import React, { useEffect, useState } from 'react';
import { Table, Badge, Form, Container, Dropdown, ButtonGroup } from 'react-bootstrap';

const AdminDashboard = () => {
  const [employees, setEmployees] = useState([]);
  const [filter, setFilter] = useState('all'); // State to track current view
  const adminEmail = localStorage.getItem('userEmail');

  useEffect(() => {
    fetch(`/api/admin/employees?admin_email=${adminEmail}`)
      .then(res => res.json())
      .then(data => setEmployees(data));
  }, [adminEmail]);

  const handleRoleChange = async (email, newRole) => {
    const res = await fetch(`/api/admin/update-role?target_email=${email}&new_type=${newRole}&admin_email=${adminEmail}`, {
      method: 'POST'
    });
    if (res.ok) window.location.reload(); 
  };

  // Logic to filter the list based on the dropdown selection
  const filteredEmployees = employees.filter(emp => {
    if (filter === 'all') return true;
    return emp.user_type === filter;
  });

  return (
    <Container className="py-5">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="fw-bold m-0">Admin Management Console</h2>
        
        {/* New Filter Dropdown */}
        <Dropdown as={ButtonGroup} onSelect={(e) => setFilter(e)}>
          <Dropdown.Toggle variant="dark" id="dropdown-filter">
            Viewing: {filter.toUpperCase()}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item eventKey="all">All Members</Dropdown.Item>
            <Dropdown.Item eventKey="official staff">Official Staffs</Dropdown.Item>
            <Dropdown.Item eventKey="guard">Guards</Dropdown.Item>
            <Dropdown.Item eventKey="employee">Employees</Dropdown.Item>
            <Dropdown.Item eventKey="admin">Admins</Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>

      <Table responsive hover className="shadow-sm">
        <thead className="bg-dark text-white">
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Type</th>
            <th>Change Role</th>
          </tr>
        </thead>
        <tbody>
          {filteredEmployees.map(emp => (
            <tr key={emp.email}>
              <td>{emp.full_name}</td>
              <td>{emp.email}</td>
              <td>
                <Badge bg={
                  emp.user_type === 'admin' ? 'danger' : 
                  emp.user_type === 'guard' ? 'warning' : 'primary'
                }>
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
                  <option value="official staff">Official Staff</option>
                  <option value="guard">Guard</option>
                  <option value="admin">Admin</option>
                </Form.Select>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {filteredEmployees.length === 0 && (
        <p className="text-center text-muted mt-3">No members found for this category.</p>
      )}
    </Container>
  );
};

export default AdminDashboard;