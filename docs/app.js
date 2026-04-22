import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-functions.js";
import { firebaseOptions, firebaseWebConfig } from "./firebase-config.js";

const DAYS_BEFORE_REMINDER = 3;
const FREE_SUBSCRIPTION_LIMIT = 5;
const THEME_KEY = "subtrack-theme-v2";
const TELEGRAM_USERNAME = firebaseOptions.telegramUsername || "Dof_white";
const FIREBASE_READY = Boolean(
  firebaseWebConfig.apiKey
  && firebaseWebConfig.authDomain
  && firebaseWebConfig.projectId
  && firebaseWebConfig.appId
);

const state = {
  authMode: "register",
  currentFilter: "all",
  selectedPlan: "monthly",
  currentUser: null,
  profile: null,
  tokenClaims: {},
  subscriptions: [],
  premiumRequests: [],
  premiumMembers: [],
  unsubProfile: null,
  unsubSubscriptions: null,
  unsubRequests: null,
  unsubPremiumMembers: null,
  firebaseError: ""
};

const elements = {
  setupBanner: document.querySelector("#setup-banner"),
  setupBannerText: document.querySelector("#setup-banner-text"),
  form: document.querySelector("#subscription-form"),
  openFormButton: document.querySelector("#open-form-button"),
  modal: document.querySelector("#subscription-modal"),
  closeFormButton: document.querySelector("#close-form-button"),
  premiumModal: document.querySelector("#premium-modal"),
  closePremiumButton: document.querySelector("#close-premium-button"),
  openPremiumButton: document.querySelector("#open-premium-button"),
  activatePremiumButton: document.querySelector("#activate-premium-button"),
  laterPremiumButton: document.querySelector("#later-premium-button"),
  subscriptionsBody: document.querySelector("#subscriptions-body"),
  reminderList: document.querySelector("#reminder-list"),
  emptyState: document.querySelector("#empty-state"),
  template: document.querySelector("#subscription-row-template"),
  filterButtons: document.querySelectorAll(".filter-button"),
  monthlyTotal: document.querySelector("#monthly-total"),
  yearlyTotal: document.querySelector("#yearly-total"),
  nextCharge: document.querySelector("#next-charge"),
  nextChargeDetails: document.querySelector("#next-charge-details"),
  activeCount: document.querySelector("#active-count"),
  themeToggle: document.querySelector("#theme-toggle"),
  authOpenButton: document.querySelector("#auth-open-button"),
  authGate: document.querySelector("#auth-gate"),
  authForm: document.querySelector("#auth-form"),
  authTabs: document.querySelectorAll(".auth-tab"),
  authFeedback: document.querySelector("#auth-feedback"),
  authNote: document.querySelector("#auth-note"),
  authSubmitButton: document.querySelector("#auth-submit-button"),
  closeAuthButton: document.querySelector("#close-auth-button"),
  authSkipButton: document.querySelector("#auth-skip-button"),
  nameField: document.querySelector("#name-field"),
  telegramField: document.querySelector("#telegram-field"),
  welcomeTitle: document.querySelector("#welcome-title"),
  welcomeText: document.querySelector("#welcome-text"),
  planTitle: document.querySelector("#plan-title"),
  planBadge: document.querySelector("#plan-badge"),
  planText: document.querySelector("#plan-text"),
  planCaption: document.querySelector("#plan-caption"),
  planProgressBar: document.querySelector("#plan-progress-bar"),
  tariffCards: document.querySelectorAll(".tariff-card"),
  adminPanel: document.querySelector("#admin-panel"),
  premiumRequestsList: document.querySelector("#premium-requests-list"),
  premiumMembersList: document.querySelector("#premium-members-list")
};

let auth;
let db;
let functions;
let grantPremiumCallable;
let revokePremiumCallable;

applyTheme(loadTheme());
bindUiListeners();
render();

if (FIREBASE_READY) {
  initializeFirebaseRuntime();
} else {
  showSetupBanner("Заполни `firebase-config.js`, создай Firebase-проект и включи Email/Password Auth. После этого приложение перейдет на безопасную cloud-схему.");
}

function bindUiListeners() {
  elements.openFormButton.addEventListener("click", () => {
    if (!FIREBASE_READY) {
      showSetupBanner("Форма добавления подписок будет активна после подключения Firebase.");
      return;
    }

    if (!state.currentUser) {
      openAuthGate();
      setAuthFeedback("Сначала создай аккаунт или войди.", "error");
      return;
    }

    if (hasReachedFreeLimit()) {
      openPremiumModal();
      return;
    }

    openModal();
  });

  elements.closeFormButton.addEventListener("click", closeModal);
  elements.closePremiumButton.addEventListener("click", closePremiumModal);
  elements.laterPremiumButton.addEventListener("click", closePremiumModal);
  elements.openPremiumButton.addEventListener("click", openPremiumModal);
  elements.closeAuthButton.addEventListener("click", closeAuthGate);
  elements.authSkipButton.addEventListener("click", closeAuthGate);

  elements.modal.addEventListener("click", (event) => {
    if (event.target === elements.modal) {
      closeModal();
    }
  });

  elements.premiumModal.addEventListener("click", (event) => {
    if (event.target === elements.premiumModal) {
      closePremiumModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.modal.classList.contains("is-open")) {
      closeModal();
    }

    if (event.key === "Escape" && elements.premiumModal.classList.contains("is-open")) {
      closePremiumModal();
    }

    if (event.key === "Escape" && elements.authGate.classList.contains("is-open")) {
      closeAuthGate();
    }
  });

  elements.form.addEventListener("reset", () => {
    requestAnimationFrame(() => {
      elements.form.querySelector("input[name='name']").focus();
    });
  });

  elements.form.addEventListener("submit", handleSubscriptionSubmit);
  elements.authForm.addEventListener("submit", handleAuthSubmit);

  elements.subscriptionsBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.dataset.id || !state.currentUser) {
      return;
    }

    await deleteDoc(doc(db, "users", state.currentUser.uid, "subscriptions", target.dataset.id));
  });

  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.currentFilter = button.dataset.filter || "all";
      elements.filterButtons.forEach((item) => item.classList.toggle("active", item === button));
      renderTable();
      renderReminders();
    });
  });

  elements.themeToggle.addEventListener("click", async () => {
    const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);

    if (FIREBASE_READY && state.currentUser) {
      await saveThemePreference(nextTheme);
    }
  });

  elements.activatePremiumButton.addEventListener("click", handlePremiumRequest);

  elements.tariffCards.forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedPlan = card.dataset.plan || "monthly";
      updateTariffUi();
    });
  });

  elements.authOpenButton.addEventListener("click", async () => {
    if (!FIREBASE_READY) {
      showSetupBanner("Кнопка входа заработает после подключения Firebase.");
      return;
    }

    if (state.currentUser) {
      await signOut(auth);
      setAuthFeedback("Ты вышел из аккаунта.", "success");
      return;
    }

    openAuthGate();
  });

  elements.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      state.authMode = tab.dataset.authMode || "register";
      updateAuthModeUi();
    });
  });

  elements.premiumRequestsList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.dataset.action === "approve-request") {
      await grantPremiumCallable({
        uid: target.dataset.uid,
        plan: target.dataset.plan,
        requestId: target.dataset.requestId
      });
    }
  });

  elements.premiumMembersList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) {
      return;
    }

    if (target.dataset.action === "revoke-premium") {
      await revokePremiumCallable({
        uid: target.dataset.uid
      });
    }
  });
}

function initializeFirebaseRuntime() {
  try {
    const app = initializeApp(firebaseWebConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    functions = getFunctions(app, firebaseOptions.functionsRegion || "us-central1");
    grantPremiumCallable = httpsCallable(functions, "grantPremium");
    revokePremiumCallable = httpsCallable(functions, "revokePremium");

    onAuthStateChanged(auth, async (user) => {
      cleanupLiveListeners();
      state.currentUser = user;
      state.profile = null;
      state.tokenClaims = {};
      state.subscriptions = [];
      state.premiumRequests = [];
      state.premiumMembers = [];

      if (!user) {
        render();
        return;
      }

      await ensureUserProfile(user, {});
      const tokenResult = await getIdTokenResult(user, true);
      state.tokenClaims = tokenResult.claims || {};

      subscribeToUserProfile(user.uid);
      subscribeToSubscriptions(user.uid);

      if (isAdmin()) {
        subscribeToPremiumRequests();
        subscribeToPremiumMembers();
      }

      render();
    });
  } catch (error) {
    state.firebaseError = getErrorMessage(error);
    showSetupBanner(`Firebase не инициализировался: ${state.firebaseError}`);
  }
}

async function handleSubscriptionSubmit(event) {
  event.preventDefault();

  if (!state.currentUser) {
    openAuthGate();
    setAuthFeedback("Сначала войди в аккаунт.", "error");
    return;
  }

  const formData = new FormData(elements.form);
  const subscription = {
    name: String(formData.get("name")).trim(),
    price: Number(formData.get("price")),
    currency: String(formData.get("currency")),
    billingPeriod: String(formData.get("billingPeriod")),
    nextChargeDate: String(formData.get("nextChargeDate")),
    category: String(formData.get("category")),
    notificationChannel: String(formData.get("notificationChannel")),
    contact: String(formData.get("contact")).trim(),
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (!subscription.name || Number.isNaN(subscription.price) || !subscription.nextChargeDate) {
    return;
  }

  if (hasReachedFreeLimit()) {
    closeModal();
    openPremiumModal();
    return;
  }

  await addDoc(collection(db, "users", state.currentUser.uid, "subscriptions"), subscription);
  elements.form.reset();
  closeModal();
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (!FIREBASE_READY) {
    showSetupBanner("Сначала заполни Firebase-конфиг.");
    return;
  }

  const formData = new FormData(elements.authForm);
  const displayName = String(formData.get("displayName") || "").trim();
  const telegramUsername = sanitizeTelegramUsername(String(formData.get("telegramUsername") || "").trim());
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "").trim();

  if (!email || !password || (state.authMode === "register" && !displayName)) {
    setAuthFeedback("Заполни обязательные поля.", "error");
    return;
  }

  if (password.length < 10) {
    setAuthFeedback("Для безопасного входа пароль должен быть не короче 10 символов.", "error");
    return;
  }

  try {
    if (state.authMode === "register") {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });
      await ensureUserProfile(userCredential.user, { displayName, telegramUsername });
      setAuthFeedback("Аккаунт создан.", "success");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }

    elements.authForm.reset();
    closeAuthGate();
  } catch (error) {
    setAuthFeedback(getAuthErrorMessage(error), "error");
  }
}

async function handlePremiumRequest() {
  if (!state.currentUser) {
    closePremiumModal();
    openAuthGate();
    setAuthFeedback("Чтобы оформить Premium безопасно, сначала войди в аккаунт.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "premiumRequests"), {
      uid: state.currentUser.uid,
      email: state.currentUser.email,
      displayName: state.profile?.displayName || state.currentUser.displayName || "",
      telegram: state.profile?.telegramUsername || "",
      plan: state.selectedPlan,
      status: "pending",
      createdAt: serverTimestamp(),
      approvedBy: null
    });

    closePremiumModal();
    window.open(buildTelegramPremiumUrl(state.selectedPlan), "_blank", "noopener,noreferrer");
  } catch (error) {
    showSetupBanner(`Не удалось создать заявку на Premium: ${getErrorMessage(error)}`);
  }
}

async function ensureUserProfile(user, patch) {
  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);
  const baseData = {
    displayName: patch.displayName || user.displayName || "User",
    email: user.email,
    telegramUsername: patch.telegramUsername || "",
    theme: loadTheme(),
    updatedAt: serverTimestamp()
  };

  if (!userSnapshot.exists()) {
    await setDoc(userRef, {
      ...baseData,
      createdAt: serverTimestamp()
    });
    return;
  }

  if (patch.displayName || patch.telegramUsername) {
    await updateDoc(userRef, baseData);
  }
}

function subscribeToUserProfile(uid) {
  state.unsubProfile = onSnapshot(doc(db, "users", uid), (snapshot) => {
    state.profile = snapshot.exists() ? normalizeProfile(snapshot.data()) : null;

    if (state.profile?.theme && state.profile.theme !== loadTheme()) {
      applyTheme(state.profile.theme);
      localStorage.setItem(THEME_KEY, state.profile.theme);
    }

    render();
  });
}

function subscribeToSubscriptions(uid) {
  const subscriptionsQuery = query(
    collection(db, "users", uid, "subscriptions"),
    orderBy("nextChargeDate", "asc")
  );

  state.unsubSubscriptions = onSnapshot(subscriptionsQuery, (snapshot) => {
    state.subscriptions = snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }));
    render();
  });
}

function subscribeToPremiumRequests() {
  const requestsQuery = query(
    collection(db, "premiumRequests"),
    orderBy("createdAt", "desc"),
    limit(20)
  );

  state.unsubRequests = onSnapshot(requestsQuery, (snapshot) => {
    state.premiumRequests = snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }));
    renderAdminPanel();
  });
}

function subscribeToPremiumMembers() {
  const premiumUsersQuery = query(
    collection(db, "users"),
    where("isPremium", "==", true),
    limit(20)
  );

  state.unsubPremiumMembers = onSnapshot(premiumUsersQuery, (snapshot) => {
    state.premiumMembers = snapshot.docs.map((documentSnapshot) => ({
      id: documentSnapshot.id,
      ...documentSnapshot.data()
    }));
    renderAdminPanel();
  });
}

function cleanupLiveListeners() {
  state.unsubProfile?.();
  state.unsubSubscriptions?.();
  state.unsubRequests?.();
  state.unsubPremiumMembers?.();
  state.unsubProfile = null;
  state.unsubSubscriptions = null;
  state.unsubRequests = null;
  state.unsubPremiumMembers = null;
}

function openModal() {
  elements.modal.classList.add("is-open");
  elements.modal.setAttribute("aria-hidden", "false");
  syncBodyLock();
  elements.form.querySelector("input[name='name']").focus();
}

function closeModal() {
  elements.modal.classList.remove("is-open");
  elements.modal.setAttribute("aria-hidden", "true");
  syncBodyLock();
}

function openPremiumModal() {
  updateTariffUi();
  elements.premiumModal.classList.add("is-open");
  elements.premiumModal.setAttribute("aria-hidden", "false");
  syncBodyLock();
}

function closePremiumModal() {
  elements.premiumModal.classList.remove("is-open");
  elements.premiumModal.setAttribute("aria-hidden", "true");
  syncBodyLock();
}

function openAuthGate() {
  updateAuthModeUi();
  elements.authGate.classList.add("is-open");
  elements.authGate.setAttribute("aria-hidden", "false");
  syncBodyLock();
  requestAnimationFrame(() => {
    const input = state.authMode === "register"
      ? elements.authForm.querySelector("input[name='displayName']")
      : elements.authForm.querySelector("input[name='email']");
    input?.focus();
  });
}

function closeAuthGate() {
  elements.authGate.classList.remove("is-open");
  elements.authGate.setAttribute("aria-hidden", "true");
  syncBodyLock();
}

function updateAuthModeUi() {
  elements.authTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.authMode === state.authMode);
  });

  const showRegisterFields = state.authMode === "register";
  elements.nameField.classList.toggle("hidden", !showRegisterFields);
  elements.telegramField.classList.toggle("hidden", !showRegisterFields);
  elements.authNote.textContent = showRegisterFields
    ? "Аккаунт создается через Firebase Auth, а данные профиля хранятся в Firestore."
    : "Вход выполняется через Firebase Auth. Роль admin проверяется по server-side custom claims.";
  elements.authSubmitButton.textContent = showRegisterFields ? "Создать аккаунт" : "Войти";
  setAuthFeedback("", "");
}

function updateAuthUi() {
  const displayName = state.profile?.displayName || state.currentUser?.displayName || "Гость";
  const roleLabel = isAdmin() ? "Admin" : "User";

  elements.authOpenButton.textContent = state.currentUser ? `${displayName} · Выйти` : "Войти";
  elements.welcomeTitle.textContent = state.currentUser
    ? `${displayName}, подписки под контролем`
    : "Устал держать подписки в голове?";
  elements.welcomeText.textContent = state.currentUser
    ? `Текущий доступ: ${roleLabel}. Подписки и Premium хранятся безопасно в облаке, а не в localStorage.`
    : "Собери все списания в одном месте, смотри общую нагрузку и не пропускай ближайшие платежи.";
}

function setAuthFeedback(message, type) {
  elements.authFeedback.textContent = message;
  elements.authFeedback.classList.remove("is-error", "is-success");

  if (type === "error") {
    elements.authFeedback.classList.add("is-error");
  }

  if (type === "success") {
    elements.authFeedback.classList.add("is-success");
  }
}

function render() {
  updateAuthUi();
  updateTariffUi();
  renderMetrics();
  renderPlan();
  renderTable();
  renderReminders();
  renderAdminPanel();
}

function renderMetrics() {
  const activeSubscriptions = state.subscriptions.filter((item) => item.status === "active");
  const monthly = activeSubscriptions.reduce((sum, item) => sum + toMonthlyAmount(item), 0);
  const yearly = activeSubscriptions.reduce((sum, item) => sum + toYearlyAmount(item), 0);
  const nearest = [...activeSubscriptions].sort(compareByDate)[0];

  elements.monthlyTotal.textContent = formatCurrency(monthly);
  elements.yearlyTotal.textContent = formatCurrency(yearly);
  elements.activeCount.textContent = String(activeSubscriptions.length);

  if (!nearest) {
    elements.nextCharge.textContent = "Нет данных";
    elements.nextChargeDetails.textContent = state.currentUser
      ? "Добавь первую подписку"
      : "Войди, чтобы начать вести подписки";
    return;
  }

  elements.nextCharge.textContent = formatDate(nearest.nextChargeDate);
  elements.nextChargeDetails.textContent = `${nearest.name} · ${formatCurrency(nearest.price, nearest.currency)} · ${getDaysUntilLabel(nearest.nextChargeDate)}`;
}

function renderPlan() {
  const count = state.subscriptions.length;
  const isPremium = Boolean(state.profile?.isPremium || state.tokenClaims.premium);
  const usagePercent = isPremium ? 100 : Math.min((count / FREE_SUBSCRIPTION_LIMIT) * 100, 100);

  elements.planTitle.textContent = isPremium ? "Premium" : "Free";
  elements.planBadge.textContent = isPremium ? "Без лимита" : `${FREE_SUBSCRIPTION_LIMIT} бесплатно`;
  elements.planText.textContent = isPremium
    ? `У тебя Premium (${formatPlanName(state.profile?.premiumPlan)}). Статус выдается только admin-функцией на сервере.`
    : `Первые ${FREE_SUBSCRIPTION_LIMIT} подписок доступны бесплатно. Для расширения оставь заявку и напиши в Telegram.`;
  elements.planCaption.textContent = isPremium
    ? formatPremiumCaption()
    : `${count} из ${FREE_SUBSCRIPTION_LIMIT} использовано`;
  elements.planProgressBar.style.width = `${usagePercent}%`;
  elements.openPremiumButton.textContent = isPremium ? "Написать в Telegram" : "Купить Premium в Telegram";
}

function renderTable() {
  elements.subscriptionsBody.innerHTML = "";

  const filteredSubscriptions = state.subscriptions.filter(matchesFilter).sort(compareByDate);
  elements.emptyState.style.display = filteredSubscriptions.length ? "none" : "block";

  filteredSubscriptions.forEach((item) => {
    const row = elements.template.content.firstElementChild.cloneNode(true);
    const serviceName = row.querySelector(".service-name");
    const serviceCategory = row.querySelector(".service-category");
    const servicePrice = row.querySelector(".service-price");
    const servicePeriod = row.querySelector(".service-period");
    const serviceDate = row.querySelector(".service-date");
    const serviceNotification = row.querySelector(".service-notification");
    const serviceActions = row.querySelector(".service-actions");

    serviceName.textContent = item.name;
    serviceCategory.textContent = item.category;
    servicePrice.textContent = formatCurrency(item.price, item.currency);
    servicePeriod.textContent = item.billingPeriod === "yearly" ? "Год" : "Месяц";
    serviceDate.textContent = `${formatDate(item.nextChargeDate)} · ${getDaysUntilLabel(item.nextChargeDate)}`;
    serviceNotification.textContent = formatNotification(item);

    serviceName.dataset.label = "Сервис";
    serviceCategory.dataset.label = "Категория";
    servicePrice.dataset.label = "Цена";
    servicePeriod.dataset.label = "Период";
    serviceDate.dataset.label = "Списание";
    serviceNotification.dataset.label = "Уведомление";
    serviceActions.dataset.label = "Действие";

    const deleteButton = row.querySelector(".delete-button");
    deleteButton.dataset.id = item.id;
    elements.subscriptionsBody.appendChild(row);
  });
}

function renderReminders() {
  elements.reminderList.innerHTML = "";

  const reminderCandidates = state.subscriptions
    .filter((item) => item.status === "active")
    .filter((item) => daysUntil(item.nextChargeDate) >= 0 && daysUntil(item.nextChargeDate) <= DAYS_BEFORE_REMINDER)
    .sort(compareByDate);

  if (!reminderCandidates.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-reminder";
    emptyItem.textContent = "В ближайшие 3 дня списаний нет.";
    elements.reminderList.appendChild(emptyItem);
    return;
  }

  reminderCandidates.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = `${item.name}: ${formatDate(item.nextChargeDate)} (${getDaysUntilLabel(item.nextChargeDate)}), уведомление через ${item.notificationChannel === "telegram" ? "Telegram" : "email"}.`;
    elements.reminderList.appendChild(listItem);
  });
}

function renderAdminPanel() {
  const shouldShow = isAdmin();
  elements.adminPanel.classList.toggle("hidden", !shouldShow);

  if (!shouldShow) {
    return;
  }

  const requestsMarkup = state.premiumRequests.length
    ? state.premiumRequests.map((request) => `
      <div class="admin-item">
        <h4>${escapeHtml(request.displayName || request.email || request.uid)}</h4>
        <p><span class="status-pill">${escapeHtml(request.status || "pending")}</span></p>
        <p>План: ${escapeHtml(formatPlanName(request.plan))}</p>
        <p>Email: ${escapeHtml(request.email || "не указан")}</p>
        <p>Telegram: ${escapeHtml(request.telegram || "не указан")}</p>
        <div class="admin-actions">
          <button class="primary-button" type="button" data-action="approve-request" data-uid="${escapeHtml(request.uid || "")}" data-plan="${escapeHtml(request.plan || "monthly")}" data-request-id="${escapeHtml(request.id)}">Выдать Premium</button>
          <a class="secondary-button tg-link-button" href="${buildTelegramUserUrl(request.telegram)}" target="_blank" rel="noreferrer">Открыть Telegram</a>
        </div>
      </div>
    `).join("")
    : '<p class="admin-empty">Заявок пока нет.</p>';

  const membersMarkup = state.premiumMembers.length
    ? state.premiumMembers.map((member) => `
      <div class="admin-item">
        <h4>${escapeHtml(member.displayName || member.email || member.id)}</h4>
        <p>План: ${escapeHtml(formatPlanName(member.premiumPlan))}</p>
        <p>Premium до: ${escapeHtml(formatPremiumUntil(member.premiumUntil))}</p>
        <div class="admin-actions">
          <button class="secondary-button" type="button" data-action="revoke-premium" data-uid="${escapeHtml(member.id)}">Снять Premium</button>
        </div>
      </div>
    `).join("")
    : '<p class="admin-empty">Активных Premium-пользователей пока нет.</p>';

  elements.premiumRequestsList.innerHTML = requestsMarkup;
  elements.premiumMembersList.innerHTML = membersMarkup;
}

function updateTariffUi() {
  const planNames = {
    monthly: "Premium Month",
    yearly: "Premium Year",
    lifetime: "Lifetime"
  };

  elements.tariffCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.plan === state.selectedPlan);
  });

  elements.activatePremiumButton.textContent = `Купить ${planNames[state.selectedPlan] || "Premium"} в Telegram`;
}

async function saveThemePreference(theme) {
  if (!state.currentUser) {
    return;
  }

  try {
    await updateDoc(doc(db, "users", state.currentUser.uid), {
      theme,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
  }
}

function showSetupBanner(message) {
  elements.setupBanner.classList.remove("hidden");
  elements.setupBannerText.textContent = message;
}

function hideSetupBanner() {
  if (FIREBASE_READY && !state.firebaseError) {
    elements.setupBanner.classList.add("hidden");
  }
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  elements.themeToggle.textContent = theme === "dark" ? "Светлая тема" : "Темная тема";
}

function loadTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function normalizeProfile(data) {
  return {
    displayName: data.displayName || "User",
    email: data.email || "",
    telegramUsername: data.telegramUsername || "",
    theme: data.theme || loadTheme(),
    isPremium: Boolean(data.isPremium),
    premiumPlan: data.premiumPlan || null,
    premiumUntil: data.premiumUntil || null
  };
}

function sanitizeTelegramUsername(username) {
  if (!username) {
    return "";
  }

  return username.startsWith("@") ? username : `@${username}`;
}

function hasReachedFreeLimit() {
  return !Boolean(state.profile?.isPremium || state.tokenClaims.premium)
    && state.subscriptions.length >= FREE_SUBSCRIPTION_LIMIT;
}

function matchesFilter(item) {
  if (state.currentFilter === "active") {
    return item.status === "active";
  }

  if (state.currentFilter === "soon") {
    const days = daysUntil(item.nextChargeDate);
    return days >= 0 && days <= DAYS_BEFORE_REMINDER;
  }

  return true;
}

function isAdmin() {
  return state.tokenClaims.role === "admin";
}

function formatPlanName(plan) {
  const planNames = {
    monthly: "Month",
    yearly: "Year",
    lifetime: "Lifetime"
  };

  return planNames[plan] || "Premium";
}

function formatPremiumCaption() {
  if (!state.profile?.premiumUntil) {
    return "Lifetime или бессрочный доступ";
  }

  return `Активен до ${formatPremiumUntil(state.profile.premiumUntil)}`;
}

function formatPremiumUntil(value) {
  if (!value) {
    return "без срока";
  }

  if (typeof value.toDate === "function") {
    return formatDate(value.toDate());
  }

  return formatDate(value);
}

function buildTelegramPremiumUrl(plan) {
  const planNames = {
    monthly: "Premium Month - 199 RUB / month",
    yearly: "Premium Year - 1490 RUB / year",
    lifetime: "Lifetime - 2990 RUB"
  };

  const chosenPlan = planNames[plan] || "Premium";
  const displayName = state.profile?.displayName || state.currentUser?.displayName || "Гость";
  const uid = state.currentUser?.uid || "guest";
  const message = `Привет! Хочу купить ${chosenPlan}. Имя: ${displayName}. UID: ${uid}.`;

  return `https://t.me/${TELEGRAM_USERNAME}?text=${encodeURIComponent(message)}`;
}

function buildTelegramUserUrl(username) {
  if (!username) {
    return `https://t.me/${TELEGRAM_USERNAME}`;
  }

  return `https://t.me/${username.replace("@", "")}`;
}

function syncBodyLock() {
  const shouldLock = elements.modal.classList.contains("is-open")
    || elements.premiumModal.classList.contains("is-open")
    || elements.authGate.classList.contains("is-open");

  document.body.classList.toggle("modal-open", shouldLock);
}

function toMonthlyAmount(item) {
  return item.billingPeriod === "yearly" ? item.price / 12 : item.price;
}

function toYearlyAmount(item) {
  return item.billingPeriod === "yearly" ? item.price : item.price * 12;
}

function compareByDate(a, b) {
  return new Date(a.nextChargeDate).getTime() - new Date(b.nextChargeDate).getTime();
}

function formatCurrency(value, currency = "RUB") {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: safeValue % 1 === 0 ? 0 : 2
  }).format(safeValue);
}

function formatDate(dateInput) {
  const date = typeof dateInput === "string" || dateInput instanceof Date
    ? new Date(dateInput)
    : dateInput?.toDate?.() || new Date();

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function daysUntil(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);

  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysUntilLabel(dateString) {
  const diff = daysUntil(dateString);

  if (diff === 0) {
    return "сегодня";
  }

  if (diff === 1) {
    return "завтра";
  }

  if (diff < 0) {
    return `${Math.abs(diff)} дн. назад`;
  }

  return `через ${diff} дн.`;
}

function formatNotification(item) {
  const channel = item.notificationChannel === "telegram" ? "Telegram" : "Email";
  return item.contact ? `${channel}: ${item.contact}` : channel;
}

function getAuthErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "Этот email уже занят.",
    "auth/invalid-email": "Некорректный email.",
    "auth/invalid-credential": "Неверный email или пароль.",
    "auth/weak-password": "Пароль слишком слабый.",
    "auth/network-request-failed": "Проблема с сетью. Повтори позже."
  };

  return messages[error.code] || getErrorMessage(error);
}

function getErrorMessage(error) {
  if (error?.message) {
    return error.message;
  }

  return "Неизвестная ошибка.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

