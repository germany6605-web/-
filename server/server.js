/* Рудокоп: сервер подтверждения платежей VK и Одноклассников + раздача файлов игры.
   Без зависимостей, нужен только Node.js 18+.

   Запуск:
     VK_SECRET=... OK_SECRET=... PORT=8080 node server/server.js

   Адреса для кабинетов разработчика:
     ВКонтакте → «Платежи» → «Адрес обратного вызова»:  https://ваш-домен/payments/vk
     Одноклассники → «Callback URL для платежей»:        https://ваш-домен/payments/ok
   Игра доступна по адресу https://ваш-домен/ (index.html из корня репозитория). */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Products = require('../products.js');

const PORT = Number(process.env.PORT) || 8080;
const VK_SECRET = process.env.VK_SECRET || '';   // «Защищённый ключ» приложения VK
const OK_SECRET = process.env.OK_SECRET || '';   // «Секретный ключ приложения» OK
const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Обработанные заказы, чтобы на повторное уведомление отвечать тем же результатом.
// Для боевого сервера замените на базу данных.
const vkOrders = new Map();
const okTransactions = new Set();

const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
// Обе платформы подписывают запрос одинаково: md5(отсортированные "ключ=значение" без sig + секрет).
function signature(params, secret) {
  return md5(Object.keys(params).filter(k => k !== 'sig').sort().map(k => k + '=' + params[k]).join('') + secret);
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* https://dev.vk.com/ru/api/payments/notifications/overview */
function handleVk(params) {
  const error = (code, msg) => ({ error: { error_code: code, error_msg: msg, critical: true } });
  if (!VK_SECRET || !safeEqual(signature(params, VK_SECRET), params.sig || '')) return error(10, 'Несовпадение вычисленной и переданной подписи запроса.');
  const type = String(params.notification_type || '').replace(/_test$/, '');
  if (type === 'get_item') {
    const item = Products.find(params.item);
    if (!item) return error(20, 'Товара не существует.');
    return { response: { item_id: item.id, title: item.title, price: item.vk } };
  }
  if (type === 'order_status_change') {
    if (params.status !== 'chargeable') return error(100, 'Неизвестный статус заказа.');
    const item = Products.find(params.item);
    if (!item) return error(20, 'Товара не существует.');
    const orderId = String(params.order_id);
    if (!vkOrders.has(orderId)) vkOrders.set(orderId, vkOrders.size + 1);
    // Товар начисляется в самой игре после успешного VKWebAppShowOrderBox.
    return { response: { order_id: Number(orderId), app_order_id: vkOrders.get(orderId) } };
  }
  return error(100, 'Неизвестный тип уведомления.');
}

/* https://apiok.ru/dev/methods/rest/callbacks/callbacks.payment */
function handleOk(params) {
  const fail = (code, msg) => ({ status: 200, headers: { 'invocation-error': String(code) }, body: '<?xml version="1.0" encoding="UTF-8"?><ns2:error_response xmlns:ns2="http://api.forticom.com/1.0/"><error_code>' + code + '</error_code><error_msg>' + msg + '</error_msg></ns2:error_response>' });
  if (!OK_SECRET || !safeEqual(signature(params, OK_SECRET), params.sig || '')) return fail(104, 'PARAM_SIGNATURE : invalid signature');
  const item = Products.find(params.product_code);
  if (!item) return fail(1001, 'CALLBACK_INVALID_PAYMENT : unknown product');
  if (Number(params.amount) !== item.ok) return fail(1001, 'CALLBACK_INVALID_PAYMENT : wrong amount');
  okTransactions.add(String(params.transaction_id));
  // Товар начисляется в самой игре после ответа FAPI.UI.showPayment.
  return { status: 200, headers: {}, body: '<?xml version="1.0" encoding="UTF-8"?><callbacks_payment_response xmlns="http://api.forticom.com/1.0/">true</callbacks_payment_response>' };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveStatic(pathname, res) {
  const file = path.normalize(path.join(ROOT, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)));
  const allowed = file.startsWith(ROOT + path.sep) && !file.startsWith(path.join(ROOT, 'server') + path.sep) && !path.basename(file).startsWith('.');
  if (!allowed) { res.writeHead(404); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/payments/vk') {
      const params = Object.fromEntries(new URLSearchParams(req.method === 'POST' ? await readBody(req) : url.search));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(handleVk(params)));
      return;
    }
    if (url.pathname === '/payments/ok') {
      const params = Object.fromEntries(url.searchParams);
      const out = handleOk(params);
      res.writeHead(out.status, Object.assign({ 'Content-Type': 'application/xml; charset=utf-8' }, out.headers));
      res.end(out.body);
      return;
    }
    serveStatic(url.pathname, res);
  } catch (error) {
    res.writeHead(500);
    res.end();
  }
});

if (require.main === module) server.listen(PORT, () => console.log('Рудокоп: http://localhost:' + PORT));

module.exports = { handleVk, handleOk, signature, server };
