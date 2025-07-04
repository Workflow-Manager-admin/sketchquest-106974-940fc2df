//
// firebase.js: Central Firebase initialization for Doodle Finder React app
//
// All Firebase services should be imported from this module.
//
// PUBLIC_INTERFACE
/**
 * @fileoverview Firebase setup for Doodle Finder. Use this module to access
 * initialized Firebase services. Import only from here throughout the app.
 */

import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

/**
 * Firebase configuration object (provided)
 * For Firebase JS SDK v7.20.0 and later, measurementId is optional
 */
const firebaseConfig = {
  apiKey: "AIzaSyBNA7xaoiynpwD8j3rE3qB9-daUnmDIbno",
  authDomain: "doodlefinder.firebaseapp.com",
  projectId: "doodlefinder",
  storageBucket: "doodlefinder.firebasestorage.app",
  messagingSenderId: "306458973633",
  appId: "1:306458973633:web:5862a96764e4bd75a6cb40",
  measurementId: "G-2H7VRGX2VY"
};

// Initialize Firebase app instance if not already initialized
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Export Firebase services for use in the app
// PUBLIC_INTERFACE
export const db = getFirestore(app);      // Firestore database instance
export const storage = getStorage(app);   // Firebase storage instance
export default app;
