import React, { createContext, useContext, useState, useEffect } from 'react';

const Capacitor = window.Capacitor || { isNativePlatform: () => false };
const registerPlugin = window.Capacitor?.registerPlugin || (() => ({
  requestPermissions: async () => ({ receive: 'denied' }),
  register: async () => {},
  addListener: () => {}
}));

const PushNotifications = registerPlugin('PushNotifications');
const isApp = Capacitor.isNativePlatform();

const UserContext = createContext();
const API_BASE_URL = "https://sunil0034-lizza-facility-backend.hf.space";

const registerPushToken = async (email, setPushMessage, setPushMessageType) => {
  if (!isApp || !email) return;
  
  const permission = await PushNotifications.requestPermissions();
  if (permission.receive !== 'granted') {
    setPushMessage('Push notifications are disabled. Enable notifications to receive alerts.');
    setPushMessageType('warning');
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    await fetch(`${API_BASE_URL}/api/user/update-fcm-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fcm_token: token.value })
    });
    localStorage.setItem('fcmToken', token.value);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    const title = notification?.notification?.title || notification?.data?.title;
    const body = notification?.notification?.body || notification?.data?.body || '';
    setPushMessage(`${title}: ${body}`); 
    setPushMessageType('info');
  });
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState(null);
  const [pushMessageType, setPushMessageType] = useState('info');

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    const cachedUserData = localStorage.getItem('userData');
    
    if (cachedUserData) {
        setUser(JSON.parse(cachedUserData));
        setLoading(false);
    }

    if (email) {
      fetch(`${API_BASE_URL}/api/user/profile?email=${email}`)
        .then(res => res.json())
        .then(data => {
            setUser(data);
            localStorage.setItem('userData', JSON.stringify(data));
            setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.email) {
      registerPushToken(user.email, setPushMessage, setPushMessageType);
    }
  }, [user]);

  useEffect(() => {
    if (!pushMessage) return;
    const timeout = setTimeout(() => setPushMessage(null), 10000);
    return () => clearTimeout(timeout);
  }, [pushMessage]);

  const loginUser = (userData) => {
    setUser(userData);
    localStorage.setItem('userName', userData.full_name);
    localStorage.setItem('userRole', userData.user_type);
    localStorage.setItem('userData', JSON.stringify(userData));
  };

  const logoutUser = async () => {
    if (user && user.email) {
      await fetch(`${API_BASE_URL}/api/user/send-logout-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email })
      });
    }
    
    setPushMessage('You have been logged out.');
    setPushMessageType('info');
    setUser(null);
    localStorage.clear();
  };

  return (
    <UserContext.Provider value={{ user, loading, loginUser, logoutUser, pushMessage, pushMessageType }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => useContext(UserContext);