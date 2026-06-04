import React, { createContext, useContext, useState, useEffect } from 'react';

// Mocking Capacitor for web preview to avoid module resolution errors
const Capacitor = window.Capacitor || { isNativePlatform: () => false };
const registerPlugin = window.Capacitor?.registerPlugin || (() => ({
  requestPermissions: async () => ({ receive: 'denied' }),
  register: async () => {},
  addListener: () => {}
}));

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
        try { localStorage.setItem('fcmToken', token.value); } catch (e) {}
      } catch (e) {
        console.error('Failed to persist FCM token:', e);
      }
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const title = notification?.notification?.title || notification?.data?.title;
      const body = notification?.notification?.body || notification?.data?.body || '';
      try { setPushMessage(`${title}: ${body}`); setPushMessageType('info'); } catch (e) {}
    });

  } catch (error) {
    console.error('Push notification setup failed:', error);
  }
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pushMessage, setPushMessage] = useState(null);
  const [pushMessageType, setPushMessageType] = useState('info');

  useEffect(() => {
    const email = localStorage.getItem('userEmail');
    const cachedUserData = localStorage.getItem('userData');
    
    // OFFLINE FIX: Instantly load cached user data to prevent kick-to-login
    if (cachedUserData) {
        try {
            setUser(JSON.parse(cachedUserData));
            setLoading(false);
        } catch(e) {}
    }

    if (email) {
      fetch(`${API_BASE_URL}/api/user/profile?email=${email}`)
        .then(res => res.json())
        .then(data => {
            setUser(data);
            localStorage.setItem('userData', JSON.stringify(data)); // Save latest data for offline use
            setLoading(false);
        })
        .catch(() => {
            // Network failed. Do not clear the user. The cached data remains active.
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
    localStorage.setItem('userData', JSON.stringify(userData)); // Ensure it saves on initial login
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
    } catch (e) {}
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