import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();
const API_BASE_URL = 'https://lizza-facility-management.vercel.app';

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (email) {
      fetch(`${API_BASE_URL}/api/user/profile?email=${email}`)
        .then(res => res.json())
        .then(data => {
            setUser(data);
            setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const loginUser = (userData) => {
    setUser(userData);
    localStorage.setItem('userName', userData.full_name);
    localStorage.setItem('userRole', userData.user_type);
  };

  const logoutUser = () => {
    setUser(null);
    localStorage.clear();
  };

  return (
    <UserContext.Provider value={{ user, loading, loginUser, logoutUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);