import React, { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    if (email) {
      // Must use absolute URL for Capacitor mobile requests
      fetch(`https://lizza-facility-management.vercel.app/api/user/profile?email=${email}`)
        .then(res => res.json())
        .then(data => {
            setUser(data);
            setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  return (
    <UserContext.Provider value={{ user, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);