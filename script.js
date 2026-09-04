/**
 * script.js
 * Hasil port 1:1 dari script.html (logic frontend Detkudewe).
 * TIDAK ADA perubahan logic di sini dibanding versi GAS aslinya —
 * semua panggilan google.script.run tetap sama persis, cuma sekarang
 * dijembatani ke fetch() oleh api-bridge.js (lihat file itu & config.js).
 */
(function () {
  'use strict';

  // ================== STATE ==================
  var state = {
    view: 'home',
    monthKey: currentMonthKey(),
    categories: { EXPENSE: [], INCOME: [] },
    settings: null,
    txType: 'EXPENSE',
    selectedCategory: null,
    editingId: null,
    historyFilter: { type: 'ALL', keyword: '' },
    recognition: null,
    charts: {}
  };

  var EMOJI = {
    'Makanan': '🍜', 'Minuman': '☕', 'Transport': '🚗', 'Belanja': '🛍️',
    'Nongkrong': '🍻', 'Hiburan': '🎬', 'Tagihan': '🧾', 'Pulsa & Internet': '📶',
    'Pendidikan': '📚', 'Kesehatan': '💊', 'Kebutuhan Rumah': '🏠', 'Subscription': '🔁',
    'Travel': '✈️', 'Lainnya': '✨',
    'Gaji': '💼', 'Uang Saku': '👛', 'Freelance': '💻', 'Bonus': '🎁',
    'Hadiah': '🎉', 'Penjualan': '🏷️', 'Transfer Masuk': '📥'
  };

  function currentMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

  function monthLabel(key) {
    var names = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var p = key.split('-');
    return names[parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function shiftMonth(key, delta) {
    var p = key.split('-'); var y = parseInt(p[0], 10); var m = parseInt(p[1], 10) + delta;
    if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
    return y + '-' + String(m).padStart(2, '0');
  }

  function formatRupiah(n) {
    n = Math.round(Number(n) || 0);
    var neg = n < 0; n = Math.abs(n);
    return (neg ? '-' : '') + 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  // ================== INIT ==================
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initNav();
    initVoice();
    bindStaticEvents();
    loadCategories();
    loadSettings();
    goToView('home');
    registerServiceWorker();
  });

  function initTheme() {
    var saved = localStorage.getItem('dtkw_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  }

  function registerServiceWorker() {
    // Sekarang di-host statis (GitHub Pages/dll), jadi service worker
    // berjalan normal seperti PWA pada umumnya (tidak lagi terbatas
    // sandboxed iframe seperti waktu disajikan langsung dari GAS).
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    } catch (e) {}
  }

  // ================== NAVIGATION ==================
  function initNav() {
    // Semua elemen dengan atribut data-view (bottom nav, topbar icon, link "Lihat semua", dst)
    document.querySelectorAll('[data-view]').forEach(function (btn) {
      if (btn.dataset.view === '__input') return; // ditangani terpisah (FAB buka sheet input)
      btn.addEventListener('click', function () { goToView(btn.dataset.view); });
    });
  }

  // Diekspos ke window supaya bisa dipanggil dari inline onclick di Index.html
  window.__goReport = function () { goToView('report'); };
  window.__goBudget = function () { goToView('budget'); };

  function goToView(view) {
    state.view = view;
    document.querySelectorAll('.view').forEach(function (v) { v.classList.remove('active'); });
    var target = document.getElementById('view-' + view);
    if (target) target.classList.add('active');

    document.querySelectorAll('.nav-item[data-view]').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });

    if (view === 'home') loadHome();
    if (view === 'statistik') loadStatistik();
    if (view === 'riwayat') loadRiwayat();
    if (view === 'settings') loadSettingsView();
    if (view === 'report') loadReport();
    if (view === 'budget') loadBudget();
  }

  function bindStaticEvents() {
    document.getElementById('btn-open-input').addEventListener('click', function () { openInputSheet(); });
    document.getElementById('qa-expense').addEventListener('click', function () { openInputSheet('EXPENSE'); });
    document.getElementById('qa-income').addEventListener('click', function () { openInputSheet('INCOME'); });
    document.getElementById('qa-voice').addEventListener('click', function () { openVoiceSheet(); });

    document.getElementById('btn-close-input').addEventListener('click', closeInputSheet);
    document.getElementById('btn-close-voice').addEventListener('click', closeVoiceSheet);
    document.getElementById('btn-close-detail').addEventListener('click', closeDetailSheet);

    document.getElementById('toggle-expense').addEventListener('click', function () { setTxType('EXPENSE'); });
    document.getElementById('toggle-income').addEventListener('click', function () { setTxType('INCOME'); });

    document.getElementById('form-transaction').addEventListener('submit', onSubmitTransaction);

    document.getElementById('history-search').addEventListener('input', debounce(function (e) {
      state.historyFilter.keyword = e.target.value;
      renderHistoryList();
    }, 250));

    document.querySelectorAll('.filter-chip[data-type]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        document.querySelectorAll('.filter-chip[data-type]').forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        state.historyFilter.type = chip.dataset.type;
        renderHistoryList();
      });
    });

    document.getElementById('report-prev').addEventListener('click', function () { state.monthKey = shiftMonth(state.monthKey, -1); loadReport(); });
    document.getElementById('report-next').addEventListener('click', function () { state.monthKey = shiftMonth(state.monthKey, 1); loadReport(); });

    document.getElementById('btn-delete-tx').addEventListener('click', onDeleteTransaction);
    document.getElementById('btn-edit-tx').addEventListener('click', onEditTransaction);

    document.getElementById('btn-save-settings').addEventListener('click', onSaveSettings);
    document.getElementById('btn-seed-demo').addEventListener('click', onSeedDemo);
    document.getElementById('btn-reset-data').addEventListener('click', onResetData);
    document.getElementById('theme-select').addEventListener('change', function (e) {
      var val = e.target.value;
      var applied = val === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : val;
      document.documentElement.setAttribute('data-theme', applied);
      localStorage.setItem('dtkw_theme', val);
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () { var args = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, args); }, ms); };
  }

  // ================== TOAST ==================
  function toast(msg) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  // ================== CATEGORIES / SETTINGS ==================
  function loadCategories() {
    google.script.run.withSuccessHandler(function (cats) {
      state.categories = cats;
      renderCategoryGrid();
    }).withFailureHandler(onError).getCategories();
  }

  function loadSettings() {
    google.script.run.withSuccessHandler(function (s) {
      state.settings = s;
    }).withFailureHandler(onError).getSettings();
  }

  // ================== HOME ==================
  function loadHome() {
    setLoading('view-home-content', true);
    google.script.run.withSuccessHandler(function (data) {
      renderHome(data);
      setLoading('view-home-content', false);
    }).withFailureHandler(function (err) { onError(err); setLoading('view-home-content', false); })
      .getDashboardData(state.monthKey);
  }

  function renderHome(data) {
    document.getElementById('home-balance').textContent = formatRupiah(data.balance);
    document.getElementById('home-income').textContent = formatRupiah(data.totalIncome);
    document.getElementById('home-expense').textContent = formatRupiah(data.totalExpense);
    document.getElementById('home-month-label').textContent = data.monthLabel;

    var insightWrap = document.getElementById('home-insights');
    insightWrap.innerHTML = '';
    (data.insights || []).forEach(function (text) {
      var div = document.createElement('div');
      div.className = 'insight-item';
      div.textContent = text;
      insightWrap.appendChild(div);
    });

    renderTxList('home-recent-tx', data.recentTransactions, true);
  }

  // ================== RIWAYAT ==================
  function loadRiwayat() {
    setLoading('view-riwayat-content', true);
    google.script.run.withSuccessHandler(function (txs) {
      state.allTransactions = txs;
      renderHistoryList();
      setLoading('view-riwayat-content', false);
    }).withFailureHandler(function (err) { onError(err); setLoading('view-riwayat-content', false); })
      .getTransactions({});
  }

  function renderHistoryList() {
    var txs = (state.allTransactions || []).filter(function (t) {
      if (state.historyFilter.type !== 'ALL' && t.type !== state.historyFilter.type) return false;
      if (state.historyFilter.keyword) {
        var kw = state.historyFilter.keyword.toLowerCase();
        var hay = (t.note + ' ' + t.category + ' ' + t.paymentMethod).toLowerCase();
        if (hay.indexOf(kw) === -1) return false;
      }
      return true;
    });
    renderTxList('riwayat-list', txs, false);
  }

  function renderTxList(containerId, txs, compact) {
    var container = document.getElementById(containerId);
    container.innerHTML = '';
    if (!txs || !txs.length) {
      container.innerHTML = '<div class="empty-state"><div class="emoji">👀</div><div>Belum ada transaksi</div>' +
        '<div class="sub">Satu catatan dulu aja. Nanti lama-lama jadi tahu pola dompetmu.</div></div>';
      return;
    }
    txs.forEach(function (tx) {
      var item = document.createElement('div');
      item.className = 'tx-item';
      item.innerHTML =
        '<div class="tx-icon">' + (EMOJI[tx.category] || '💳') + '</div>' +
        '<div class="tx-info">' +
          '<div class="tx-title">' + escapeHtml(tx.note || tx.category) + '</div>' +
          '<div class="tx-sub">' + escapeHtml(tx.category) + ' • ' + escapeHtml(tx.paymentMethod) + '</div>' +
        '</div>' +
        '<div>' +
          '<div class="tx-amount ' + (tx.type === 'INCOME' ? 'income' : 'expense') + '">' +
            (tx.type === 'INCOME' ? '+' : '-') + formatRupiah(tx.amount) +
          '</div>' +
          '<div class="tx-date">' + escapeHtml(tx.date) + '</div>' +
        '</div>';
      item.addEventListener('click', function () { openDetailSheet(tx); });
      container.appendChild(item);
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  // ================== STATISTIK / DASHBOARD ==================
  function loadStatistik() {
    setLoading('view-statistik-content', true);
    google.script.run.withSuccessHandler(function (data) {
      renderStatistikSummary(data);
      loadCategoryChart();
      loadTrendChart();
      loadDailyChart();
      setLoading('view-statistik-content', false);
    }).withFailureHandler(function (err) { onError(err); setLoading('view-statistik-content', false); })
      .getDashboardData(state.monthKey);
  }

  function renderStatistikSummary(data) {
    document.getElementById('stat-balance').textContent = formatRupiah(data.balance);
    document.getElementById('stat-income').textContent = formatRupiah(data.totalIncome);
    document.getElementById('stat-expense').textContent = formatRupiah(data.totalExpense);
    document.getElementById('stat-saving-rate').textContent = data.savingRate + '%';
  }

  function loadCategoryChart() {
    google.script.run.withSuccessHandler(function (rows) {
      var ctx = document.getElementById('chart-category').getContext('2d');
      if (state.charts.category) state.charts.category.destroy();
      var palette = ['#0066FF','#0047B3','#20B26B','#FFB020','#EF5350','#7B8496','#4C9AFF','#00A9A5'];
      state.charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: rows.map(function (r) { return r.category; }),
          datasets: [{ data: rows.map(function (r) { return r.amount; }), backgroundColor: palette, borderWidth: 0 }]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } } }
      });
    }).withFailureHandler(onError).getCategorySummary(state.monthKey, 'EXPENSE');
  }

  function loadTrendChart() {
    google.script.run.withSuccessHandler(function (rows) {
      var ctx = document.getElementById('chart-trend').getContext('2d');
      if (state.charts.trend) state.charts.trend.destroy();
      state.charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
          labels: rows.map(function (r) { return r.monthLabel.substring(0, 3); }),
          datasets: [
            { label: 'Income', data: rows.map(function (r) { return r.income; }), borderColor: '#20B26B', tension: .3 },
            { label: 'Expense', data: rows.map(function (r) { return r.expense; }), borderColor: '#EF5350', tension: .3 },
            { label: 'Balance', data: rows.map(function (r) { return r.balance; }), borderColor: '#0066FF', tension: .3 }
          ]
        },
        options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }, scales: { y: { ticks: { font: { size: 9 } } }, x: { ticks: { font: { size: 9 } } } } }
      });
    }).withFailureHandler(onError).getSixMonthTrend();
  }

  function loadDailyChart() {
    google.script.run.withSuccessHandler(function (rows) {
      var ctx = document.getElementById('chart-daily').getContext('2d');
      if (state.charts.daily) state.charts.daily.destroy();
      state.charts.daily = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: rows.map(function (r) { return r.date.split('/')[0]; }),
          datasets: [{ label: 'Pengeluaran', data: rows.map(function (r) { return r.expense; }), backgroundColor: '#0066FF' }]
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { ticks: { font: { size: 9 } } }, x: { ticks: { font: { size: 9 } } } } }
      });
    }).withFailureHandler(onError).getDailyCashflow(state.monthKey);
  }

  // ================== REPORT (REKAP BULANAN) ==================
  function loadReport() {
    document.getElementById('report-month-label').textContent = monthLabel(state.monthKey);
    setLoading('view-report-content', true);
    google.script.run.withSuccessHandler(function (summary) {
      renderReport(summary);
      setLoading('view-report-content', false);
    }).withFailureHandler(function (err) { onError(err); setLoading('view-report-content', false); })
      .getMonthlySummary(state.monthKey);
  }

  function renderReport(s) {
    document.getElementById('report-income').textContent = formatRupiah(s.totalIncome);
    document.getElementById('report-expense').textContent = formatRupiah(s.totalExpense);
    document.getElementById('report-balance').textContent = formatRupiah(s.balance);
    document.getElementById('report-saving-rate').textContent = s.savingRate + '%';

    var topList = document.getElementById('report-top-expenses');
    topList.innerHTML = '';
    if (!s.topExpenses.length) {
      topList.innerHTML = '<div class="empty-state"><div class="sub">Belum ada pengeluaran bulan ini.</div></div>';
    } else {
      s.topExpenses.forEach(function (t, i) {
        var row = document.createElement('div');
        row.className = 'tx-item';
        row.innerHTML = '<div class="tx-icon">' + (EMOJI[t.category] || '💳') + '</div>' +
          '<div class="tx-info"><div class="tx-title">' + (i + 1) + '. ' + escapeHtml(t.category) + '</div></div>' +
          '<div class="tx-amount expense">' + formatRupiah(t.amount) + '</div>';
        topList.appendChild(row);
      });
    }

    var cmp = s.comparison;
    var cmpWrap = document.getElementById('report-comparison');
    cmpWrap.innerHTML =
      '<div class="settings-row"><span>' + escapeHtml(s.monthLabel) + '</span><b>Income ' + formatRupiah(s.totalIncome) + '</b></div>' +
      '<div class="settings-row"><span>' + escapeHtml(cmp.prevMonthLabel) + '</span><b>Income ' + formatRupiah(cmp.prevIncome) + '</b></div>' +
      '<div class="settings-row"><span>' + escapeHtml(s.monthLabel) + '</span><b>Expense ' + formatRupiah(s.totalExpense) + '</b></div>' +
      '<div class="settings-row"><span>' + escapeHtml(cmp.prevMonthLabel) + '</span><b>Expense ' + formatRupiah(cmp.prevExpense) + '</b></div>' +
      (cmp.expenseChangePct !== null ? '<div class="insight-item">Pengeluaran ' + (cmp.expenseChangePct >= 0 ? 'naik' : 'turun') + ' ' + Math.abs(cmp.expenseChangePct) + '% dibanding bulan lalu.</div>' : '');
  }

  // ================== BUDGET ==================
  function loadBudget() {
    setLoading('view-budget-content', true);
    google.script.run.withSuccessHandler(function (rows) {
      renderBudget(rows);
      setLoading('view-budget-content', false);
    }).withFailureHandler(function (err) { onError(err); setLoading('view-budget-content', false); })
      .getBudgetData(state.monthKey);
  }

  function renderBudget(rows) {
    var wrap = document.getElementById('budget-list');
    wrap.innerHTML = '';
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><div class="emoji">🎯</div><div>Belum ada budget</div><div class="sub">Atur budget kategori di bawah ini.</div></div>';
    }
    rows.forEach(function (b) {
      var pct = Math.min(b.percentageUsed, 100);
      var cls = b.status === 'OVER BUDGET' ? 'over' : (b.status === 'WARNING' ? 'warning' : '');
      var statusText = b.status === 'OVER BUDGET' ? 'Budget jebol 😭' : (b.status === 'WARNING' ? 'Udah mendekati limit 👀' : 'Masih aman 👍');
      var div = document.createElement('div');
      div.className = 'card budget-item';
      div.innerHTML =
        '<div class="budget-head"><span class="cat">' + (EMOJI[b.category] || '💳') + ' ' + escapeHtml(b.category) + '</span><span>' + formatRupiah(b.actual) + ' / ' + formatRupiah(b.budget) + '</span></div>' +
        '<div class="progress-bar"><div class="progress-fill ' + cls + '" style="width:' + pct + '%"></div></div>' +
        '<div class="budget-status">' + statusText + '</div>';
      wrap.appendChild(div);
    });

    var catSelect = document.getElementById('budget-category-select');
    catSelect.innerHTML = state.categories.EXPENSE.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = document.getElementById('form-budget');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var category = document.getElementById('budget-category-select').value;
        var amount = document.getElementById('budget-amount-input').value;
        if (!amount || Number(amount) <= 0) { toast('Isi nominal budget dulu ya'); return; }
        google.script.run.withSuccessHandler(function (rows) {
          renderBudget(rows);
          toast('Budget disimpan ✨');
          document.getElementById('budget-amount-input').value = '';
        }).withFailureHandler(onError).saveBudget(state.monthKey, category, Number(amount));
      });
    }
  });

  // ================== INPUT TRANSAKSI ==================
  function openInputSheet(type) {
    state.editingId = null;
    document.getElementById('input-sheet-title').textContent = 'Catat Transaksi';
    document.getElementById('form-transaction').reset();
    document.getElementById('input-date').value = todayISO();
    document.getElementById('input-time').value = nowHM();
    setTxType(type || 'EXPENSE');
    state.selectedCategory = null;
    renderCategoryGrid();
    document.getElementById('sheet-input').classList.add('open');
  }

  function closeInputSheet() {
    document.getElementById('sheet-input').classList.remove('open');
  }

  function setTxType(type) {
    state.txType = type;
    document.getElementById('toggle-expense').classList.toggle('active', type === 'EXPENSE');
    document.getElementById('toggle-expense').classList.toggle('expense', type === 'EXPENSE');
    document.getElementById('toggle-income').classList.toggle('active', type === 'INCOME');
    document.getElementById('toggle-income').classList.toggle('income', type === 'INCOME');
    state.selectedCategory = null;
    renderCategoryGrid();
  }

  function renderCategoryGrid() {
    var grid = document.getElementById('category-grid');
    grid.innerHTML = '';
    var list = state.categories[state.txType] || [];
    list.forEach(function (cat) {
      var chip = document.createElement('div');
      chip.className = 'category-chip' + (state.selectedCategory === cat ? ' selected' : '');
      chip.innerHTML = '<span class="emoji">' + (EMOJI[cat] || '💳') + '</span>' + cat;
      chip.addEventListener('click', function () {
        state.selectedCategory = cat;
        renderCategoryGrid();
      });
      grid.appendChild(chip);
    });
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nowHM() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function isoToDMY(iso) {
    var p = iso.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function onSubmitTransaction(e) {
    e.preventDefault();
    if (!state.selectedCategory) { toast('Pilih kategori dulu ya'); return; }
    var amount = document.getElementById('input-amount').value;
    if (!amount || Number(amount) <= 0) { toast('Nominal harus lebih dari 0'); return; }

    var data = {
      type: state.txType,
      category: state.selectedCategory,
      amount: Number(amount),
      note: document.getElementById('input-note').value,
      paymentMethod: document.getElementById('input-payment').value,
      date: isoToDMY(document.getElementById('input-date').value),
      time: document.getElementById('input-time').value,
      source: state.editingId ? undefined : 'Manual'
    };

    var btn = document.getElementById('btn-save-transaction');
    btn.disabled = true;

    var handleSuccess = function () {
      btn.disabled = false;
      closeInputSheet();
      toast(state.editingId ? 'Transaksi diupdate ✨' : 'Yap, udah kecatat ✨');
      state.editingId = null;
      if (state.view === 'home') loadHome();
      if (state.view === 'riwayat') loadRiwayat();
    };
    var handleFail = function (err) { btn.disabled = false; onError(err); };

    if (state.editingId) {
      google.script.run.withSuccessHandler(handleSuccess).withFailureHandler(handleFail).updateTransaction(state.editingId, data);
    } else {
      google.script.run.withSuccessHandler(handleSuccess).withFailureHandler(handleFail).addTransaction(data);
    }
  }

  // ================== DETAIL TRANSAKSI ==================
  var currentDetailTx = null;

  function openDetailSheet(tx) {
    currentDetailTx = tx;
    var body = document.getElementById('detail-body');
    body.innerHTML =
      '<div style="text-align:center;margin-bottom:16px;">' +
        '<div style="font-size:28px;font-weight:800;color:' + (tx.type === 'INCOME' ? 'var(--success)' : 'var(--danger)') + '">' +
        (tx.type === 'INCOME' ? '+' : '-') + formatRupiah(tx.amount) + '</div>' +
        '<div style="color:var(--muted);font-size:13px;">' + escapeHtml(tx.category) + '</div>' +
      '</div>' +
      detailRow('Catatan', tx.note || '-') +
      detailRow('Tanggal', tx.date) +
      detailRow('Jam', tx.time) +
      detailRow('Metode', tx.paymentMethod) +
      detailRow('Sumber', tx.source);
    document.getElementById('sheet-detail').classList.add('open');
  }

  function detailRow(label, value) {
    return '<div class="settings-row"><span style="color:var(--muted)">' + label + '</span><b>' + escapeHtml(value) + '</b></div>';
  }

  function closeDetailSheet() {
    document.getElementById('sheet-detail').classList.remove('open');
  }

  function onDeleteTransaction() {
    if (!currentDetailTx) return;
    if (!confirm('Transaksi ini bakal dihapus. Lanjut?')) return;
    google.script.run.withSuccessHandler(function () {
      closeDetailSheet();
      toast('Transaksi dihapus');
      if (state.view === 'home') loadHome();
      if (state.view === 'riwayat') loadRiwayat();
    }).withFailureHandler(onError).deleteTransaction(currentDetailTx.id);
  }

  function onEditTransaction() {
    if (!currentDetailTx) return;
    var tx = currentDetailTx;
    closeDetailSheet();
    state.editingId = tx.id;
    document.getElementById('input-sheet-title').textContent = 'Edit Transaksi';
    setTxType(tx.type);
    state.selectedCategory = tx.category;
    renderCategoryGrid();
    document.getElementById('input-amount').value = tx.amount;
    document.getElementById('input-note').value = tx.note;
    document.getElementById('input-payment').value = tx.paymentMethod;
    var p = tx.date.split('/');
    document.getElementById('input-date').value = p[2] + '-' + p[1] + '-' + p[0];
    document.getElementById('input-time').value = tx.time;
    document.getElementById('sheet-input').classList.add('open');
  }

  // ================== VOICE INPUT ==================
  function initVoice() {
    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    var rec = new SpeechRecognition();
    rec.lang = 'id-ID';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = function (event) {
      var transcript = event.results[0][0].transcript;
      document.getElementById('voice-transcript').textContent = '"' + transcript + '"';
      parseVoice(transcript);
    };
    rec.onend = function () {
      document.getElementById('voice-btn').classList.remove('listening');
    };
    rec.onerror = function () {
      document.getElementById('voice-btn').classList.remove('listening');
      toast('Gagal menangkap suara, coba lagi ya');
    };
    state.recognition = rec;
  }

  function openVoiceSheet() {
    document.getElementById('voice-transcript').textContent = '';
    document.getElementById('voice-preview').style.display = 'none';
    document.getElementById('sheet-voice').classList.add('open');
    if (!state.recognition) {
      document.getElementById('voice-hint').textContent = 'Browser kamu belum support voice input. Coba Chrome ya 🎙️';
      document.getElementById('voice-btn').style.display = 'none';
    } else {
      document.getElementById('voice-hint').textContent = 'Ketuk mic lalu ucapkan transaksimu. Contoh: "Makan siang 25 ribu pakai QRIS"';
      document.getElementById('voice-btn').style.display = 'flex';
    }
  }

  function closeVoiceSheet() {
    document.getElementById('sheet-voice').classList.remove('open');
    if (state.recognition) { try { state.recognition.stop(); } catch (e) {} }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var micBtn = document.getElementById('voice-btn');
    if (micBtn) {
      micBtn.addEventListener('click', function () {
        if (!state.recognition) return;
        micBtn.classList.add('listening');
        document.getElementById('voice-preview').style.display = 'none';
        try { state.recognition.start(); } catch (e) {}
      });
    }
    var saveVoiceBtn = document.getElementById('btn-save-voice-tx');
    if (saveVoiceBtn) saveVoiceBtn.addEventListener('click', onSaveVoiceTransaction);
    var editVoiceBtn = document.getElementById('btn-edit-voice-tx');
    if (editVoiceBtn) editVoiceBtn.addEventListener('click', function () {
      closeVoiceSheet();
      var parsed = state.voiceParsedResult;
      if (!parsed) { openInputSheet(); return; }
      openInputSheet(parsed.type);
      state.selectedCategory = parsed.category;
      renderCategoryGrid();
      document.getElementById('input-amount').value = parsed.amount;
      document.getElementById('input-note').value = parsed.note;
      document.getElementById('input-payment').value = parsed.paymentMethod;
    });
  });

  function parseVoice(transcript) {
    google.script.run.withSuccessHandler(function (parsed) {
      state.voiceParsedResult = parsed;
      renderVoicePreview(parsed);
    }).withFailureHandler(function (err) {
      onError(err);
    }).parseVoiceText(transcript);
  }

  function renderVoicePreview(parsed) {
    var wrap = document.getElementById('voice-preview');
    wrap.style.display = 'block';
    wrap.innerHTML =
      '<div class="card">' +
        '<div style="text-align:center;font-size:12px;color:var(--muted);margin-bottom:8px;">Aku nangkepnya:</div>' +
        '<div style="text-align:center;font-size:24px;font-weight:800;color:' + (parsed.type === 'INCOME' ? 'var(--success)' : 'var(--danger)') + '">' +
          formatRupiah(parsed.amount) + '</div>' +
        '<div style="text-align:center;font-size:13px;color:var(--muted);margin-top:4px;">' +
          (parsed.type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran') + ' • ' + escapeHtml(parsed.category) + ' • ' + escapeHtml(parsed.paymentMethod) +
        '</div>' +
        '<div style="text-align:center;font-size:12.5px;margin-top:8px;color:var(--text);">"' + escapeHtml(parsed.note) + '"</div>' +
      '</div>';
  }

  function onSaveVoiceTransaction() {
    var parsed = state.voiceParsedResult;
    if (!parsed) { toast('Belum ada hasil suara'); return; }
    google.script.run.withSuccessHandler(function () {
      closeVoiceSheet();
      toast('Yap, udah kecatat ✨');
      if (state.view === 'home') loadHome();
      if (state.view === 'riwayat') loadRiwayat();
    }).withFailureHandler(onError).addTransaction(parsed);
  }

  // ================== SETTINGS ==================
  function loadSettingsView() {
    google.script.run.withSuccessHandler(function (s) {
      state.settings = s;
      document.getElementById('settings-nama').value = s.nama || '';
      document.getElementById('settings-target').value = s.targetTabungan || 0;
      document.getElementById('settings-budget-default').value = s.budgetBulanan || 0;
      document.getElementById('theme-select').value = localStorage.getItem('dtkw_theme') || 'light';
    }).withFailureHandler(onError).getSettings();
  }

  function onSaveSettings() {
    var data = {
      nama: document.getElementById('settings-nama').value,
      targetTabungan: Number(document.getElementById('settings-target').value) || 0,
      budgetBulanan: Number(document.getElementById('settings-budget-default').value) || 0
    };
    google.script.run.withSuccessHandler(function () {
      toast('Pengaturan disimpan ✨');
    }).withFailureHandler(onError).saveSettings(data);
  }

  function onSeedDemo() {
    google.script.run.withSuccessHandler(function (res) {
      toast(res.message);
      if (state.view === 'home') loadHome();
    }).withFailureHandler(onError).seedDemoData();
  }

  function onResetData() {
    if (!confirm('Semua data transaksi akan dihapus permanen. Lanjut?')) return;
    google.script.run.withSuccessHandler(function (res) {
      toast(res.message);
      loadHome();
    }).withFailureHandler(onError).resetAllTransactions();
  }

  // ================== UTIL ==================
  function setLoading(containerId, isLoading) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.style.opacity = isLoading ? 0.4 : 1;
  }

  function onError(err) {
    console.error(err);
    toast(typeof err === 'string' ? err : 'Hmm, ada sedikit masalah. Coba lagi ya.');
  }

})();
