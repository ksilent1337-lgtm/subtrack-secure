# SubTrack

Безопасная версия лендинга и трекера подписок на `Firebase Auth + Firestore + Cloud Functions`.

## Что изменилось

- `localStorage` больше не используется как источник прав и аккаунтов.
- Вход и регистрация идут через `Firebase Auth`.
- Профиль, подписки и заявки на Premium живут в `Firestore`.
- Выдача и снятие `Premium` доступны только через server-side `Cloud Functions`.
- Для администратора предусмотрен отдельный аккаунт с custom claim `role=admin`.

## Структура проекта

- `index.html` — лендинг, модалки входа и Premium, admin-панель.
- `styles.css` — десктопные и мобильные стили.
- `app.js` — фронтенд-логика на Firebase SDK.
- `firebase-config.js` — локальный конфиг Firebase Web SDK.
- `firebase-config.example.js` — шаблон конфига.
- `firestore.rules` — правила доступа Firestore.
- `firestore.indexes.json` — индексы Firestore.
- `firebase.json` — конфиг Firebase Hosting / Firestore / Functions.
- `functions/index.js` — серверные функции `grantPremium` и `revokePremium`.
- `functions/scripts/bootstrap-admin.mjs` — создание отдельного admin-аккаунта.
- `.gitignore` — защита от случайной публикации локальных секретов.
- `env.example` — переменные для безопасного bootstrap admin.

## Как подключить Firebase

### 1. Создай Firebase-проект

В консоли Firebase:

- включи `Authentication` -> `Email/Password`
- создай `Firestore Database`
- включи `Firebase Hosting`

### 2. Заполни `firebase-config.js`

Скопируй `firebase-config.example.js` в `firebase-config.js` и подставь данные твоего проекта.

Важно: web-config Firebase можно хранить на фронте. Это не admin-secret.

### 3. Установи зависимости для functions

```bash
cd functions
npm install
```

### 4. Создай отдельный admin-аккаунт

Нужен сервисный ключ Firebase Admin SDK и переменные окружения из `env.example`.

Пример:

```bash
cd functions
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\serviceAccountKey.json"
$env:SUBTRACK_ADMIN_EMAIL="admin@example.com"
$env:SUBTRACK_ADMIN_PASSWORD="super-long-random-password"
$env:SUBTRACK_ADMIN_DISPLAY_NAME="SubTrack Admin"
npm run bootstrap-admin
```

Скрипт:

- создаст пользователя, если его нет
- обновит пароль, если пользователь уже есть
- назначит custom claim `role=admin`

## Как работает безопасность

### Пользователь

- может читать и менять только свои подписки
- может менять только безопасные поля своего профиля
- не может сам себе поставить `isPremium`, `premiumPlan`, `role`

### Администратор

- определяется по `custom claims`, а не по полю в браузере
- видит admin-панель только после входа под admin-аккаунтом
- выдает и снимает Premium только через `Cloud Functions`

## Telegram-покупка Premium

Покупка остается через `@Dof_white`:

1. Пользователь выбирает тариф.
2. Создается заявка в `premiumRequests`.
3. Открывается Telegram с подготовленным сообщением.
4. Администратор подтверждает оплату вручную.
5. Admin нажимает `Выдать Premium` в admin-панели.

## Как выложить код на GitHub безопасно

Можно публиковать репозиторий публично, если:

- не коммитить service account JSON
- не класть admin-пароль в код
- не коммитить локальные `.env`
- оставить `.gitignore` как есть

Коммитить можно:

- `firebase-config.js` с web-config
- `firestore.rules`
- `functions/index.js`
- фронтенд-код

Нельзя коммитить:

- `serviceAccountKey.json`
- локальные `.env` с секретами

## Как задеплоить на бесплатный хостинг Firebase

После настройки проекта:

```bash
firebase login
firebase use --add
firebase deploy --only firestore:rules,functions,hosting
```

После этого сайт будет работать 24/7 без твоего компьютера.

## Что уже есть в интерфейсе

- лендинг с hero-блоком
- безопасный вход / регистрация
- хранение подписок в облаке
- первые 5 подписок бесплатно
- заявка на Premium через Telegram
- admin-панель для обработки Telegram-заявок
- светлая и темная тема
- адаптив под телефон
