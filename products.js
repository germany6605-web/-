/* Рудокоп: каталог платных товаров для VK и Одноклассников.
   Один файл используется и игрой (window.OreProducts), и серверными
   обработчиками платежей из папки server/ (require('../products.js')).
   id совпадают с Core.PRODUCTS в core.js. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OreProducts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // vk: цена в голосах (1 голос ≈ 7 ₽); ok: цена в ОКах (1 ОК ≈ 1 ₽).
  var ITEMS = [
    { id: 'ore_x2_1h', title: 'Добыча руды ×2 на 1 час', vk: 2, ok: 15 },
    { id: 'ore_x2_2h', title: 'Добыча руды ×2 на 2 часа', vk: 4, ok: 30 },
    { id: 'ore_x2_5h', title: 'Добыча руды ×2 на 5 часов', vk: 10, ok: 67 },
    { id: 'ore_x2_24h', title: 'Добыча руды ×2 на 24 часа', vk: 36, ok: 250 },
    { id: 'spins_1', title: '+1 спин колеса фортуны', vk: 2, ok: 10 },
    { id: 'spins_3', title: '+3 спина колеса фортуны', vk: 4, ok: 25 },
    { id: 'spins_10', title: '+10 спинов колеса фортуны', vk: 11, ok: 75 },
    { id: 'ore_x3_1h', title: 'Добыча руды ×3 на 1 час', vk: 4, ok: 25 },
    { id: 'ore_x2_forever', title: 'Добыча руды ×2 навсегда', vk: 70, ok: 500 }
  ];
  function find(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }
  function votesWord(n) {
    var a = n % 10, b = n % 100;
    if (a === 1 && b !== 11) return 'голос';
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return 'голоса';
    return 'голосов';
  }
  function priceText(platform, id) {
    var item = find(id);
    if (!item) return '';
    if (platform === 'vk') return item.vk + ' ' + votesWord(item.vk);
    if (platform === 'ok') return item.ok + ' ОК';
    return item.ok + ' ₽';
  }
  return Object.freeze({ ITEMS: ITEMS, find: find, priceText: priceText });
});
