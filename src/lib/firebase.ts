import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyD6zZxcf9IpcivR4EDlMio7DIrcJnSoLBw",
  authDomain: "gen-lang-client-0906235656.firebaseapp.com",
  projectId: "gen-lang-client-0906235656",
  storageBucket: "gen-lang-client-0906235656.firebasestorage.app",
  messagingSenderId: "656078644704",
  appId: "1:656078644704:web:9d281d8dca1b046460f785"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export { RecaptchaVerifier, signInWithPhoneNumber };
