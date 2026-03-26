import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function toast(msg) {
  alert(msg);
}

async function getStaff(uid) {
  const snap = await getDoc(doc(db, 'staff', uid));
  return snap.exists() ? snap.data() : null;
}

onAuthStateChanged(auth, async (user) => {
  // hide parent view in teacher mode
  const parentView = document.getElementById('parentView');
  if (parentView) parentView.style.display = 'none';

  if (!user) {
    show('loginView');
    hide('appView');
    return;
  }

  try {
    const staff = await getStaff(user.uid);
    const allowed = staff && staff.role === 'teacher';

    if (!allowed) {
      await signOut(auth);
      toast('هذا الحساب غير مصرح له بالدخول');
      show('loginView');
      hide('appView');
      return;
    }

    window.currentStaff = staff;
    hide('loginView');
    show('appView');
  } catch (e) {
    console.error(e);
    toast('حدث خطأ أثناء التحقق');
    await signOut(auth);
    show('loginView');
    hide('appView');
  }
});

window.loginFirebase = async function () {
  const email = (document.getElementById('loginEmail')?.value || '').trim();
  const pw = document.getElementById('loginPassword')?.value;

  if (!email || !pw) {
    toast('أدخل البريد وكلمة المرور');
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) {
    console.error(e);
    toast('بيانات الدخول غير صحيحة');
  }
};

window.logoutFirebase = async function () {
  await signOut(auth);
};
