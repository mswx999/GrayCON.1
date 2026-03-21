/* ═══════════════════════════════════════════
   GrayCON — app.js
   Firebase Auth + Firestore + Dashboard logic
   ═══════════════════════════════════════════ */

/* ──────────────────────────────────────────
   FIREBASE CONFIG — injected at build time
   ────────────────────────────────────────── */
/* ── Values below are replaced at build time by build.js ──
   Source:  .env.local  (local dev)
            Vercel Dashboard → Settings → Environment Variables (production)
   Never hardcode real keys here — this file IS committed to git. */
const FIREBASE_CONFIG = {
  apiKey:            "__ENV_FIREBASE_API_KEY__",
  authDomain:        "__ENV_FIREBASE_AUTH_DOMAIN__",
  projectId:         "__ENV_FIREBASE_PROJECT_ID__",
  storageBucket:     "__ENV_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__ENV_FIREBASE_MESSAGING_SENDER_ID__",
  appId:             "__ENV_FIREBASE_APP_ID__"
};

/* ──────────────────────────────────────────
   INIT FIREBASE
   ────────────────────────────────────────── */
let auth, db, googleProvider;
let firebaseReady = false;

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    auth           = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    firebaseReady  = true;

    /* Set persistence to LOCAL so user stays logged in —
       avoids full re-auth on every page visit */
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

    /* Only init Firestore lazily when actually needed */
    /* Listen for auth state — but skip if we're already handling login */
    auth.onAuthStateChanged(user => {
      if (user && !currentUser) {
        /* Returning visitor — fast path: show dashboard immediately */
        currentUser = {
          name:  user.displayName || user.email.split('@')[0],
          fname: (user.displayName || user.email.split('@')[0]).split(' ')[0],
          lname: (user.displayName || '').split(' ').slice(1).join(' ') || '',
          email: user.email,
          phone: ''
        };
        transactions = [...SEED_TRANSACTIONS];
        loadDashboard();
        showPage('dashboard');
        /* Load full profile silently in background */
        loadUserProfile(user);
      }
    });
  } catch (e) {
    console.warn('Firebase init skipped (demo mode):', e.message);
  }
}

/* Lazy Firestore getter — only creates connection when first needed */
function getDB() {
  if (!db && firebaseReady) {
    db = firebase.firestore();
    /* Use cache for instant reads on repeat visits */
    db.settings({ cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED });
    db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
  }
  return db;
}

/* ──────────────────────────────────────────
   STATE
   ────────────────────────────────────────── */
let currentUser = null;
let transactions = [];

/* Demo seed transactions — replaced with real data after Firebase loads */
const SEED_TRANSACTIONS = [
  {
    id: "TX1710001",
    name: "Transfer X1",
    amount: "250 USD",
    receive: "20,768 INR",
    date: "14 Mar 2026",
    status: "Sent",
    hash: "0x3f8a91c4db88e2f004519"
  },
  {
    id: "TX1709982",
    name: "Transfer X2",
    amount: "500 USD",
    receive: "41,537 INR",
    date: "11 Mar 2026",
    status: "Sent",
    hash: "0xa7c219b84d63f900120ae"
  },
  {
    id: "TX1709964",
    name: "Transfer X3",
    amount: "100 GBP",
    receive: "10,362 INR",
    date: "7 Mar 2026",
    status: "Received",
    hash: "0xb1e447d92c5a81003180b"
  }
];


/* Exchange rates (demo — replace with live API in Phase 2) */
const RATES = {
  USD: { INR: 83.4,  USD: 1,    BDT: 110,  PHP: 56  },
  GBP: { INR: 105.2, USD: 1.27, BDT: 139,  PHP: 71  },
  EUR: { INR: 90.1,  USD: 1.08, BDT: 119,  PHP: 61  },
  CAD: { INR: 61.5,  USD: 0.74, BDT: 82,   PHP: 42  }
};

const FEES = { standard: 0.008, fast: 0.012 };

const PIPELINE_STEPS = [
  { label: "Fiat deposit received",   sub: "Bank / card payment confirmed",          icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' },
  { label: "On-ramp processing",      sub: "MoonPay converting fiat → USDT",          icon: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>' },
  { label: "Blockchain broadcast",    sub: "Transaction submitted to ERC-20 network", icon: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },
  { label: "Network confirmation",    sub: "Confirmations: 6 / 6",                    icon: '<polyline points="20 6 9 17 4 12"/>' },
  { label: "Off-ramp conversion",     sub: "Unocoin: USDT → INR",                     icon: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>' },
  { label: "UPI / bank transfer",     sub: "INR dispatched to recipient account",     icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' },
  { label: "Delivered",               sub: "Recipient confirmed receipt of funds",    icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' }
];

const TAB_INDEX = { home: 0, send: 1, history: 2, track: 3, deposit: 4, kyc: 5, settings: 6 };


/* ══════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════ */
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
  if (page === 'login' || page === 'register') resetRegSteps();
}

function scrollToSection(selector) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function toggleMobileNav() {
  const nav = document.getElementById('mobile-nav');
  nav.classList.toggle('open');
}


/* ══════════════════════════════════════════
   DASHBOARD TAB SWITCHING
══════════════════════════════════════════ */
function switchTab(tab) {
  /* Hide all tabs */
  document.querySelectorAll('[id^="tab-"]').forEach(t => t.style.display = 'none');
  /* Show selected */
  const el = document.getElementById('tab-' + tab);
  if (el) el.style.display = 'block';
  /* Update sidebar nav */
  const items = document.querySelectorAll('.nav-item');
  items.forEach(n => n.classList.remove('active'));
  const idx = TAB_INDEX[tab];
  if (idx !== undefined && items[idx]) items[idx].classList.add('active');
  /* Tab-specific init */
  if (tab === 'track') renderTrackChips();
  if (tab === 'deposit') buildQRCode();
}


/* ══════════════════════════════════════════
   FIREBASE AUTH
══════════════════════════════════════════ */
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');
  errEl.style.display = 'none';

  if (!email || !pass) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }

  /* Show loading state immediately */
  btn.textContent = 'Signing in...';
  btn.disabled = true;
  btn.style.opacity = '0.7';

  if (firebaseReady) {
    try {
      const cred = await auth.signInWithEmailAndPassword(email, pass);

      /* ── FAST PATH: show dashboard instantly, load DB in background ── */
      currentUser = {
        name:  cred.user.displayName || email.split('@')[0],
        fname: (cred.user.displayName || email.split('@')[0]).split(' ')[0],
        lname: (cred.user.displayName || '').split(' ').slice(1).join(' ') || '',
        email: cred.user.email,
        phone: ''
      };
      transactions = [...SEED_TRANSACTIONS];
      loadDashboard();
      showPage('dashboard');

      /* Load full profile silently after UI is shown */
      setTimeout(() => loadUserProfile(cred.user), 100);

    } catch (err) {
      errEl.textContent = getAuthError(err.code);
      errEl.style.display = 'block';
      btn.textContent = 'Sign in';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  } else {
    currentUser = { email, name: email.split('@')[0], fname: email.split('@')[0], lname: '', phone: '' };
    transactions = [...SEED_TRANSACTIONS];
    loadDashboard();
    showPage('dashboard');
  }

  btn.textContent = 'Sign in';
  btn.disabled = false;
  btn.style.opacity = '1';
}

async function doGoogleLogin() {
  if (!firebaseReady) {
    showToast('Google login requires Firebase configuration.');
    return;
  }
  try {
    const result = await auth.signInWithPopup(googleProvider);
    setTimeout(() => loadUserProfile(result.user), 100);
    showPage('dashboard');
  } catch (err) {
    showToast('Google sign-in failed: ' + err.message);
  }
}

async function doRegister() {
  const fname   = document.getElementById('r-fname').value.trim();
  const lname   = document.getElementById('r-lname').value.trim();
  const email   = document.getElementById('r-email').value.trim();
  const pass    = document.getElementById('r-pass').value;
  const acctype = document.getElementById('r-acctype').value;
  const sendcur = document.getElementById('r-sendcur').value;
  const recvcur = document.getElementById('r-recvcur').value;

  const userData = {
    fname, lname,
    name:  fname + (lname ? ' ' + lname : ''),
    email,
    phone:       document.getElementById('r-phone').value,
    dob:         document.getElementById('r-dob').value,
    nationality: document.getElementById('r-nat').value,
    idType:      document.getElementById('r-idtype').value,
    idNum:       document.getElementById('r-idnum').value,
    acctype, sendcur, recvcur,
    kycStatus: 'pending',
    createdAt: new Date().toISOString()
  };

  if (firebaseReady) {
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      /* Store user profile in Firestore */
      await getDB().collection('users').doc(cred.user.uid).set(userData);
      await cred.user.updateProfile({ displayName: userData.name });
      currentUser = userData;
      transactions = [];
      loadDashboard();
      showPage('dashboard');
      showToast('Welcome to GrayCON, ' + fname + '!');
    } catch (err) {
      showToast('Registration failed: ' + err.message);
    }
  } else {
    /* Demo mode */
    currentUser = userData;
    transactions = [];
    loadDashboard();
    showPage('dashboard');
    showToast('Welcome to GrayCON, ' + fname + '! (Demo mode)');
  }
}

async function doSignOut() {
  if (firebaseReady) {
    await auth.signOut();
  }
  currentUser = null;
  transactions = [];
  showPage('landing');
}

/* Loads full profile silently in background — never blocks UI */
async function loadUserProfile(firebaseUser) {
  const database = getDB();
  if (!database) return;
  try {
    const doc = await database.collection('users').doc(firebaseUser.uid).get();
    if (doc.exists) {
      Object.assign(currentUser, doc.data());
      loadDashboard(); /* refresh UI with full data */
    }
  } catch (e) { /* offline — use cached data */ }

  /* Load transactions in background */
  try {
    const snap = await database.collection('users').doc(firebaseUser.uid)
                               .collection('transactions')
                               .orderBy('createdAt', 'desc').limit(20).get();
    if (!snap.empty) {
      transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTransactions();
      updateMetrics();
    }
  } catch (e) { /* use seed transactions */ }
}

function getAuthError(code) {
  const map = {
    'auth/user-not-found':   'No account found with that email.',
    'auth/wrong-password':   'Incorrect password. Please try again.',
    'auth/invalid-email':    'Please enter a valid email address.',
    'auth/too-many-requests':'Too many attempts. Please try again later.',
    'auth/email-already-in-use': 'An account with this email already exists.'
  };
  return map[code] || 'Authentication failed. Please try again.';
}


/* ══════════════════════════════════════════
   REGISTRATION STEPS
══════════════════════════════════════════ */
function regNext1() {
  const fname = document.getElementById('r-fname').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const pass  = document.getElementById('r-pass').value;
  const pass2 = document.getElementById('r-pass2').value;
  const errEl = document.getElementById('reg-error1');

  if (!fname || !email || pass.length < 8) {
    errEl.textContent = 'Please fill all fields. Password must be at least 8 characters.';
    errEl.style.display = 'block';
    return;
  }
  if (pass !== pass2) {
    errEl.textContent = 'Passwords do not match.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  setRegStep(2);
}

function regNext2() {
  setRegStep(3);
}

function regBack(to) {
  setRegStep(to);
}

function setRegStep(step) {
  [1,2,3].forEach(n => {
    document.getElementById('reg-step' + n).style.display = n === step ? 'block' : 'none';
    const dot = document.getElementById('sd' + n);
    dot.className = 'step-dot' + (n < step ? ' done' : n === step ? ' active' : '');
  });
}

function resetRegSteps() {
  setRegStep(1);
  ['reg-error1','reg-error2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}


/* ══════════════════════════════════════════
   DASHBOARD INIT
══════════════════════════════════════════ */
function loadDashboard() {
  if (!currentUser) return;

  const initials = (currentUser.fname ? currentUser.fname[0].toUpperCase() : '?') +
                   (currentUser.lname ? currentUser.lname[0].toUpperCase() : '');

  /* Avatars */
  ['sb-avatar','top-avatar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = initials;
  });

  /* Sidebar name */
  const sbName = document.getElementById('sb-name');
  if (sbName) sbName.textContent = currentUser.name || currentUser.email;

  /* Settings fields */
  ['set-name','set-email','set-phone'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id === 'set-name')  el.value = currentUser.name || '';
    if (id === 'set-email') el.value = currentUser.email || '';
    if (id === 'set-phone') el.value = currentUser.phone || '';
  });

  /* Set default send currency from profile */
  if (currentUser.sendcur) {
    const sel = document.getElementById('s-fromcur');
    if (sel) {
      const code = currentUser.sendcur.split(' ')[0];
      [...sel.options].forEach(o => { if (o.value === code) sel.value = code; });
    }
  }

  buildQRCode();
  renderTransactions();
  updateMetrics();
}

function saveSettings() {
  const name  = document.getElementById('set-name').value;
  const phone = document.getElementById('set-phone').value;
  if (currentUser) { currentUser.name = name; currentUser.phone = phone; }
  /* Persist to Firestore if available */
  if (firebaseReady && auth.currentUser && db) {
    getDB().collection('users').doc(auth.currentUser.uid).update({ name, phone })
      .then(() => showToast('Settings saved.'))
      .catch(() => showToast('Settings saved locally.'));
  } else {
    showToast('Settings saved.');
  }
}

function updateMetrics() {
  const sent = transactions.filter(t => t.status === 'Sent');
  const sentEl  = document.getElementById('m-sent-val');
  const cntEl   = document.getElementById('m-sent-sub');
  if (sentEl) sentEl.textContent = sent.length > 0 ? '$' + (sent.length * 250) : '$0';
  if (cntEl)  cntEl.textContent  = sent.length + ' transfer' + (sent.length !== 1 ? 's' : '');
}


/* ══════════════════════════════════════════
   SEND FLOW
══════════════════════════════════════════ */
function calcRate() {
  const amt   = parseFloat(document.getElementById('s-amount').value) || 0;
  const from  = document.getElementById('s-fromcur').value;
  const to    = document.getElementById('s-tocur').value;
  const speed = document.getElementById('s-speed').value;

  const rateEl   = document.getElementById('rate-val');
  const feeBar   = document.getElementById('fee-bar');
  const feeEl    = document.getElementById('fee-val');
  const recvEl   = document.getElementById('s-receive');

  if (!amt) {
    recvEl.value = '';
    rateEl.textContent = 'Enter amount to see rate';
    feeBar.style.display = 'none';
    return;
  }
  const rate    = (RATES[from] && RATES[from][to]) || 1;
  const fee     = amt * FEES[speed];
  const netAmt  = amt - fee;
  const receive = (netAmt * rate).toFixed(2);

  recvEl.value         = receive;
  rateEl.textContent   = `1 ${from} = ${rate} ${to}`;
  feeEl.textContent    = `${fee.toFixed(4)} ${from} (${(FEES[speed] * 100).toFixed(1)}%)`;
  feeBar.style.display = 'flex';
}

function openConfirmModal() {
  const amt   = document.getElementById('s-amount').value;
  const recv  = document.getElementById('s-receive').value;
  const to    = document.getElementById('s-recipient').value;
  const from  = document.getElementById('s-fromcur').value;
  const toCur = document.getElementById('s-tocur').value;
  const speed = document.getElementById('s-speed').value;

  if (!amt || !to) { showToast('Please fill in the amount and recipient.'); return; }

  const fee = (parseFloat(amt) * FEES[speed]).toFixed(4);
  document.getElementById('m-amount').textContent  = `${amt} ${from}`;
  document.getElementById('m-receive').textContent = `${recv} ${toCur}`;
  document.getElementById('m-to').textContent      = to.length > 26 ? to.slice(0, 26) + '…' : to;
  document.getElementById('m-fee').textContent     = `${fee} ${from}`;
  document.getElementById('m-eta').textContent     = speed === 'fast' ? '~5 min' : '~15 min';
  document.getElementById('confirm-modal').classList.add('open');
}

function closeModal() {
  document.getElementById('confirm-modal').classList.remove('open');
}

async function confirmSend() {
  closeModal();

  const tx = {
    id:      'TX' + Date.now(),
    name:    document.getElementById('s-rname').value || 'Recipient',
    amount:  document.getElementById('s-amount').value + ' ' + document.getElementById('s-fromcur').value,
    receive: document.getElementById('s-receive').value + ' ' + document.getElementById('s-tocur').value,
    date:    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
    status:  'Pending',
    hash:    '0x' + Math.random().toString(16).slice(2, 22),
    createdAt: new Date().toISOString()
  };

  /* Save to Firestore */
  if (firebaseReady && auth.currentUser && db) {
    try {
      await getDB().collection('users').doc(auth.currentUser.uid)
               .collection('transactions').doc(tx.id).set(tx);
    } catch (e) { /* offline — save locally */ }
  }

  transactions.unshift(tx);
  renderTransactions();
  updateMetrics();
  showToast('Transfer submitted! Hash: ' + tx.hash.slice(0, 14) + '…');

  /* Simulate confirmation after 4 seconds */
  setTimeout(() => {
    tx.status = 'Sent';
    renderTransactions();
    updateMetrics();
  }, 4000);

  /* Clear form */
  ['s-amount','s-receive','s-recipient','s-rname'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const feeBar = document.getElementById('fee-bar');
  if (feeBar) feeBar.style.display = 'none';
}


/* ══════════════════════════════════════════
   TRANSACTION RENDERING
══════════════════════════════════════════ */
function renderTransactions() {
  const listEl = document.getElementById('tx-list');
  const histEl = document.getElementById('history-list');

  if (!transactions.length) {
    const empty = '<div class="empty-state">No transactions yet. Send your first transfer!</div>';
    if (listEl) listEl.innerHTML = empty;
    if (histEl) histEl.innerHTML = '<div class="empty-state">Your full transfer history will appear here.</div>';
    return;
  }

  const makeRow = (tx, full) => {
    const isSent     = tx.status === 'Sent';
    const isReceived = tx.status === 'Received';
    const isPending  = tx.status === 'Pending';

    const iconCls  = isSent ? 'tx-sent' : isReceived ? 'tx-recv' : 'tx-pend';
    const pillCls  = isSent ? 'pill-sent' : isReceived ? 'pill-recv' : 'pill-pend';
    const initials = tx.name.slice(0, 2).toUpperCase();
    const hashPreview = tx.hash ? tx.hash.slice(0, 14) + '…' : '';

    /* Red minus for debit, green plus for credit */
    const amtColor  = isSent ? '#e05555' : isReceived ? '#4caf50' : 'var(--text2)';
    const amtPrefix = isSent ? '−' : isReceived ? '+' : '';
    const amtArrow  = isSent
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e05555" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>`
      : isReceived
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#4caf50" stroke-width="2.5"><line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/></svg>`
      : '';

    return `
      <div class="tx-row" onclick="trackTx('${tx.hash}')">
        <div class="tx-icon ${iconCls}">${initials}</div>
        <div class="tx-info">
          <div class="tx-name">${tx.name}</div>
          <div class="tx-date">${tx.date}${!full ? ' · ' + hashPreview : ''}</div>
          ${full ? `<div class="tx-date" style="font-family:monospace;margin-top:1px;font-size:10px">${tx.hash}</div>` : ''}
        </div>
        <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div style="display:flex;align-items:center;gap:4px">
            ${amtArrow}
            <div class="tx-amount" style="color:${amtColor};font-weight:600">${amtPrefix}${tx.amount}</div>
          </div>
          ${full ? `<div style="font-size:11px;color:var(--text3)">→ ${tx.receive}</div>` : ''}
          <span class="pill ${pillCls}">${tx.status}</span>
        </div>
      </div>`;
  };

  if (listEl) listEl.innerHTML = transactions.slice(0, 5).map(t => makeRow(t, false)).join('');
  if (histEl) histEl.innerHTML = transactions.map(t => makeRow(t, true)).join('');
}


/* ══════════════════════════════════════════
   TRANSFER TRACKER
══════════════════════════════════════════ */
function trackTx(hash) {
  switchTab('track');
  const inputEl = document.getElementById('track-input');
  if (inputEl) inputEl.value = hash;
  runTracker();
}

function runTracker() {
  const hash = (document.getElementById('track-input').value || '').trim();
  if (!hash) { showToast('Please enter a transaction hash.'); return; }

  document.getElementById('track-empty').style.display  = 'none';
  document.getElementById('track-result').style.display = 'block';
  document.getElementById('track-hash-display').textContent = hash;

  const tx        = transactions.find(t => t.hash === hash || t.id === hash);
  const stepCount = tx ? (tx.status === 'Sent' ? 7 : tx.status === 'Pending' ? 3 : 5) : 5;

  /* Status pill */
  const pill = document.getElementById('track-status-pill');
  pill.textContent = tx ? tx.status : 'Processing';
  pill.className   = 'pill ' + (tx?.status === 'Sent' ? 'pill-recv' : tx?.status === 'Pending' ? 'pill-pend' : 'pill-recv');

  /* Summary */
  document.getElementById('trk-amt').textContent  = tx ? tx.amount  : '—';
  document.getElementById('trk-recv').textContent = tx ? tx.receive : '—';
  document.getElementById('trk-fee').textContent  = tx ? '~0.8%'    : '—';

  /* Pipeline */
  const container = document.getElementById('pipeline-steps');
  container.innerHTML = PIPELINE_STEPS.map((step, i) => {
    const done   = i < stepCount - 1;
    const active = i === stepCount - 1;
    const cls    = done ? 'done' : active ? 'active' : '';

    return `
      <div class="pipeline-step ${cls}">
        <div class="pipe-circle ${cls}">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            ${step.icon}
          </svg>
        </div>
        <div class="pipe-body">
          <div class="pipe-title ${active ? 'active-text' : ''}">${step.label}</div>
          <div class="pipe-sub">${step.sub}</div>
          ${done   ? '<div class="pipe-hash">✓ confirmed</div>' : ''}
          ${active ? '<div class="pipe-hash">● processing…</div>' : ''}
        </div>
      </div>`;
  }).join('');
}

function renderTrackChips() {
  const wrap = document.getElementById('track-chips');
  if (!wrap) return;
  if (!transactions.length) { wrap.innerHTML = ''; return; }

  wrap.innerHTML = transactions.slice(0, 3).map(tx =>
    `<button onclick="trackTx('${tx.hash}')" style="
      padding:4px 11px;
      background:var(--bg3);
      border:1px solid var(--border2);
      border-radius:999px;
      font-size:11px;
      cursor:pointer;
      color:var(--text3);
      font-family:monospace;
      transition:all 0.18s;
    " onmouseover="this.style.borderColor='rgba(255,255,255,0.3)';this.style.color='var(--text2)'"
       onmouseout="this.style.borderColor='rgba(255,255,255,0.13)';this.style.color='var(--text3)'">
      ${tx.hash.slice(0, 18)}…
    </button>`
  ).join('');
}


/* ══════════════════════════════════════════
   DEPOSIT — QR CODE (decorative)
══════════════════════════════════════════ */
function buildQRCode() {
  const grid = document.getElementById('qr-grid');
  if (!grid || grid.children.length > 0) return;

  let s = 98765;
  const cells = Array.from({ length: 49 }, () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % 3 !== 0;
  });
  /* Corner markers */
  [[0,0],[0,6],[6,0]].forEach(([r,c]) => {
    for (let dr = 0; dr < 3; dr++)
      for (let dc = 0; dc < 3; dc++)
        cells[r * 7 + c + dr * 7 + dc] = true;
  });

  grid.innerHTML = cells.map(on =>
    `<div style="background:${on ? '#888888' : 'transparent'};border-radius:1px"></div>`
  ).join('');
}

function copyWalletAddr(el) {
  const addr = document.getElementById('wallet-addr').textContent;
  navigator.clipboard?.writeText(addr).catch(() => {});
  showToast('Wallet address copied to clipboard.');
}


/* ══════════════════════════════════════════
   KYC UPLOAD
══════════════════════════════════════════ */
function handleUpload(input) {
  if (input.files && input.files[0]) {
    showToast('Document "' + input.files[0].name + '" ready for submission.');
  }
}


/* ══════════════════════════════════════════
   TOAST NOTIFICATION
══════════════════════════════════════════ */
function showToast(msg) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  msgEl.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}


/* ══════════════════════════════════════════
   SCROLL REVEAL
══════════════════════════════════════════ */
function initScrollReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        observer.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}


/* ══════════════════════════════════════════
   NAV SCROLL EFFECT
══════════════════════════════════════════ */
function initNavScroll() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      nav.style.background = 'rgba(12,12,12,0.96)';
    } else {
      nav.style.background = 'rgba(12,12,12,0.88)';
    }
  }, { passive: true });
}


/* ══════════════════════════════════════════
   KEYBOARD SHORTCUTS
══════════════════════════════════════════ */
function initKeyboard() {
  document.addEventListener('keydown', e => {
    /* Enter on login password */
    if (e.key === 'Enter') {
      const active = document.activeElement;
      if (active && active.id === 'login-pass') doLogin();
    }
    /* Escape closes modal / mobile nav */
    if (e.key === 'Escape') {
      closeModal();
      document.getElementById('mobile-nav')?.classList.remove('open');
    }
  });
}


/* ══════════════════════════════════════════
   BOOT
══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initFirebase();
  initScrollReveal();
  initNavScroll();
  initKeyboard();
});
