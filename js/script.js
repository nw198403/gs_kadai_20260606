/**
 * =====================================================
 *  つなぎノート - 交換日記（匿名認証 + Firebase Realtime DB）
 * =====================================================
 */

// Firebase 設定（FIREBASE_SETUP.md 参照）
const firebaseConfig = {
  apiKey:            "",
  authDomain:        "",
  projectId:         "",
  databaseURL:       "",
  storageBucket:     "",
  messagingSenderId: "",
  appId:             ""
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

auth.signOut().catch(() => {});

// ===================================================
//  定数
// ===================================================
const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// ===================================================
//  状態管理
// ===================================================
let currentUser     = null;
let currentUserData = null;
let targetClientUid = null;
let loginInProgress = false;
let currentYear     = new Date().getFullYear();
let currentMonth    = new Date().getMonth();
const today         = new Date();
const todayStr      = formatDateKey(today);
let selectedDateStr   = null;
let activeMessagesRef = null;
let selectedRole      = null;

// ===================================================
//  ユーティリティ
// ===================================================
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date    = new Date(y, m - 1, d);
  const weekday = WEEKDAY_LABELS[date.getDay()];
  return `${m}月${d}日（${weekday}）`;
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const d   = new Date(timestamp);
  const h   = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

// ===================================================
//  ログイン処理（匿名認証）
// ===================================================
async function handleLogin(name, role) {
  const errEl = document.getElementById("login-error");
  loginInProgress = true;

  try {
    const credential = await auth.signInAnonymously();
    const uid = credential.user.uid;

    await db.ref(`users/${uid}`).set({ name, role });

    currentUser     = credential.user;
    currentUserData = { name, role };
    if (role === "client") targetClientUid = uid;
    loginInProgress = false;
    showAppScreen();

  } catch (e) {
    loginInProgress = false;
    console.error("ログインエラー:", e);
    errEl.textContent = "ログインに失敗しました。しばらくしてから再度お試しください。";
    errEl.classList.remove("hidden");
    document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("selected"));
    selectedRole = null;
  }
}

// ===================================================
//  ロールボタン
// ===================================================
document.querySelectorAll(".role-btn").forEach(btn => {
  btn.addEventListener("click", function () {
    const name = document.getElementById("login-name").value.trim();
    const errEl = document.getElementById("login-error");

    if (!name) {
      errEl.textContent = "お名前を入力してください";
      errEl.classList.remove("hidden");
      document.getElementById("login-name").focus();
      return;
    }

    document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("selected"));
    this.classList.add("selected");
    selectedRole = this.dataset.role;
    errEl.classList.add("hidden");

    handleLogin(name, selectedRole);
  });
});

document.getElementById("login-name").addEventListener("keydown", function (e) {
  if (e.key === "Enter" && selectedRole) {
    const name = this.value.trim();
    if (name) handleLogin(name, selectedRole);
  }
});

document.getElementById("login-name").addEventListener("input", function () {
  if (this.value.trim()) {
    document.getElementById("login-error").classList.add("hidden");
  }
});

// ===================================================
//  Firebase Auth 状態監視
// ===================================================
auth.onAuthStateChanged(async (user) => {
  if (loginInProgress) return;

  if (!user) {
    showLoginScreen();
    return;
  }

  try {
    const snap = await db.ref(`users/${user.uid}`).get();
    if (!snap.exists()) {
      showLoginScreen();
      return;
    }

    currentUser     = user;
    currentUserData = snap.val();

    if (currentUserData.role === "client") {
      targetClientUid = user.uid;
    }

    showAppScreen();
  } catch (e) {
    console.error("ユーザーデータ取得エラー:", e);
    showToast("⚠️ データの取得に失敗しました", "warning");
  }
});

// ===================================================
//  画面切り替え
// ===================================================
function showLoginScreen() {
  const ls = document.getElementById("login-screen");
  ls.style.display = "";
  ls.classList.remove("fade-out");
  document.getElementById("app").classList.add("hidden");
}

function showAppScreen() {
  const loginScreen = document.getElementById("login-screen");
  loginScreen.classList.add("fade-out");
  setTimeout(() => {
    loginScreen.style.display = "none";
    document.getElementById("app").classList.remove("hidden");
  }, 350);

  const roleLabel = currentUserData.role === "counselor" ? "カウンセラー" : "クライアント";
  document.getElementById("header-user-label").textContent =
    `${currentUserData.name}（${roleLabel}）`;

  if (currentUserData.role === "counselor") {
    document.getElementById("client-select-bar").classList.remove("hidden");
    loadAllClients();
  } else {
    renderCalendar(currentYear, currentMonth);
  }
}

// ===================================================
//  カウンセラー：全クライアント一覧を取得
// ===================================================
async function loadAllClients() {
  try {
    const snap    = await db.ref("users").orderByChild("role").equalTo("client").get();
    const clients = snap.val() || {};

    const select = document.getElementById("client-select");
    select.innerHTML = "";

    const entries = Object.entries(clients);
    if (entries.length === 0) {
      select.innerHTML = '<option value="">クライアントがまだいません</option>';
      targetClientUid = null;
      renderCalendar(currentYear, currentMonth);
      return;
    }

    entries.forEach(([uid, data]) => {
      const opt       = document.createElement("option");
      opt.value       = uid;
      opt.textContent = data.name;
      select.appendChild(opt);
    });

    targetClientUid = entries[0][0];
    renderCalendar(currentYear, currentMonth);

  } catch (e) {
    console.error("クライアント一覧取得エラー:", e);
    showToast("⚠️ クライアント一覧の取得に失敗しました", "warning");
  }
}

// ===================================================
//  カレンダー生成
// ===================================================
async function renderCalendar(year, month) {
  document.getElementById("current-month-label").textContent = `${year}年${month + 1}月`;

  const grid = document.getElementById("calendar-grid");
  grid.innerHTML = "";

  if (!targetClientUid) return;

  let diaryIndex = {};
  try {
    const snap = await db.ref(`diaryIndex/${targetClientUid}`).get();
    diaryIndex  = snap.val() || {};
  } catch (e) {
    console.error("カレンダーデータ取得エラー:", e);
  }

  const firstDay     = new Date(year, month, 1);
  const lastDay      = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();

  for (let i = 0; i < startWeekday; i++) {
    const empty = document.createElement("div");
    empty.classList.add("calendar-cell", "empty");
    grid.appendChild(empty);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date    = new Date(year, month, day);
    const dateStr = formatDateKey(date);
    const weekday = date.getDay();

    const cell = document.createElement("div");
    cell.classList.add("calendar-cell");
    cell.dataset.date = dateStr;

    if (dateStr === todayStr) cell.classList.add("today");

    const daySpan = document.createElement("span");
    daySpan.classList.add("cell-day");
    daySpan.textContent = day;
    if (weekday === 0) daySpan.classList.add("sunday");
    if (weekday === 6) daySpan.classList.add("saturday");
    cell.appendChild(daySpan);

    if (diaryIndex[dateStr]) {
      cell.classList.add("has-entry");
      const flowerImg = document.createElement("img");
      flowerImg.src   = "img/hanamaru.png";
      flowerImg.alt   = "記録あり";
      flowerImg.classList.add("cell-flower");
      cell.appendChild(flowerImg);
    }

    cell.addEventListener("click", function () {
      openModal(this.dataset.date);
    });

    grid.appendChild(cell);
  }
}

// ===================================================
//  モーダル操作
// ===================================================
function openModal(dateStr) {
  if (!targetClientUid) return;

  selectedDateStr = dateStr;

  document.getElementById("modal-date-title").textContent =
    formatDateDisplay(dateStr) + "の記録";

  if (activeMessagesRef) {
    activeMessagesRef.off();
    activeMessagesRef = null;
  }

  const body       = document.getElementById("modal-chat-body");
  const emptyState = document.getElementById("diary-empty-state");
  body.querySelectorAll(".diary-msg-row").forEach(el => el.remove());
  emptyState.style.display = "flex";

  const ref = db.ref(`diaries/${targetClientUid}/${dateStr}/messages`).orderByChild("timestamp");
  activeMessagesRef = ref;

  ref.on("child_added", (snap) => {
    const msg = snap.val();
    if (!msg) return;
    emptyState.style.display = "none";
    body.appendChild(createMessageBubble(msg));
    body.scrollTop = body.scrollHeight;
  });

  document.getElementById("modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";

  setTimeout(() => document.getElementById("diary-input").focus(), 100);
}

function closeModal() {
  if (activeMessagesRef) {
    activeMessagesRef.off();
    activeMessagesRef = null;
  }
  document.getElementById("modal").classList.add("hidden");
  document.body.style.overflow = "";
  selectedDateStr = null;
  document.getElementById("diary-input").value = "";
  document.getElementById("diary-input").style.height = "auto";
}

// ===================================================
//  メッセージバブル DOM 生成
// ===================================================
function createMessageBubble(msg) {
  const isCounselor = msg.senderRole === "counselor";

  const row = document.createElement("div");
  row.classList.add("diary-msg-row", isCounselor ? "self" : "other");

  const avatar = document.createElement("div");
  avatar.classList.add("diary-msg-avatar");
  avatar.textContent = isCounselor ? "☕" : "🌿";
  row.appendChild(avatar);

  const content = document.createElement("div");
  content.classList.add("diary-msg-content");

  const nameRow = document.createElement("div");
  nameRow.classList.add("diary-msg-nameline");

  const nameEl = document.createElement("span");
  nameEl.classList.add("diary-msg-name");
  nameEl.textContent = msg.senderName;

  const badge = document.createElement("span");
  badge.classList.add("diary-msg-badge");
  badge.textContent = isCounselor ? "カウンセラー" : "クライアント";

  if (isCounselor) {
    nameRow.classList.add("right");
    nameRow.appendChild(badge);
    nameRow.appendChild(nameEl);
  } else {
    nameRow.appendChild(nameEl);
    nameRow.appendChild(badge);
  }
  content.appendChild(nameRow);

  const bubble = document.createElement("div");
  bubble.classList.add("diary-msg-bubble");
  bubble.textContent = msg.text;
  content.appendChild(bubble);

  const timeEl = document.createElement("span");
  timeEl.classList.add("diary-msg-time");
  timeEl.textContent = formatTime(msg.timestamp);
  content.appendChild(timeEl);

  row.appendChild(content);
  return row;
}

// ===================================================
//  メッセージ送信
// ===================================================
async function handleSend() {
  if (!selectedDateStr || !targetClientUid) return;

  const input = document.getElementById("diary-input");
  const text  = input.value.trim();
  if (!text) return;

  const msg = {
    text,
    senderRole: currentUserData.role,
    senderName: currentUserData.name,
    timestamp:  firebase.database.ServerValue.TIMESTAMP
  };

  try {
    await db.ref(`diaries/${targetClientUid}/${selectedDateStr}/messages`).push(msg);
    await db.ref(`diaryIndex/${targetClientUid}/${selectedDateStr}`).set(true);

    input.value = "";
    input.style.height = "auto";
    input.focus();
  } catch (e) {
    console.error("送信エラー:", e);
    showToast("⚠️ 送信に失敗しました", "warning");
  }
}

// ===================================================
//  削除
// ===================================================
async function handleDelete() {
  if (!selectedDateStr || !targetClientUid) return;

  const snap = await db.ref(`diaries/${targetClientUid}/${selectedDateStr}/messages`).get();
  if (!snap.exists()) {
    showToast("⚠️ この日の記録はまだありません", "warning");
    return;
  }

  if (!confirm("この日の記録をすべて削除しますか？")) return;

  try {
    await db.ref(`diaries/${targetClientUid}/${selectedDateStr}`).remove();
    await db.ref(`diaryIndex/${targetClientUid}/${selectedDateStr}`).remove();
    renderCalendar(currentYear, currentMonth);
    closeModal();
    showToast("🗑 削除しました", "deleted");
  } catch (e) {
    console.error("削除エラー:", e);
    showToast("⚠️ 削除に失敗しました", "warning");
  }
}

// ===================================================
//  トースト通知
// ===================================================
let toastTimer = null;
function showToast(message, type = "success") {
  const toast     = document.getElementById("toast");
  toast.textContent = message;
  toast.className   = `toast show ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.classList.add("hidden");
  }, 2500);
}

// ===================================================
//  ログアウト
// ===================================================
document.getElementById("header-logout-btn").addEventListener("click", async function () {
  if (!confirm("ログアウトしますか？")) return;

  if (activeMessagesRef) {
    activeMessagesRef.off();
    activeMessagesRef = null;
  }

  currentUser     = null;
  currentUserData = null;
  targetClientUid = null;
  selectedRole    = null;

  document.getElementById("client-select-bar").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");

  document.getElementById("login-name").value = "";
  document.getElementById("login-error").classList.add("hidden");
  document.querySelectorAll(".role-btn").forEach(b => b.classList.remove("selected"));

  await auth.signOut();
});

// ===================================================
//  カレンダーナビ
// ===================================================
document.getElementById("prev-month").addEventListener("click", function () {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar(currentYear, currentMonth);
});

document.getElementById("next-month").addEventListener("click", function () {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar(currentYear, currentMonth);
});

document.getElementById("client-select").addEventListener("change", function () {
  targetClientUid = this.value;
  renderCalendar(currentYear, currentMonth);
});

// ===================================================
//  モーダルイベント
// ===================================================
document.getElementById("modal-close-btn").addEventListener("click", function (e) {
  e.stopPropagation();
  closeModal();
});

document.getElementById("modal").addEventListener("click", function (e) {
  if (e.target === this) closeModal();
});

document.querySelector(".modal-panel").addEventListener("click", function (e) {
  e.stopPropagation();
});

document.getElementById("save-btn").addEventListener("click", function (e) {
  e.stopPropagation();
  handleSend();
});

document.getElementById("delete-btn").addEventListener("click", function (e) {
  e.stopPropagation();
  handleDelete();
});

document.getElementById("diary-input").addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    handleSend();
  }
});

document.getElementById("diary-input").addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 100) + "px";
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeModal();
});
