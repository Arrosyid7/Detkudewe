/**
 * api-bridge.js
 * ==============
 * Meniru API "google.script.run" yang biasanya cuma tersedia kalau HTML
 * disajikan LANGSUNG oleh Google Apps Script. Karena sekarang frontend
 * di-host terpisah (GitHub Pages/dll) dan backend cuma dipanggil lewat
 * fetch() ke Web App URL, file ini menjembatani supaya script.js (hasil
 * port dari script.html) TIDAK PERLU DIUBAH SAMA SEKALI — semua pemanggilan
 * gaya lama tetap jalan:
 *
 *   google.script.run
 *     .withSuccessHandler(function (data) { ... })
 *     .withFailureHandler(function (err) { ... })
 *     .getDashboardData(monthKey);
 *
 * Di belakang layar, ini akan fetch ke DETKUDEWE_API_URL (lihat config.js)
 * dengan action = nama fungsi yang dipanggil ("getDashboardData") dan
 * args = argumen yang kamu kirim.
 *
 * Kalau suatu saat kamu tambah fungsi backend baru di Code.gs (dan sudah
 * ditambahkan ke whitelist di sana), kamu TIDAK PERLU sentuh file ini —
 * tinggal panggil google.script.run....namaFungsiBaru(...) dari script.js
 * seperti biasa.
 */
(function () {
  'use strict';

  function apiUrl() {
    var url = window.DETKUDEWE_API_URL;
    if (!url || url.indexOf('PASTE_WEB_APP_URL_DARI_GAS_DI_SINI') !== -1) {
      throw new Error('DETKUDEWE_API_URL belum diisi. Buka config.js dan isi dengan Web App URL dari Apps Script.');
    }
    return url;
  }

  // Fungsi yang namanya diawali "get" dianggap operasi baca -> dikirim via GET.
  // Sisanya (add/update/delete/save/seed/reset/parseVoiceText) dikirim via POST.
  function isReadAction(action) {
    return /^get/.test(action);
  }

  function callBackend(action, args) {
    var base = apiUrl();

    if (isReadAction(action)) {
      var qs = '?action=' + encodeURIComponent(action) + '&args=' + encodeURIComponent(JSON.stringify(args || []));
      return fetch(base + qs, { method: 'GET' }).then(handleResponse);
    }

    return fetch(base, {
      method: 'POST',
      // text/plain WAJIB dipakai (bukan application/json) supaya browser
      // tidak mengirim CORS preflight (OPTIONS), karena Apps Script Web App
      // tidak menangani preflight itu. Body-nya tetap JSON valid, cuma
      // header Content-Type-nya saja yang "disamarkan" jadi text/plain.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, args: args || [] })
    }).then(handleResponse);
  }

  function handleResponse(res) {
    if (!res.ok) {
      throw new Error('Server error (HTTP ' + res.status + ')');
    }
    return res.json().then(function (json) {
      if (!json || json.success !== true) {
        throw new Error((json && json.message) || 'Hmm, ada sedikit masalah. Coba lagi ya.');
      }
      return json.data;
    });
  }

  // ---- Shim google.script.run ----
  // Setiap kali "google.script.run" diakses, dibuat runner baru (state
  // successHandler/failureHandler bersih), persis perilaku aslinya.
  function makeRunner() {
    var successHandler = null;
    var failureHandler = null;

    var runner = new Proxy({}, {
      get: function (target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (fn) { successHandler = fn; return runner; };
        }
        if (prop === 'withFailureHandler') {
          return function (fn) { failureHandler = fn; return runner; };
        }
        if (typeof prop !== 'string') return undefined;

        // prop = nama fungsi backend yang dipanggil, misal "getDashboardData"
        return function () {
          var args = Array.prototype.slice.call(arguments);
          callBackend(prop, args).then(function (data) {
            if (successHandler) successHandler(data);
          }).catch(function (err) {
            if (failureHandler) failureHandler(err.message || err);
            else console.error('[detkudewe api]', err);
          });
        };
      }
    });

    return runner;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  Object.defineProperty(window.google.script, 'run', {
    configurable: true,
    get: function () { return makeRunner(); }
  });
})();
