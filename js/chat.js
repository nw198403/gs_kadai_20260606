/**
 * =====================================================
 *  つなぎノート — チャット機能 (chat.js)
 *  Firebase Realtime Database を使用
 * =====================================================
 */

// ===================================================
//  Firebase 設定
//  ↓ ここに自分の firebaseConfig を貼り付けてください
// ===================================================
const firebaseConfig = {
  apiKey:            "",   // ← 貼り付け
  authDomain:        "",   // ← 貼り付け
  databaseURL:       "",   // ← 貼り付け（例: https://xxxx-default-rtdb.firebaseio.com）
  projectId:         "",   // ← 貼り付け
  storageBucket:     "",   // ← 貼り付け
  messagingSenderId: "",   // ← 貼り付け
  appId:             ""    // ← 貼り付け
};
// ===================================================

// Firebase 初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// メッセージを保存するパス
const MESSAGES_REF = "tsunagi_chat/messages";

// ===================================================
//  ユーザー情報（セッション中のみ保持）
// ===================================================
let currentUser = {
  name: "",
  role: ""   // "client" or "counselor"
};

// ===================================================
//  DOM 要素
// ===================================================
const loginScreen    = document.getElementById("login-screen");
const chatScreen     = document.getElementById("chat-screen");
const loginNameInput = document.getElementById("login-name");
const loginError     = document.getElementById("login-error");
const roleButtons    = document.querySelectorAll(".role-btn");
const chatMessages   = document.getElementById("chat-messages");
const chatInput      = document.getElementById("chat-input");
const sendBtn        = document.getElementById("send-btn");
const logoutBtn      = document.getElementById("logout-btn");
const chatHeaderSub  = document.getElementById("chat-header-sub");
const todayLabel     = document.getElementById("today-label");

// ===================================================
//  ロール選択
// ===================================================
let selectedRole = null;

roleButtons.forEach(btn => {
  btn.addEventListener("click", function () {
    // 選択状態をリセット
    roleButtons.forEach(b => b.classList.remove("selected"));
    this.classList.add("selected");
    selectedRole = this.dataset.role;

    // 名前が入力済みなら即ログイン
    const name = loginNameInput.value.trim();
    if (name) {
      startChat(name, selectedRole);
    } else {
      loginError.textContent = "お名前を入力してください";
      loginError.classList.remove("hidden");
      loginNameInput.focus();
    }
  });
});

// 名前入力 → Enter でロール選択中ならログイン
loginNameInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && selectedRole) {
    const name = this.value.trim();
    if (name) {
      startChat(name, selectedRole);
    } else {
      loginError.textContent = "お名前を入力してください";
      loginError.classList.remove("hidden");
    }
  }
});

// 入力中のエラー消去
loginNameInput.addEventListener("input", function () {
  if (this.value.trim()) {
    loginError.classList.add("hidden");
  }
});

// ===================================================
//  ログイン開始
// ===================================================
function startChat(name, role) {
  currentUser = { name, role };

  // ログイン画面をフェードアウト
  loginScreen.classList.add("fade-out");
  setTimeout(() => {
    loginScreen.style.display = "none";
    chatScreen.classList.remove("hidden");
  }, 350);

  // ヘッダーのサブテキストを更新
  const roleLabel = role === "counselor" ? "カウンセラー" : "クライアント";
  chatHeaderSub.textContent = `${name}（${roleLabel}）としてログイン中`;

  // 今日の日付ラベルを更新
  const now = new Date();
  todayLabel.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

  // Firebase からメッセージを購読
  subscribeMessages();

  // テキストエリアにフォーカス
  setTimeout(() => chatInput.focus(), 400);
}

// ===================================================
//  Firebase: メッセージを購読（リアルタイム受信）
// ===================================================
function subscribeMessages() {
  const messagesRef = db.ref(MESSAGES_REF);

  // 最新100件を取得し、それ以降の追加も監視
  messagesRef.limitToLast(100).on("child_added", (snapshot) => {
    const msg = snapshot.val();
    if (msg) {
      appendMessage(msg);
    }
  });

  // 接続状態を監視
  db.ref(".info/connected").on("value", (snap) => {
    if (snap.val() === true) {
      chatHeaderSub.textContent = `${currentUser.name}（${currentUser.role === "counselor" ? "カウンセラー" : "クライアント"}）として接続中`;
    } else {
      chatHeaderSub.textContent = "再接続中…";
    }
  });
}

// ===================================================
//  メッセージをDOMに追加
// ===================================================
function appendMessage(msg) {
  // ロールで表示位置を決定：カウンセラー → 右(self)、クライアント → 左(other)
  const isCounselor = msg.senderRole === "counselor";

  const row = document.createElement("div");
  row.classList.add("msg-row", isCounselor ? "self" : "other");

  // アバター
  const avatar = document.createElement("div");
  avatar.classList.add("msg-avatar");
  avatar.textContent = msg.senderRole === "counselor" ? "☕" : "🌿";
  row.appendChild(avatar);

  // コンテンツ（名前＋ロール＋バブル）
  const content = document.createElement("div");
  content.classList.add("msg-content");

  // 名前＋ロールバッジ
  const nameRow = document.createElement("div");
  nameRow.style.cssText = "display:flex; align-items:center; gap:5px; padding:0 4px;";

  const nameEl = document.createElement("span");
  nameEl.classList.add("msg-name");
  nameEl.style.padding = "0";
  nameEl.textContent = msg.senderName;

  const badge = document.createElement("span");
  badge.classList.add("msg-role-badge");
  badge.textContent = isCounselor ? "カウンセラー" : "クライアント";

  if (isCounselor) {
    nameRow.style.justifyContent = "flex-end";
    nameRow.appendChild(badge);
    nameRow.appendChild(nameEl);
  } else {
    nameRow.appendChild(nameEl);
    nameRow.appendChild(badge);
  }

  content.appendChild(nameRow);

  // バブル
  const bubble = document.createElement("div");
  bubble.classList.add("msg-bubble");
  bubble.textContent = msg.text;
  content.appendChild(bubble);

  // タイムスタンプ（カウンセラーは右寄せ）
  const timeEl = document.createElement("span");
  timeEl.classList.add("msg-time");
  timeEl.textContent = formatTime(msg.timestamp);
  if (isCounselor) timeEl.style.alignSelf = "flex-end";
  content.appendChild(timeEl);

  row.appendChild(content);
  chatMessages.appendChild(row);

  // 一番下にスクロール
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ===================================================
//  タイムスタンプ整形
// ===================================================
function formatTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

// ===================================================
//  メッセージ送信
// ===================================================
function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  sendBtn.disabled = true;

  const msg = {
    text:       text,
    senderName: currentUser.name,
    senderRole: currentUser.role,
    timestamp:  firebase.database.ServerValue.TIMESTAMP
  };

  // Firebase に書き込む（push でユニークキーを自動生成）
  db.ref(MESSAGES_REF).push(msg)
    .then(() => {
      chatInput.value = "";
      chatInput.style.height = "auto"; // 高さをリセット
      chatInput.focus();
    })
    .catch((error) => {
      console.error("送信エラー:", error);
      alert("送信に失敗しました。接続を確認してください。");
    })
    .finally(() => {
      sendBtn.disabled = false;
    });
}

// ===================================================
//  送信ボタン
// ===================================================
sendBtn.addEventListener("click", sendMessage);

// ===================================================
//  テキストエリア：Enter 送信 / Shift+Enter 改行
// ===================================================
chatInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendMessage();
  }
});

// テキストエリアの自動高さ調整
chatInput.addEventListener("input", function () {
  this.style.height = "auto";
  this.style.height = Math.min(this.scrollHeight, 120) + "px";
});

// ===================================================
//  ログアウト
// ===================================================
logoutBtn.addEventListener("click", function () {
  if (!confirm("ログアウトしますか？")) return;

  // Firebase の購読を解除
  db.ref(MESSAGES_REF).off();
  db.ref(".info/connected").off();

  // 状態リセット
  currentUser = { name: "", role: "" };
  selectedRole = null;
  chatMessages.innerHTML = `
    <div class="chat-date-divider">
      <span id="today-label">今日</span>
    </div>
  `;
  loginNameInput.value = "";
  roleButtons.forEach(b => b.classList.remove("selected"));

  // 画面切り替え
  chatScreen.classList.add("hidden");
  loginScreen.style.display = "";
  loginScreen.classList.remove("fade-out");
});
