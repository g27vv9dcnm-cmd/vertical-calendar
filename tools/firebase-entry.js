// アプリで使う Firebase の機能だけをまとめて1つのファイルにする（npm run vendor）
export { initializeApp } from "firebase/app";
export {
  getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, connectAuthEmulator,
  signInWithCredential, // 以下3つ（と getFirestore・disableNetwork・enableNetwork）は手元のテスト（エミュレーター）だけで使う
} from "firebase/auth";
export {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache, connectFirestoreEmulator,
  doc, collection, onSnapshot, setDoc, updateDoc, deleteDoc, addDoc, deleteField, FieldPath,
  waitForPendingWrites, terminate, clearIndexedDbPersistence, getFirestore, disableNetwork, enableNetwork,
} from "firebase/firestore";
export { getStorage, ref, uploadBytes, getDownloadURL, deleteObject, connectStorageEmulator } from "firebase/storage";
