/* Рудокоп: сервер подтверждения платежей VK и Одноклассников + раздача index.html.
   Без зависимостей, нужен только Node.js 18+. Цены берутся из index.html
   (блок <script id="products">), поэтому храните файл рядом с index.html.

   Запуск:
     VK_SECRET=... OK_SECRET=... PORT=8080 node payments-server.js

   Адреса для кабинетов разработчика:
     ВКонтакте → «Платежи» → «Адрес обратного вызова»:  https://ваш-домен/payments/vk
     Одноклассники → «Callback URL для платежей»:        https://ваш-домен/payments/ok
   Игра доступна по адресу https://ваш-домен/ */
'use strict';
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PORT = Number(process.env.PORT) || 8080;
const VK_SECRET = process.env.VK_SECRET || '';   // «Защищённый ключ» приложения VK
const OK_SECRET = process.env.OK_SECRET || '';   // «Секретный ключ приложения» OK
const INDEX = path.join(__dirname, 'index.html');

// Каталог товаров — тот же код, что в игре (<script id="products"> в index.html).
function loadProducts() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const match = /<script id="products">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error('В index.html не найден блок <script id="products">');
  const context = vm.createContext({});
  vm.runInContext(match[1], context);
  return context.OreProducts;
}
const Products = loadProducts();

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

function serveIndex(pathname, res) {
  if (pathname !== '/' && pathname !== '/index.html') { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(INDEX, (err, data) => {
    if (err) { res.writeHead(500); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
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
    serveIndex(url.pathname, res);
  } catch (error) {
    res.writeHead(500);
    res.end();
  }
});

if (require.main === module) server.listen(PORT, () => console.log('Рудокоп: http://localhost:' + PORT));

module.exports = { handleVk, handleOk, signature, server };
