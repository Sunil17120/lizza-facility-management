import React, { createContext, useContext, useState, useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const PushNotifications = registerPlugin('PushNotifications');
const isApp = Capacitor.isNativePlatform();

const UserContext = createContext();
const API_BASE_URL = 'https://lizza-facility-management.vercel.app';

const registerPushToken = async (email, setPushMessage, setPushMessageType) => {
  if (!isApp || !email) return;
  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== 'granted') {
      setPushMessage('Push notifications are disabled. Enable notifications to receive alerts.');
      setPushMessageType('warning');
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', async (token) => {
      try {
        await fetch(`${API_BASE_URL}/api/user/update-fcm-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fcm_token: token.value })
        });
        setPushMessage('Push notifications enabled.');
        setPushMessageType('success');
      } catch (e) {
        console.error('Failed to persist FCM token:', e);
        setPushMessage('Push registration succeeded locally, but failed to save token on server.');
        setPushMessageType('danger');
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
      setPushMessage('Push registration failed. Notifications may not arrive.');
      setPushMessageType('danger');
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('Push received:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('Push action performed:', action);
    });
  } catch (error) {
    console.error('Push notification setup failed:', error);
    setPushMessage('Push notification setup failed. Notifications may not work.');
    setPushMessageType('danger');
  }
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState(null);
  const [pushMessageType, setPushMessageType] = useState('info');

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
  };

  const logoutUser = async () => {
    try {
      if (user && user.email) {
        await fetch(`${API_BASE_URL}/api/user/send-logout-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email })
        });
      }
    } catch (e) {
      console.warn('Logout notification failed', e);
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